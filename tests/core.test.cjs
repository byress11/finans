const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.TZ = 'Europe/Istanbul';

function loadApp() {
    let downloaded;
    const messages = [];
    const context = vm.createContext({
        console, Date, Blob,
        document: {
            addEventListener() {},
            createElement: () => ({ click() {} }),
            body: { appendChild() {}, removeChild() {} }
        },
        URL: {
            createObjectURL(blob) { downloaded = blob; return 'blob:test'; },
            revokeObjectURL() {}
        }
    });
    for (const file of ['data-safety.js', 'database.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/', file), 'utf8'), context);
    const api = vm.runInContext('({ Utils, DataManager, AppState, DBManager, exportData })', context);
    api.Utils.showToast = (message, type) => messages.push({ message, type });
    return { ...api, downloaded: () => downloaded, messages };
}

test('monthly totals include the last day and exclude adjacent months', () => {
    const app = loadApp();
    app.AppState.transactions = [
        { date: '2026-09-30', type: 'income', amount: 1000 },
        { date: '2026-10-01', type: 'income', amount: 100 },
        { date: '2026-10-31', type: 'expense', amount: 30 },
        { date: '2026-10-31T23:59:59+03:00', type: 'expense', amount: 20 },
        { date: '2026-11-01', type: 'expense', amount: 999 }
    ];
    const result = app.DataManager.getMonthlyData(9, 2026);
    assert.equal(result.income, 100);
    assert.equal(result.expense, 50);
    assert.equal(result.balance, 50);
    assert.equal(result.transactions.length, 3);
});

test('monthly totals handle leap days and year rollover', () => {
    const app = loadApp();
    app.AppState.transactions = [
        { date: '2024-02-29', type: 'income', amount: 29 },
        { date: '2024-03-01', type: 'income', amount: 1 },
        { date: '2026-12-31', type: 'income', amount: 31 },
        { date: '2027-01-01', type: 'income', amount: 1 }
    ];
    assert.equal(app.DataManager.getMonthlyData(1, 2024).income, 29);
    assert.equal(app.DataManager.getMonthlyData(11, 2026).income, 31);
});

test('date inputs preserve the local calendar day after midnight', () => {
    const app = loadApp();
    assert.equal(app.Utils.formatDateInput(new Date('2026-10-09T00:30:00+03:00')), '2026-10-09');
    assert.equal(app.Utils.formatDateInput(new Date('2027-01-01T00:01:00+03:00')), '2027-01-01');
});

test('JSON backup includes every profile records even when only one is active', async () => {
    const app = loadApp();
    const stores = ['profiles', 'transactions', 'categories', 'debts', 'investments', 'bills', 'notes'];
    const data = Object.fromEntries(stores.map(store => [store, [
        { id: store + '-a', profileId: 'a' },
        { id: store + '-b', profileId: 'b' }
    ]]));
    for (const store of stores) app.AppState[store] = data[store].slice(0, 1);
    app.AppState.profiles = data.profiles;
    app.DBManager.snapshot = async () => ({ ...data, settings: [] });
    await app.exportData();
    const backup = JSON.parse(await app.downloaded().text());
    assert.equal(backup.version, '2.0');
    for (const store of stores) assert.deepEqual(backup[store], data[store], store);
});

test('failed backup reads do not download partial data or announce success', async () => {
    const app = loadApp();
    app.DBManager.snapshot = async () => { throw new Error('simulated database read failure'); };
    await app.exportData();
    assert.equal(app.downloaded(), undefined);
    assert.equal(app.messages.at(-1).type, 'error');
});
