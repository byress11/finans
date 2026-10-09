const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, profile, transaction } = require('./helpers.cjs');

test('cloud inspection includes invalid legacy records and September without writing any data', async t => {
    const a = await setup(); t.after(a.dispose);
    a.eval("document.body.innerHTML = '<div id=cloudInspection></div>'");
    const old = { ...transaction, id: 'legacy', type: 'legacy-type', date: '2026-09-20' };
    a.FirebaseSync.db.records.set('users/alice/profiles/p', profile);
    a.FirebaseSync.db.records.set('users/alice/transactions/legacy', old);
    a.FirebaseSync.db.records.set('users/alice/transactions/new', { ...transaction, id: 'new' });
    const before = JSON.stringify([...a.FirebaseSync.db.records]);
    await a.FirebaseSync.inspectCloud();
    const text = a.eval("document.getElementById('cloudInspection').textContent");
    assert.match(text, /2026-09: 1/);
    assert.match(text, /İşlem: 2/);
    assert.match(text, /uymayan kayıt: 1/);
    assert.match(text, /legacy: Geçersiz işlem/);
    assert.equal(JSON.stringify([...a.FirebaseSync.db.records]), before);
    assert.equal((await a.DBManager.getAll('transactions')).length, 0);
    assert.equal((await a.DBManager.getAll('pendingSync')).length, 0);
});

test('an old account inspection cannot expose its results after account changes', async t => {
    const a = await setup(); t.after(a.dispose);
    a.eval("document.body.innerHTML = '<div id=cloudInspection></div>'");
    let finish;
    a.FirebaseSync.fetchCloud = () => new Promise(resolve => { finish = resolve; });
    const inspecting = a.FirebaseSync.inspectCloud();
    a.FirebaseSync.epoch++;
    a.FirebaseSync.currentUser = { uid: 'bob' };
    a.eval("document.getElementById('cloudInspection').replaceChildren()");
    finish({});
    await inspecting;
    assert.equal(a.eval("document.getElementById('cloudInspection').textContent"), '');
});
