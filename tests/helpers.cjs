const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { IDBFactory } = require('fake-indexeddb');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const { webcrypto } = require('node:crypto');

function cloud() {
    const records = new Map();
    let fail = false, beforeCommit;
    function ref(path) {
        return { path, doc: id => ref(path + '/' + id), collection: name => ref(path + '/' + name),
            get: async () => ({ docs: [...records].filter(([key]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')).map(([key, data]) => ({ id: key.split('/').at(-1), data: () => structuredClone(data) })) }),
            onSnapshot: () => () => {} };
    }
    return {
        records,
        set fail(value) { fail = value; },
        set beforeCommit(value) { beforeCommit = value; },
        collection: name => ref(name),
        async runTransaction(work) {
            if (fail) throw new Error('network unavailable');
            const writes = [];
            const result = await work({
                get: async r => ({ exists: records.has(r.path), data: () => structuredClone(records.get(r.path)) }),
                set: (r, data) => writes.push(() => records.set(r.path, structuredClone(data))),
                delete: r => writes.push(() => records.delete(r.path))
            });
            if (beforeCommit) { const hook = beforeCommit; beforeCommit = null; await hook(); }
            if (fail) throw new Error('network unavailable');
            writes.forEach(write => write());
            return result;
        }
    };
}

async function setup() {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' });
    const context = vm.createContext({
        console, indexedDB: new IDBFactory(), crypto: webcrypto, structuredClone,
        DOMPurify: createDOMPurify(dom.window), document: dom.window.document,
        window: dom.window, localStorage: dom.window.localStorage, Date, Blob,
        setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}
    });
    for (const file of ['data-safety.js', 'database.js', 'sync.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
    }
    vm.runInContext('const Utils = { showToast() {}, generateId() { return crypto.randomUUID(); } };', context);
    const api = vm.runInContext('({ DBManager, FirebaseSync, DataSafety, BackupService })', context);
    await api.DBManager.init('alice');
    api.FirebaseSync.currentUser = { uid: 'alice' };
    api.FirebaseSync.syncEnabled = true;
    api.FirebaseSync.db = cloud();
    api.loadModules = () => { vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/modules.js'), 'utf8'), context); return vm.runInContext('({ BillManager, DebtManager })', context); };
    api.eval = code => vm.runInContext(code, context);
    api.setGlobal = (name, value) => { context[name] = value; };
    api.dispose = () => { api.DBManager.db?.close(); dom.window.close(); };
    return api;
}

const profile = { id: 'p', name: 'Personal', currency: 'TRY' };
const transaction = { id: 't', profileId: 'p', type: 'expense', amount: 12, date: '2026-10-09' };
const backup = () => ({ version: '2.0', profiles: [profile], transactions: [transaction], categories: [], debts: [], investments: [], bills: [], notes: [] });
module.exports = { setup, cloud, profile, transaction, backup };
