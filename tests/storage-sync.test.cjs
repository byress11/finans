const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, profile, transaction, backup } = require('./helpers.cjs');

test('legacy empty dates survive restore and cloud pull without blocking later records', async t => {
    const a = await setup(); t.after(a.dispose);
    const undated = { ...transaction, id: 'undated', date: '' };
    const input = { ...backup(), transactions: [undated, transaction] };
    await a.DBManager.replaceAll(input);
    assert.equal((await a.DBManager.get('transactions', 'undated')).date, '');
    await a.FirebaseSync.runSyncCycle({ silent: true });
    assert.equal(a.FirebaseSync.db.records.get('users/alice/transactions/undated').date, '');
    await a.DBManager.init('fresh-device');
    await a.FirebaseSync.pull(a.FirebaseSync.context());
    assert.equal((await a.DBManager.getAll('transactions')).length, 2);
    assert.equal((await a.DBManager.get('transactions', 'undated')).date, '');
    assert.throws(() => a.DataSafety.record('transactions', { ...transaction, date: 'bad-date' }));
    assert.throws(() => a.DataSafety.record('transactions', { ...transaction, date: null }));
});

test('write and durable queue commit together; failed writes roll both back', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('transactions', { ...transaction });
    const pending = await a.DBManager.getAll('pendingSync');
    assert.equal(pending.length, 1);
    await assert.rejects(a.DBManager.add('transactions', { ...transaction, amount: 99 }));
    assert.equal((await a.DBManager.get('transactions', 't')).amount, 12);
    assert.equal((await a.DBManager.getAll('pendingSync'))[0].token, pending[0].token);
});

test('aborted transaction never reports success or saves partial records', async t => {
    const a = await setup(); t.after(a.dispose);
    await assert.rejects(a.DBManager.transaction(['profiles'], 'readwrite', (tx, done) => {
        const req = tx.objectStore('profiles').add(profile);
        req.onsuccess = () => { done('request succeeded'); tx.abort(); };
    }));
    assert.equal((await a.DBManager.getAll('profiles')).length, 0);
});

test('malformed or duplicate backups leave existing data and queue unchanged', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('profiles', { ...profile });
    const token = (await a.DBManager.getAll('pendingSync'))[0].token;
    for (const invalid of [{ ...backup(), profiles: [profile, profile] }, { ...backup(), transactions: [{ ...transaction, amount: -1 }] }, { ...backup(), profiles: [] }, { ...backup(), notes: 'invalid' }]) {
        await assert.rejects(a.DBManager.replaceAll(invalid));
    }
    assert.equal((await a.DBManager.getAll('profiles')).length, 1);
    assert.equal((await a.DBManager.getAll('pendingSync'))[0].token, token);
});

test('replacement is atomic even if a store write aborts after old data is cleared', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('profiles', { ...profile });
    const originalQueue = a.DBManager.queue;
    a.DBManager.queue = function (tx, ...args) { originalQueue.call(this, tx, ...args); tx.abort(); };
    await assert.rejects(a.DBManager.replaceAll(backup()));
    assert.equal((await a.DBManager.get('profiles', 'p')).name, 'Personal');
    assert.equal((await a.DBManager.getAll('transactions')).length, 0);
});

test('separate accounts and guest keep independent records and queues', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('transactions', { ...transaction });
    await a.DBManager.init('bob');
    assert.equal((await a.DBManager.getAll('transactions')).length, 0);
    assert.equal((await a.DBManager.getAll('pendingSync')).length, 0);
    await a.DBManager.init('guest');
    assert.equal((await a.DBManager.getAll('transactions')).length, 0);
    await a.DBManager.init('alice');
    assert.equal((await a.DBManager.getAll('transactions')).length, 1);
    assert.equal((await a.DBManager.getAll('pendingSync')).length, 1);
});

test('missing cloud record and older cloud data cannot erase a queued local edit', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('transactions', { ...transaction, amount: 99 });
    await a.FirebaseSync.pull(a.FirebaseSync.context());
    assert.equal((await a.DBManager.get('transactions', 't')).amount, 99);
    a.FirebaseSync.db.records.set('users/alice/transactions/t', { ...transaction, amount: 10 });
    await a.FirebaseSync.pull(a.FirebaseSync.context());
    assert.equal((await a.DBManager.get('transactions', 't')).amount, 99);
});

test('offline queue survives reopen and successful retry acknowledges only committed changes', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('transactions', { ...transaction });
    a.FirebaseSync.db.fail = true;
    assert.equal(await a.FirebaseSync.runSyncCycle({ silent: true }), false);
    await a.DBManager.init('bob'); await a.DBManager.init('alice');
    assert.equal((await a.DBManager.getAll('pendingSync')).length, 1);
    a.FirebaseSync.db.fail = false;
    assert.equal(await a.FirebaseSync.runSyncCycle({ silent: true }), true);
    assert.equal((await a.DBManager.getAll('pendingSync')).length, 0);
    assert.equal(a.FirebaseSync.db.records.get('users/alice/transactions/t').amount, 12);
});

test('an edit made during upload stays queued and is rebased on the acknowledged revision', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('transactions', { ...transaction });
    a.FirebaseSync.db.beforeCommit = () => a.DBManager.put('transactions', { ...transaction, amount: 50 });
    await a.FirebaseSync.runSyncCycle({ silent: true });
    assert.equal((await a.DBManager.get('transactions', 't')).amount, 50);
    assert.equal((await a.DBManager.getAll('pendingSync')).length, 1);
    await a.FirebaseSync.runSyncCycle({ silent: true });
    assert.equal(a.FirebaseSync.db.records.get('users/alice/transactions/t').amount, 50);
    assert.equal((await a.DBManager.getAll('pendingSync')).length, 0);
});

test('concurrent remote edits produce a preserved conflict instead of silent overwrite', async t => {
    const a = await setup(); t.after(a.dispose);
    const key = 'users/alice/transactions/t';
    a.FirebaseSync.db.records.set(key, { ...transaction });
    await a.FirebaseSync.pull(a.FirebaseSync.context());
    await a.DBManager.put('transactions', { ...transaction, amount: 99 });
    a.FirebaseSync.db.records.set(key, { ...transaction, amount: 55 });
    await a.FirebaseSync.runSyncCycle({ silent: true });
    assert.equal((await a.DBManager.get('transactions', 't')).amount, 99);
    assert.equal(a.FirebaseSync.db.records.get(key).amount, 55);
    assert.equal((await a.DBManager.getAll('pendingSync'))[0].conflict.record.amount, 55);
    await a.FirebaseSync.resolveConflict('transactions:t', 'cloud');
    assert.equal((await a.DBManager.get('transactions', 't')).amount, 55);
});

test('synced deletion followed by undo removes tombstone without deleting restored record', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('transactions', { ...transaction });
    await a.FirebaseSync.runSyncCycle({ silent: true });
    await a.DBManager.delete('transactions', 't');
    await a.FirebaseSync.runSyncCycle({ silent: true });
    assert(a.FirebaseSync.db.records.has('users/alice/deletions/transactions:t'));
    await a.DBManager.add('transactions', { ...transaction });
    await a.FirebaseSync.runSyncCycle({ silent: true });
    assert(!a.FirebaseSync.db.records.has('users/alice/deletions/transactions:t'));
    assert.equal((await a.DBManager.get('transactions', 't')).amount, 12);
});

test('pending delete protects against stale cloud resurrection; explicit remote deletion works', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.applyRemote('transactions', 't', transaction, null);
    await a.DBManager.delete('transactions', 't');
    assert.equal(await a.DBManager.applyRemote('transactions', 't', transaction, null), false);
    assert.equal(await a.DBManager.get('transactions', 't'), undefined);
    await a.DBManager.applyRemote('transactions', 'other', { ...transaction, id: 'other' }, null);
    await a.DBManager.applyRemote('transactions', 'other', null, { store: 'transactions', id: 'other' });
    assert.equal(await a.DBManager.get('transactions', 'other'), undefined);
});

test('stale account work never writes into the next account', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('transactions', { ...transaction });
    a.FirebaseSync.db.beforeCommit = async () => {
        a.FirebaseSync.epoch++;
        a.FirebaseSync.currentUser = { uid: 'bob' };
        await a.DBManager.init('bob');
    };
    await a.FirebaseSync.runSyncCycle({ silent: true });
    assert.equal((await a.DBManager.getAll('transactions')).length, 0);
    assert(!a.FirebaseSync.db.records.has('users/bob/transactions/t'));
    await a.DBManager.init('alice');
    assert.equal((await a.DBManager.getAll('pendingSync')).length, 1);
});

test('backup recovery snapshot does not recursively grow inside successive exports', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.BackupService.restore(backup());
    await a.BackupService.restore(backup());
    const exported = await a.BackupService.exportAll();
    assert.equal(exported.settings.length, 0);
    assert((await a.DBManager.get('settings', 'recoveryBackup')).value.profiles.length);
});

test('rich text sanitizer removes executable markup but preserves formatting', async t => {
    const a = await setup(); t.after(a.dispose);
    const clean = a.DataSafety.html('<b>Safe</b><img src=x onerror=alert(1)><a href="javascript:alert(1)">Link</a><svg onload=alert(1)></svg>');
    assert(clean.includes('<b>Safe</b>'));
    assert(!/onerror|onload|javascript:|<img|<svg/.test(clean));
    const note = a.DataSafety.record('notes', { id: 'n', content: '<script>alert(1)</script><p>Text</p>' });
    assert.equal(note.content, '<p>Text</p>');
});

test('auth callbacks switch account storage and logout returns to preserved guest data', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.add('transactions', { ...transaction });
    const db = a.FirebaseSync.db;
    let authListener;
    const auth = {
        onAuthStateChanged(listener) { authListener = listener; queueMicrotask(() => listener({ uid: 'alice' })); },
        async signInWithEmailAndPassword() { authListener({ uid: 'bob' }); },
        async signOut() { authListener(null); }
    };
    a.setGlobal('FirebaseConfig', {});
    a.setGlobal('firebase', { initializeApp() {}, firestore: () => db, auth: () => auth });
    assert.equal(await a.FirebaseSync.init(), true);
    assert.equal(a.DBManager.scope, 'alice');
    await a.FirebaseSync.signIn('bob@example.test', 'password');
    assert.equal(a.DBManager.scope, 'bob');
    assert.equal((await a.DBManager.getAll('transactions')).length, 0);
    await a.FirebaseSync.signOut();
    assert.equal(a.DBManager.scope, 'guest');
    assert.equal(a.FirebaseSync.syncEnabled, false);
    await a.DBManager.init('alice');
    assert.equal((await a.DBManager.getAll('transactions')).length, 1);
});
