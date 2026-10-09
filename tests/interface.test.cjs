const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

async function ui(t) {
    const root = path.join(__dirname, '..');
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'http://localhost', runScripts: 'outside-only' });
    await new Promise(resolve => dom.window.addEventListener('load', resolve));
    dom.window.indexedDB = new IDBFactory(); dom.window.scrollTo = () => {};
    dom.window.console = { log() {}, warn() {}, error() {} };
    const context = dom.getInternalVMContext();
    for (const script of dom.window.document.querySelectorAll('script[src^="js/"]')) vm.runInContext(fs.readFileSync(path.join(root, script.getAttribute('src')), 'utf8'), context);
    const run = code => vm.runInContext(code, context);
    await run('initApp()');
    t.after(async () => { await run('FirebaseSync.updateStatus()'); run('DBManager.db.close()'); dom.window.close(); });
    return { run, document: dom.window.document };
}

test('period shortcuts reveal older and undated records; profile buttons follow active profile', async t => {
    const { run, document } = await ui(t);
    run("navigateTo('transactions'); AppState.transactions = [{id:'old',date:'2020-01-01',amount:10,type:'expense'}, {id:'unknown',date:'',amount:5,type:'expense'}]; AppUX.setPeriod('current')");
    assert.match(document.getElementById('allTransactionsListContent').textContent, /Seçili ayda işlem yok/);
    run("AppUX.setPeriod('all')");
    assert.match(document.getElementById('transactionCount').textContent, /2 işlem/);
    assert.match(document.getElementById('allTransactionsListContent').textContent, /Tarihi belirtilmemiş/);
    assert.equal(document.querySelector('[data-period="all"]').getAttribute('aria-pressed'), 'true');
    await run("DBManager.add('profiles', {id:'work',name:'Office',currency:'TRY'}); AppState.profiles.push({id:'work',name:'Office',currency:'TRY'}); ProfileManager.completeSwitchProfile('work')");
    assert.equal(document.querySelector('.profile-chip[aria-pressed="true"]').textContent, 'Office');
    assert.match(document.getElementById('quickProfileLabel').textContent, /Office/);
});

test('save feedback prevents duplicate submission and retains form after failure', async t => {
    const { run, document } = await ui(t);
    run("openQuickAdd(); document.getElementById('quickDescription').value='keep me'; window.calls=0; window.release=null");
    const saving = run("AppUX.save(document.getElementById('qaSaveBtn'), () => { window.calls++; return new Promise((resolve,reject) => window.release=reject); })");
    const button = document.getElementById('qaSaveBtn');
    assert.equal(button.disabled, true); assert.equal(button.getAttribute('aria-busy'), 'true');
    await run("AppUX.save(document.getElementById('qaSaveBtn'), () => window.calls++)");
    assert.equal(run('window.calls'), 1);
    run("window.release(new Error('offline'))"); await saving;
    assert.equal(button.disabled, false);
    assert.equal(document.getElementById('quickDescription').value, 'keep me');
    assert.match(document.querySelector('[role="alert"]').textContent, /korundu/);
});

test('global status distinguishes local, pending, error and actually synced data', async t => {
    const { run, document } = await ui(t);
    await run('FirebaseSync.updateStatus()');
    const badge = document.getElementById('globalSaveStatus');
    assert.equal(badge.dataset.state, 'local');
    run("FirebaseSync.currentUser={uid:'test'}; FirebaseSync.lastSyncTime='2026-10-01'; FirebaseSync.lastError='offline'");
    await run('FirebaseSync.updateStatus()'); assert.equal(badge.dataset.state, 'error');
    run('FirebaseSync.lastError=null');
    await run('FirebaseSync.updateStatus()'); assert.equal(badge.dataset.state, 'pending');
    await run("DBManager.transaction(['pendingSync'], 'readwrite', tx => tx.objectStore('pendingSync').clear())");
    await run('FirebaseSync.updateStatus()'); assert.equal(badge.dataset.state, 'synced');
});

test('frequent categories lead quick add and other categories remain reachable', async t => {
    const { run, document } = await ui(t);
    run("AppState.categories=Array.from({length:8}, (_,i)=>({id:'c'+i,name:'Category '+i,type:'expense',color:'#123456'})); AppState.transactions=[{categoryId:'c7',type:'expense'}]; openQuickAdd()");
    assert.equal(document.querySelectorAll('.qa-cat-item').length, 6);
    assert.equal(document.querySelector('.qa-cat-item').dataset.categoryId, 'c7');
    run('AppUX.toggleCategories()'); assert.equal(document.querySelectorAll('.qa-cat-item').length, 8);
    run("selectQuickCategory('c6'); AppUX.toggleCategories()");
    assert(document.querySelector('.qa-cat-item.selected'));
    run('toggleSidebar()');
    document.querySelector('[data-page="more"]').click();
    assert(document.getElementById('sidebar').classList.contains('active'), 'outside-click handler must not immediately close the More menu');
});
