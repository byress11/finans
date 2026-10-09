const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const { setup, transaction, profile, backup } = require('./helpers.cjs');

test('actual HTML and script order initialize offline and render all main screens', async t => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'http://localhost', runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    await new Promise(resolve => dom.window.addEventListener('load', resolve));
    dom.window.indexedDB = new IDBFactory();
    dom.window.scrollTo = () => {};
    const errors = [];
    dom.window.console = { log() {}, warn() {}, error(...args) { errors.push(args.map(String).join(' ')); } };
    const context = dom.getInternalVMContext();
    for (const script of dom.window.document.querySelectorAll('script[src]')) {
        const src = script.getAttribute('src');
        if (!src.startsWith('js/')) continue;
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', src), 'utf8'), context, { filename: src });
    }
    await vm.runInContext('initApp()', context);
    await assert.rejects(vm.runInContext("TransactionManager.add({ type: 'expense', amount: 10, date: '' })", context), /tarih gerekli/);
    assert.equal(vm.runInContext('AppState.profiles.length', context), 1);
    assert.equal(vm.runInContext('FirebaseSync.appReady', context), true);
    for (const page of ['transactions', 'categories', 'debts', 'investments', 'bills', 'notes', 'reports', 'sync', 'settings', 'dashboard']) {
        vm.runInContext(`navigateTo('${page}')`, context);
    }
    assert.deepEqual(errors, []);
    assert(!vm.runInContext('Utils.iconHTML(\'bi:x" onmouseover="alert(1)\')', context).includes('onmouseover'));
    // Loading a different profile must reset undo/redo.
    await vm.runInContext("DBManager.add('profiles', { id:'second', name:'Second', currency:'TRY' })", context);
    vm.runInContext("AppState.profiles.push({ id:'second', name:'Second', currency:'TRY' }); TransactionManager.undoStack.push({ action:'delete', transaction:{id:'old'} }); TransactionManager.redoStack.push({});", context);
    await vm.runInContext("ProfileManager.completeSwitchProfile('second')", context);
    assert.equal(vm.runInContext('TransactionManager.undoStack.length + TransactionManager.redoStack.length', context), 0);
    vm.runInContext('DBManager.db.close()', context);
});

test('calendar recurrence preserves anchor day through short months and leap years', async t => {
    const a = await setup(); t.after(a.dispose);
    a.eval("Utils.formatDateInput = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');");
    const { BillManager } = a.loadModules();
    assert.equal(BillManager.calculateNextDueDate({ dueDate: '2026-01-31', frequency: 'monthly' }), '2026-02-28');
    assert.equal(BillManager.calculateNextDueDate({ dueDate: '2026-02-28', anchorDay: 31, frequency: 'monthly' }), '2026-03-31');
    assert.equal(BillManager.calculateNextDueDate({ dueDate: '2024-02-29', frequency: 'yearly' }), '2025-02-28');
    assert.equal(BillManager.calculateNextDueDate({ dueDate: '2026-12-31', frequency: 'custom', customDays: 2 }), '2027-01-02');
    assert.throws(() => BillManager.calculateNextDueDate({ dueDate: '2026-12-31', frequency: 'custom', customDays: -1 }));
});

test('invalid debt payments leave memory and database unchanged', async t => {
    const a = await setup(); t.after(a.dispose);
    a.eval("const AppState = { debts: [{ id:'d', amount:100, remainingAmount:100, payments:[] }] }; const DataManager = {updateBadges(){}};");
    const { DebtManager } = a.loadModules();
    for (const value of [0, -5, NaN, Infinity, 101]) await assert.rejects(DebtManager.addPayment('d', value));
    assert.equal(a.eval('AppState.debts[0].remainingAmount'), 100);
    assert.equal((await a.DBManager.getAll('debts')).length, 0);
    await DebtManager.addPayment('d', 40);
    assert.equal((await a.DBManager.get('debts', 'd')).remainingAmount, 60);
    assert((await a.DBManager.get('debts', 'd')).updatedAt);
});

test('profile deletion queues dependent records without deleting shared bills', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.replaceAll({ ...backup(), bills: [{ id: 'bill', name: 'Shared' }] });
    await a.DBManager.deleteProfile('p');
    assert.equal((await a.DBManager.getAll('profiles')).length, 0);
    assert.equal((await a.DBManager.getAll('transactions')).length, 0);
    assert.equal((await a.DBManager.getAll('bills')).length, 1);
    assert.equal((await a.DBManager.get('pendingSync', 'transactions:t')).operation, 'delete');
});

test('choosing cloud absence during a conflict deletes the local item and preserves a recovery copy', async t => {
    const a = await setup(); t.after(a.dispose);
    await a.DBManager.applyRemote('transactions', 't', transaction, null);
    await a.DBManager.put('transactions', { ...transaction, amount: 99 });
    await a.FirebaseSync.runSyncCycle({ silent: true });
    assert((await a.DBManager.get('pendingSync', 'transactions:t')).conflict);
    await a.FirebaseSync.resolveConflict('transactions:t', 'cloud');
    assert.equal(await a.DBManager.get('transactions', 't'), undefined);
    assert((await a.DBManager.getAll('settings')).some(s => s.key.startsWith('conflictBackup:')));
});

test('bundled PWA manifest covers every local script and stylesheet', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const serviceWorker = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
    const dom = new JSDOM(html);
    for (const el of dom.window.document.querySelectorAll('script[src],link[rel="stylesheet"]')) {
        const ref = el.getAttribute('src') || el.getAttribute('href');
        if (!ref.startsWith('http')) assert(serviceWorker.includes(`'./${ref}'`), ref);
    }
    dom.window.close();
});
