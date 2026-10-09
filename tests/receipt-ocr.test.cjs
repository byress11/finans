const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function scanner(t) {
    const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    vm.runInContext(fs.readFileSync('js/receipt-scanner.js', 'utf8'), dom.getInternalVMContext());
    dom.window.eval('var Utils = { showToast(){}, iconHTML(){return ""}, escapeHTML(s){return s} };');
    return { scanner: dom.window.eval('ReceiptScanner'), window: dom.window, document: dom.window.document };
}

test('receipt total outranks cash tender, VAT, subtotal and change', t => {
    const { scanner: s } = scanner(t);
    assert.equal(s.extractAmount('MARKET\nARA TOPLAM 100,00\nKDV 20,00\nTOPLAM 120,00\nNAKİT 200,00\nPARA ÜSTÜ 80,00'), 120);
    assert.equal(s.amountNeedsReview, false);
    assert.equal(s.extractAmount('GENEL TOPLAM\n*1.234,56 TL\nKREDİ KARTI 1.234,56'), 1234.56);
    assert.equal(s.extractAmount('TOPLAM 150 TL'), 150);
});

test('dates and identifiers are never interpreted as money', t => {
    const { scanner: s } = scanner(t);
    assert.equal(s.extractAmount('TARİH 30.09.2026\nTEL 02123456789\nVKN 1234567890\nKDV 20,00'), null);
    assert.equal(s.extractAmount('30.09.2026'), null);
    assert.equal(s.parseAmount('1,234.56'), 1234.56);
    assert.equal(s.parseAmount('1.234,56'), 1234.56);
});

test('ambiguous or unlabeled amounts require review', t => {
    const { scanner: s } = scanner(t);
    s.extractAmount('ÜRÜN 100,00\nÜRÜN 200,00'); assert.equal(s.amountNeedsReview, true);
    s.extractAmount('TOPLAM 100,00\nTOPLAM 120,00'); assert.equal(s.amountNeedsReview, true);
    assert.equal(s.fixOCRErrors('TOPLAM\n10 , 00'), 'TOPLAM\n10,00');
});

test('missing and impossible dates remain blank; issue date outranks due date', t => {
    const { scanner: s } = scanner(t);
    assert.equal(s.extractDate('Tarih okunamadı'), null);
    assert.equal(s.extractDate('31.02.2026'), null);
    assert.equal(s.extractDate('29.02.2024'), '2024-02-29');
    assert.equal(s.extractDate('SON ÖDEME 15.10.2026\nFATURA TARİHİ 30.09.2026'), '2026-09-30');
    assert.equal(s.extractDate('30 Eylül 2026'), '2026-09-30');
});

test('contrast enhancement expands faint gray text without damaging alpha or blank images', t => {
    const { scanner: s } = scanner(t);
    const pixels = new Uint8ClampedArray([110,110,110,255,200,200,200,255]);
    s.enhancePixels(pixels);
    assert.deepEqual([...pixels], [0,0,0,255,255,255,255,255]);
    const blank = new Uint8ClampedArray([255,255,255,255]);
    s.enhancePixels(blank); assert.deepEqual([...blank], [255,255,255,255]);
});

function mockReading(s, readings) {
    const modes = [];
    s.prepareImage = async () => ({ width: 1, height: 1, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {} }) });
    s.initWorker = async () => ({ setParameters: async p => modes.push(p.tessedit_pageseg_mode), recognize: async () => ({ data: readings.shift() }) });
    return modes;
}

test('weak OCR retries with enhanced image and keeps the stronger result', async t => {
    const { scanner: s } = scanner(t);
    const modes = mockReading(s, [{ text: 'MARKET', confidence: 40 }, { text: 'MARKET\nTOPLAM 120,00\n30.09.2026', confidence: 90 }]);
    const result = await s.recognizeText('photo');
    assert.deepEqual(modes, ['6', '3']); assert.equal(result.amount, 120); assert.equal(result.confidence, 90);
});

test('good OCR needs one pass; conflicting second-pass amounts are flagged', async t => {
    const { scanner: s } = scanner(t);
    let modes = mockReading(s, [{ text: 'TOPLAM 120,00\n30.09.2026', confidence: 90 }]);
    await s.recognizeText('photo'); assert.equal(modes.length, 1);
    mockReading(s, [{ text: 'TOPLAM 120,00\n30.09.2026', confidence: 90 }, { text: 'TOPLAM 720,00\n30.09.2026', confidence: 70 }]);
    const result = await s.recognizeText('photo', true);
    assert.equal(result.amount, 120); assert.equal(result.amountConflict, true);
});

test('cancel during image preparation prevents OCR from starting', async t => {
    const { scanner: s } = scanner(t);
    let finish, starts = 0;
    s.prepareImage = () => new Promise(resolve => { finish = resolve; });
    s.initWorker = async () => { starts++; };
    const job = s.recognizeText('photo'); await s.terminate(); finish({});
    assert.equal(await job, null); assert.equal(starts, 0);
});

test('results warn about absent dates and display engine confidence instead of accuracy', t => {
    const { scanner: s, document } = scanner(t);
    s.showResults({ ...s.analyzeText('MARKET\nTOPLAM 120,00'), rawText: 'test', confidence: 65 });
    assert.equal(document.getElementById('scanResultDate').value, '');
    assert.match(document.getElementById('scanReviewNotice').textContent, /Tarih okunamadı/);
    assert.match(document.getElementById('scanConfidence').textContent, /güveni: %65/);
});
