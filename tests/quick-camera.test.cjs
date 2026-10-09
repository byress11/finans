const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

async function screen(t, camera = false) {
    const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'), { url: 'https://example.test', runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    await new Promise(resolve => dom.window.addEventListener('load', resolve));
    const context = dom.getInternalVMContext();
    dom.window.console = { log() {}, warn() {}, error() {} };
    const files = camera ? ['receipt-scanner.js'] : ['data-safety.js', 'database.js', 'app.js'];
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
    if (camera) vm.runInContext('const Utils = {showToast(){}};', context);
    else vm.runInContext("Utils.showToast = () => {}; AppState.categories = [{id:'food',type:'expense',name:'Food',icon:'bi:cart3',color:'#123456'},{id:'salary',type:'income',name:'Salary'}];", context);
    const video = dom.window.document.getElementById('cameraPreview');
    Object.defineProperty(video, 'readyState', { value: 1 });
    video.play = async () => {};
    return { window: dom.window, document: dom.window.document, run: code => vm.runInContext(code, context) };
}

function stream() {
    const track = { readyState: 'live', stops: 0, stop() { this.stops++; this.readyState = 'ended'; } };
    return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}

test('quick add submits the optional description and prevents duplicate saves', async t => {
    const ui = await screen(t);
    ui.run("openQuickAdd(); selectQuickCategory('food');");
    ui.document.getElementById('quickAmount').value = '125.50';
    ui.document.getElementById('quickDescription').value = '  Market alışverişi  ';
    ui.run('let saved, calls = 0, finish; TransactionManager.add = data => { calls++; saved = data; return new Promise(resolve => { finish = resolve; }); };');
    const first = ui.run('handleQuickAdd()');
    await ui.run('handleQuickAdd()');
    assert.equal(ui.run('calls'), 1);
    assert.equal(ui.run('saved.description'), 'Market alışverişi');
    assert(ui.document.getElementById('quickAddPanel').classList.contains('active'));
    ui.run('finish()'); await first;
    assert(!ui.document.getElementById('quickAddPanel').classList.contains('active'));
    ui.run('openQuickAdd()');
    assert.equal(ui.document.getElementById('quickDescription').value, '');
});

test('failed quick save keeps description and switching type clears incompatible category', async t => {
    const ui = await screen(t);
    ui.run("openQuickAdd(); selectQuickCategory('food'); TransactionManager.add = async () => { throw new Error('disk full'); };");
    ui.document.getElementById('quickAmount').value = '10';
    ui.document.getElementById('quickDescription').value = 'Keep me';
    await ui.run('handleQuickAdd()');
    assert(ui.document.getElementById('quickAddPanel').classList.contains('active'));
    assert.equal(ui.document.getElementById('quickDescription').value, 'Keep me');
    assert.equal(ui.document.getElementById('qaSaveBtn').disabled, false);
    ui.run("setQuickAddType('income')");
    assert.equal(ui.document.getElementById('quickCategory').value, '');
});

test('scan opens camera directly and reuses a live stream for retake', async t => {
    const ui = await screen(t, true); const media = stream(); let calls = 0;
    Object.defineProperty(ui.window.navigator, 'mediaDevices', { value: { getUserMedia: async constraints => { calls++; assert.equal(constraints.audio, false); return media; } } });
    assert.equal(await ui.run('openScanModal()'), true);
    assert.equal(calls, 1);
    assert(ui.document.getElementById('uploadContainer').classList.contains('hidden'));
    await ui.run('retryScanning()');
    assert.equal(calls, 1);
    ui.run('closeScanModal()');
    assert.equal(media.track.stops, 1);
    assert.equal(ui.document.getElementById('cameraPreview').srcObject, null);
});

test('simultaneous starts request camera only once; late permission after close releases stream', async t => {
    const ui = await screen(t, true); const media = stream(); let calls = 0, grant;
    Object.defineProperty(ui.window.navigator, 'mediaDevices', { value: { getUserMedia: () => { calls++; return new Promise(resolve => { grant = resolve; }); } } });
    const opening = ui.run('openScanModal()');
    const repeated = ui.run('startCameraScan()');
    assert.equal(calls, 1);
    ui.run('closeScanModal()'); grant(media);
    assert.equal(await opening, false); await repeated;
    assert.equal(media.track.stops, 1);
    assert.equal(ui.document.getElementById('cameraPreview').srcObject, undefined);
});

test('denied permission is not retried automatically and file upload remains available', async t => {
    const ui = await screen(t, true); let calls = 0;
    Object.defineProperty(ui.window.navigator, 'mediaDevices', { value: { getUserMedia: async () => { calls++; throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' }); } } });
    assert.equal(await ui.run('openScanModal()'), false);
    assert.equal(calls, 1);
    assert(!ui.document.getElementById('uploadContainer').classList.contains('hidden'));
    assert(ui.document.getElementById('cameraStatus').textContent.includes('izni kapalı'));
    assert(ui.document.querySelector('#scanModal .modal-footer button[onclick*="receiptFileInput"]'));
});

test('unsupported constraints get one fallback without recursive permission retries', async t => {
    const ui = await screen(t, true); let calls = 0; const media = stream();
    Object.defineProperty(ui.window.navigator, 'mediaDevices', { value: { getUserMedia: async constraints => {
        calls++; if (calls === 1) throw Object.assign(new Error('Constraints'), { name: 'OverconstrainedError' });
        assert.equal(constraints.video, true); return media;
    } } });
    assert.equal(await ui.run('openScanModal()'), true);
    assert.equal(calls, 2);
    ui.run('closeScanModal()');
});

test('backgrounding the page releases the camera without automatically requesting it again', async t => {
    const ui = await screen(t, true); const media = stream(); let calls = 0;
    Object.defineProperty(ui.window.navigator, 'mediaDevices', { value: { getUserMedia: async () => { calls++; return media; } } });
    await ui.run('openScanModal()');
    Object.defineProperty(ui.document, 'hidden', { value: true });
    ui.document.dispatchEvent(new ui.window.Event('visibilitychange'));
    assert.equal(media.track.stops, 1);
    assert.equal(calls, 1);
    assert(ui.document.getElementById('captureBtn').classList.contains('hidden'));
});

test('retaking a photo ignores the previous unfinished OCR result', async t => {
    const ui = await screen(t, true); const media = stream();
    Object.defineProperty(ui.window.navigator, 'mediaDevices', { value: { getUserMedia: async () => media } });
    await ui.run('openScanModal()');
    ui.run('let finishOCR, shown = 0; ReceiptScanner.recognizeText = () => new Promise(resolve => { finishOCR = resolve; }); ReceiptScanner.showResults = () => shown++;');
    const processing = ui.run("processImage('old-image')");
    await ui.run('retryScanning()');
    ui.run('finishOCR({amount:12})'); await processing;
    assert.equal(ui.run('shown'), 0);
    ui.run('closeScanModal()');
});
