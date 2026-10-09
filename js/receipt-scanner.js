/**
 * Fiş/Fatura Tarayıcı Modülü
 * Tesseract.js ile OCR ve Akıllı Kategori Belirleme
 */

// ============================================
// RECEIPT SCANNER
// ============================================
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let _tesseractLoaded = typeof Tesseract !== 'undefined';
let _tesseractLoadPromise = null;

function loadTesseract() {
    if (_tesseractLoaded) return Promise.resolve();
    if (_tesseractLoadPromise) return _tesseractLoadPromise;

    _tesseractLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = TESSERACT_CDN;
        script.onload = () => { _tesseractLoaded = true; resolve(); };
        script.onerror = () => {
            _tesseractLoadPromise = null;
            reject(new Error('Tesseract.js yüklenemedi'));
        };
        document.head.appendChild(script);
    });

    return _tesseractLoadPromise;
}

const ReceiptScanner = {
    // Tesseract worker
    worker: null,
    isProcessing: false,
    isWorkerInitialized: false,
    workerInitPromise: null,

    // Kategori anahtar kelimeleri
    categoryKeywords: {
        // Faturalar
        'Faturalar': {
            keywords: ['elektrik', 'edaş', 'enerjisa', 'kwh', 'kilowatt', 'enerji', 'sayaç'],
            subcategory: 'Elektrik',
            icon: 'bi:lightning-charge'
        },
        'Faturalar_Su': {
            keywords: ['su', 'iski', 'aski', 'muski', 'subse', 'm³', 'metreküp', 'su faturası'],
            subcategory: 'Su',
            icon: 'bi:droplet'
        },
        'Faturalar_Dogalgaz': {
            keywords: ['doğalgaz', 'igdaş', 'esgaz', 'gazdaş', 'bursagaz', 'izmirgaz', 'sm³'],
            subcategory: 'Doğalgaz',
            icon: 'bi:fire'
        },
        'Faturalar_Telefon': {
            keywords: ['turkcell', 'vodafone', 'türk telekom', 'turk telekom', 'superonline', 'ttnet', 'gsm', 'mobil hat', 'telefon faturası', 'internet faturası'],
            subcategory: 'Telefon/İnternet',
            icon: 'bi:phone'
        },
        'Faturalar_TV': {
            keywords: ['tivibu', 'digitürk', 'dsmart', 'd-smart', 'bein', 'netflix', 'youtube premium', 'spotify'],
            subcategory: 'TV/Abonelik',
            icon: 'bi:tv'
        },

        // Market / Gıda
        'Gıda': {
            keywords: ['migros', 'bim', 'a101', 'şok', 'carrefour', 'metro', 'file', 'market', 'marketim', 'süpermarket', 'bakkal', 'manav', 'kasap', 'balıkçı', 'ekmek', 'süt', 'yoğurt', 'peynir', 'meyve', 'sebze', 'deterjan', 'temizlik'],
            icon: 'bi:cart3'
        },

        // Restoran / Yemek
        'Yemek': {
            keywords: ['restoran', 'restaurant', 'cafe', 'kafe', 'kahve', 'pizza', 'burger', 'döner', 'kebap', 'yemeksepeti', 'getir', 'trendyol yemek', 'bistro', 'lokanta', 'fast food', 'starbucks', 'mcdonalds', 'burger king', 'kfc', 'popeyes', 'little caesars'],
            icon: 'bi:cup-hot'
        },

        // Ulaşım
        'Ulaşım': {
            keywords: ['otobüs', 'metro', 'metrobüs', 'tramvay', 'vapur', 'iett', 'ego', 'eshot', 'bilet', 'istanbulkart', 'ankarakart', 'kentkart', 'akbil', 'ulaşım', 'taxi', 'taksi', 'uber', 'bitaksi', 'scotty'],
            icon: 'bi:bus-front'
        },
        'Ulaşım_Akaryakıt': {
            keywords: ['shell', 'bp', 'opet', 'total', 'petrol', 'akaryakıt', 'benzin', 'motorin', 'mazot', 'litre', 'lt', 'pompa', 'otogaz', 'lpg', 'petrol ofisi', 'po', 'alpet', 'moil'],
            subcategory: 'Akaryakıt',
            icon: 'bi:fuel-pump'
        },
        'Ulaşım_Otopark': {
            keywords: ['otopark', 'park', 'ispark', 'vale', 'garaj', 'kapalı otopark'],
            subcategory: 'Otopark',
            icon: 'bi:p-circle'
        },

        // Sağlık
        'Sağlık': {
            keywords: ['eczane', 'eczanesi', 'ilaç', 'pharmacy', 'hastane', 'hospital', 'klinik', 'doktor', 'muayene', 'tedavi', 'sağlık', 'aspirin', 'parol', 'antibiyotik', 'vitamin', 'reçete'],
            icon: 'bi:heart-pulse'
        },

        // Giyim
        'Giyim': {
            keywords: ['zara', 'h&m', 'hm', 'lc waikiki', 'defacto', 'koton', 'mavi', 'boyner', 'vakko', 'mudo', 'ipekyol', 'network', 'giyim', 'kıyafet', 'ayakkabı', 'flo', 'derimod', 'polo garage', 'us polo'],
            icon: 'bi:bag'
        },

        // Teknoloji / Elektronik
        'Elektronik': {
            keywords: ['mediamarkt', 'teknosa', 'vatan', 'hepsiburada', 'trendyol', 'amazon', 'n11', 'gittigidiyor', 'elektronik', 'telefon', 'bilgisayar', 'laptop', 'tablet', 'kulaklık', 'şarj', 'kablo', 'apple', 'samsung', 'xiaomi'],
            icon: 'bi:laptop'
        },

        // Eğlence
        'Eğlence': {
            keywords: ['sinema', 'film', 'tiyatro', 'konser', 'biletix', 'biletino', 'passo', 'maç', 'stadyum', 'müze', 'sergi', 'lunapark', 'bowling', 'bilardo', 'playstation', 'xbox', 'oyun'],
            icon: 'bi:film'
        },

        // Eğitim
        'Eğitim': {
            keywords: ['okul', 'üniversite', 'kurs', 'dershane', 'özel ders', 'kitap', 'kırtasiye', 'd&r', 'dr', 'idefix', 'kitapyurdu', 'udemy', 'coursera', 'eğitim'],
            icon: 'bi:book'
        },

        // Ev / Dekorasyon
        'Ev': {
            keywords: ['ikea', 'koçtaş', 'bauhaus', 'tekzen', 'pratiker', 'evidea', 'english home', 'madame coco', 'mobilya', 'ev', 'dekorasyon', 'halı', 'perde', 'yatak', 'koltuk'],
            icon: 'bi:house'
        },

        // Kişisel Bakım
        'Kişisel Bakım': {
            keywords: ['kuaför', 'berber', 'güzellik', 'spa', 'masaj', 'tırnak', 'manikür', 'pedikür', 'parfüm', 'kozmetik', 'gratis', 'watsons', 'rossmann', 'sephora', 'mac'],
            icon: 'bi:scissors'
        },

        // Sigorta
        'Sigorta': {
            keywords: ['sigorta', 'kasko', 'trafik sigortası', 'sağlık sigortası', 'hayat sigortası', 'anadolu sigorta', 'allianz', 'axa', 'mapfre', 'aksigorta', 'sompo', 'poliçe'],
            icon: 'bi:shield-check'
        },

        // Banka / Finans
        'Finans': {
            keywords: ['banka', 'kredi', 'kredi kartı', 'faiz', 'komisyon', 'havale', 'eft', 'atm', 'ziraat', 'iş bankası', 'garanti', 'yapı kredi', 'akbank', 'qnb', 'vakıfbank', 'halkbank'],
            icon: 'bi:bank'
        }
    },

    // Tesseract worker başlat - Türkçe OCR Optimized
    // Singleton pattern ile memory leak önleme
    epoch: 0,
    pass: 1,
    async initWorker() {
        if (this.worker) return this.worker;
        if (this.workerInitPromise) return this.workerInitPromise;
        const epoch = this.epoch;
        const task = (async () => {
            await loadTesseract();
            const worker = await Tesseract.createWorker('tur+eng', 1, {
                logger: m => {
                    if (epoch === this.epoch && m.status === 'recognizing text') this.updateProgress(Math.round(m.progress * 100));
                }
            });
            if (epoch !== this.epoch) { await worker.terminate(); throw new Error('İptal edildi'); }
            this.worker = worker;
            this.isWorkerInitialized = true;
            return worker;
        })();
        this.workerInitPromise = task;
        try { return await task; }
        finally { if (this.workerInitPromise === task) this.workerInitPromise = null; }
    },

    async withTimeout(task, milliseconds = 60000) {
        let timer;
        try {
            return await Promise.race([task, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Okuma zaman aşımına uğradı')), milliseconds);
            })]);
        } finally { clearTimeout(timer); }
    },

    updateProgress(percent) {
        document.getElementById('scanProgressBar').style.width = percent + '%';
        document.getElementById('scanProgressText').textContent = `${this.pass === 2 ? 'Kontrast artırılarak tekrar okunuyor' : 'Metin okunuyor'}… %${percent}`;
    },

    async prepareImage(source, rotation = 0) {
        const img = new Image();
        await this.withTimeout(new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Fotoğraf açılamadı'));
            img.src = source;
        }), 15000);
        const scale = Math.min(2, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = rotation % 180 ? h : w;
        canvas.height = rotation % 180 ? w : h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        return canvas;
    },

    // Percentile contrast stretching preserves gray letter edges (no hard threshold).
    enhancePixels(pixels) {
        const histogram = new Uint32Array(256);
        for (let i = 0; i < pixels.length; i += 4) {
            const gray = Math.round(.299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2]);
            pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
            histogram[gray]++;
        }
        const count = pixels.length / 4;
        let low = 0, high = 255, n = 0;
        for (let i = 0; i < 256; i++) { n += histogram[i]; if (n >= count * .01) { low = i; break; } }
        n = 0;
        for (let i = 255; i >= 0; i--) { n += histogram[i]; if (n >= count * .01) { high = i; break; } }
        if (high - low < 15) return pixels;
        for (let i = 0; i < pixels.length; i += 4) {
            const value = Math.max(0, Math.min(255, Math.round((pixels[i] - low) * 255 / (high - low))));
            pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
        }
        return pixels;
    },

    async recognizeText(imageSource, detailed = false) {
        if (this.isProcessing || !imageSource) return null;
        const epoch = this.epoch;
        this.isProcessing = true;
        this.pass = 1;
        this.showProcessingUI();
        this.updateProgress(0);
        try {
            const canvas = await this.prepareImage(imageSource);
            if (epoch !== this.epoch) return null;
            const worker = await this.withTimeout(this.initWorker());
            if (epoch !== this.epoch) return null;
            const read = async mode => {
                await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: mode, user_defined_dpi: '300' });
                const result = await this.withTimeout(worker.recognize(canvas));
                const rawText = result.data?.text || '';
                return { rawText, ...this.analyzeText(rawText), confidence: Math.round(Number(result.data?.confidence) || 0) };
            };
            let best = await read('6');
            if (epoch !== this.epoch) return null;
            if (detailed || best.confidence < 75 || !best.amount || !best.date) {
                this.pass = 2; this.updateProgress(0);
                const ctx = canvas.getContext('2d');
                const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
                this.enhancePixels(frame.data); ctx.putImageData(frame, 0, 0);
                const second = await read('3');
                if (epoch !== this.epoch) return null;
                const score = r => r.confidence + (r.amount ? 20 : 0) + (r.date ? 10 : 0);
                const differs = best.amount && second.amount && best.amount !== second.amount;
                if (score(second) > score(best)) best = second;
                best.amountConflict = Boolean(differs);
            }
            if (best.rawText.trim().length < 5) throw new Error('Okunabilir yazı bulunamadı');
            return best;
        } catch (error) {
            if (epoch !== this.epoch) return null;
            Utils.showToast('Yazı okunamadı. Fotoğrafı döndürüp tekrar okuyun veya daha yakın ve aydınlık bir çekim yapın.', 'error');
            void this.terminate();
            this.hideProcessingUI();
            return null;
        } finally {
            if (epoch === this.epoch) {
                this.isProcessing = false;
                this.hideProcessingUI();
            }
        }
    },

    analyzeText(text) {
        const lowerText = text.toLowerCase();
        const lines = text.split('\n').filter(line => line.trim());

        // Kategori bul
        const category = this.detectCategory(lowerText);

        // Tutar bul
        const amount = this.extractAmount(text);

        // Tarih bul
        const date = this.extractDate(text);

        // Açıklama oluştur
        const description = this.generateDescription(lines, category);

        return {
            category,
            amount,
            date,
            description,
            amountNeedsReview: this.amountNeedsReview
        };
    },

    // Kategori tespit et
    detectCategory(text) {
        let bestMatch = null;
        let highestScore = 0;

        for (const [categoryKey, config] of Object.entries(this.categoryKeywords)) {
            let score = 0;

            for (const keyword of config.keywords) {
                if (text.includes(keyword.toLowerCase())) {
                    // Uzun anahtar kelimeler daha değerli
                    score += keyword.length;
                }
            }

            if (score > highestScore) {
                highestScore = score;
                bestMatch = {
                    name: categoryKey.includes('_') ? categoryKey.split('_')[0] : categoryKey,
                    subcategory: config.subcategory || null,
                    icon: config.icon,
                    score: score
                };
            }
        }

        // Minimum eşik kontrolü
        if (highestScore < 3) {
            return {
                name: 'Diğer Gider',
                subcategory: null,
                icon: 'bi:box-seam',
                score: 0
            };
        }

        return bestMatch;
    },

    // Tutar çıkar - Optimize edilmiş regex pattern'leri
    // Hem Türk (1.234,56) hem Amerikan (1,234.56) formatı destekler
    extractAmount(text) {
        const lines = this.fixOCRErrors(text).split(/\r?\n/);
        const candidates = [];
        const money = /(?<![\d.,/])\d+(?:[.,]\d{3})*[.,]\d{2}(?![\d.,/])/g;
        const excluded = /ara\s*toplam|kdv|vergi|para\s*[üu]st[üu]|indirim|iskonto|telefon|tel\b|vkn|tckn|fi[şs]\s*no|tarih/i;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (excluded.test(line)) continue;
            const priority = /[öo]denecek|genel\s*toplam/i.test(line) ? 0
                : /\btoplam\b|\btotal\b/i.test(line) ? 1
                : /nakit|kredi\s*kart|banka\s*kart/i.test(line) ? 2 : 3;
            let values = [...line.matchAll(money)].map(m => m[0]);
            if (!values.length && priority < 2) {
                // A total printed as a whole number is valid only beside a total label.
                const integer = line.match(/(?:toplam|total|tutar[ıi]?|[öo]denecek)\s*[:*₺\s]*(\d+)(?:\s*(?:TL|TRY|₺))?\s*$/i);
                if (integer) values = [integer[1]];
                else if (lines[i + 1] && /^\s*[*₺\s]*[\d.,]+\s*(?:TL|TRY|₺)?\s*$/i.test(lines[i + 1])) values = [...lines[i + 1].matchAll(money)].map(m => m[0]);
            }
            for (const value of values) {
                const amount = this.parseAmount(value);
                if (amount > 0 && amount < 10000000) candidates.push({ amount, priority });
            }
        }
        candidates.sort((a, b) => a.priority - b.priority || b.amount - a.amount);
        this.amountNeedsReview = !candidates.length || candidates[0].priority >= 2 ||
            candidates.some(c => c.priority === candidates[0].priority && c.amount !== candidates[0].amount);
        return candidates[0]?.amount ?? null;
    },

    fixOCRErrors(text) {
        return text.replace(/(?<=\d)[oO](?=[\d.,])/g, '0')
            .replace(/(?<=\d)[lI|](?=[\d.,])/g, '1')
            .replace(/(\d)[ \t]*([,.])[ \t]*(\d)/g, '$1$2$3');
    },

    parseAmount(value) {
        const clean = String(value || '').replace(/[^\d.,]/g, '');
        if (!clean) return null;
        const decimal = clean.match(/[.,](\d{1,2})$/);
        const normalized = decimal
            ? clean.slice(0, decimal.index).replace(/[.,]/g, '') + '.' + decimal[1]
            : clean.replace(/[.,]/g, '');
        const amount = Number(normalized);
        return Number.isFinite(amount) ? amount : null;
    },

    extractDate(text) {
        const months = ['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık'];
        const pattern = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b|\b(\d{1,2})\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+(\d{4})\b/gi;
        const lines = text.split(/\r?\n/).filter(line => !/son\s*[öo]deme|vade/i.test(line));
        lines.sort((a, b) => Number(/tarih/i.test(b)) - Number(/tarih/i.test(a)));
        for (const line of lines) for (const match of line.matchAll(pattern)) {
            const day = Number(match[1] || match[4]);
            const month = match[2] ? Number(match[2]) : months.indexOf(match[5].toLocaleLowerCase('tr')) + 1;
            let year = Number(match[3] || match[6]);
            if (year < 100) year += 2000;
            const date = new Date(year, month - 1, day);
            if (year >= 2000 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
        return null;
    },

    // Açıklama oluştur
    generateDescription(lines, category) {
        // İlk birkaç satırdan mağaza adı çıkarmaya çalış
        const firstLines = lines.slice(0, 3);

        for (const line of firstLines) {
            const cleaned = line.trim();
            // Kısa ve anlamlı görünüyorsa
            if (cleaned.length >= 3 && cleaned.length <= 50 && !/^\d+$/.test(cleaned)) {
                return cleaned;
            }
        }

        return category.subcategory || category.name || 'Fiş/Fatura';
    },

    // İşlem UI göster
    showProcessingUI() {
        document.getElementById('scanPreviewContainer').classList.add('hidden');
        document.getElementById('addScannedBtn').classList.add('hidden');
        document.getElementById('scanProcessing').classList.remove('hidden');
        document.getElementById('scanResults').classList.add('hidden');
    },

    // İşlem UI gizle
    hideProcessingUI() {
        document.getElementById('scanProcessing').classList.add('hidden');
        document.getElementById('scanPreviewContainer').classList.remove('hidden');
    },

    // Sonuçları göster
    showResults(result) {
        if (!result) return;

        document.getElementById('scanResults').classList.remove('hidden');
        document.getElementById('addScannedBtn').classList.remove('hidden');

        // Kategori
        const categoryEl = document.getElementById('scanResultCategory');
        const catName = result.category.subcategory
            ? `${result.category.name} > ${result.category.subcategory}`
            : result.category.name;
        categoryEl.innerHTML = `${Utils.iconHTML(result.category.icon)} ${Utils.escapeHTML(catName)}`;
        this.detectedCategoryName = result.category.name;

        // Tutar
        const amountEl = document.getElementById('scanResultAmount');
        amountEl.value = result.amount ? result.amount.toFixed(2) : '';

        // Tarih
        const dateEl = document.getElementById('scanResultDate');
        dateEl.value = result.date || '';
        const warnings = ['Kaydetmeden önce tutarı ve tarihi fişle karşılaştırın.'];
        if (!result.date) warnings.push('Tarih okunamadı; lütfen girin.');
        if (!result.amount) warnings.push('Tutar okunamadı; lütfen girin.');
        else if (result.amountConflict || result.amountNeedsReview) warnings.push('Toplam tutar kesin belirlenemedi.');
        document.getElementById('scanReviewNotice').textContent = warnings.join(' ');

        // Açıklama - OCR'dan elde edilen öneriyi göster
        const descEl = document.getElementById('scanResultDescription');
        descEl.value = result.description || '';

        // Güven skoru
        const confidenceEl = document.getElementById('scanConfidence');
        const confidenceBar = document.getElementById('scanConfidenceBar');
        confidenceEl.textContent = `Metin okuma güveni: %${result.confidence}`;
        confidenceBar.style.width = result.confidence + '%';

        if (result.confidence >= 70) {
            confidenceBar.style.background = 'var(--income-color)';
        } else if (result.confidence >= 40) {
            confidenceBar.style.background = 'var(--warning-color, #ff9800)';
        } else {
            confidenceBar.style.background = 'var(--expense-color)';
        }

        // Ham metni sakla
        document.getElementById('scanRawText').value = result.rawText;
    },

    // Tarama sonucunu işleme ekle
    async addToTransaction() {
        const amount = parseFloat(document.getElementById('scanResultAmount').value);
        const date = document.getElementById('scanResultDate').value;
        const description = document.getElementById('scanResultDescription').value;
        if (this.isSaving) return;
        if (!date) { Utils.showToast('Lütfen fiş tarihini girin', 'error'); return; }

        if (!Number.isFinite(amount) || amount <= 0) {
            Utils.showToast('Lütfen geçerli bir tutar girin', 'error');
            return;
        }

        const category = AppState.categories.find(c => c.type === 'expense' && c.name === this.detectedCategoryName);

        // İşlemi ekle
        const transaction = {
            type: 'expense',
            amount: amount,
            category: category ? category.name : 'Diğer Gider',
            categoryId: category ? category.id : null,
            date: date,
            description: description,
            tags: ['fatura-tarama'],
            note: ''
        };

        const button = document.getElementById('addScannedBtn');
        this.isSaving = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
        try {
            await TransactionManager.add(transaction);
            closeScanModal();
            Utils.showToast('İşlem başarıyla eklendi!', 'success');
        } catch (error) {
            console.error('İşlem eklenemedi:', error);
            Utils.showToast('İşlem eklenirken hata oluştu', 'error');
        } finally {
            this.isSaving = false; button.disabled = false; button.removeAttribute('aria-busy');
        }
    },

    // Worker'ı kapat - Güvenli temizlik
    async terminate() {
        this.epoch++;
        const worker = this.worker;
        this.worker = null;
        this.isWorkerInitialized = false;
        this.workerInitPromise = null;
        this.isProcessing = false;
        if (worker) { try { await worker.terminate(); } catch (_) { /* already stopped */ } }
    }

};

// ============================================
// KAMERA İŞLEMLERİ - Mobil Uyumlu
// ============================================
const CameraManager = {
    stream: null,
    videoElement: null,
    startPromise: null,
    generation: 0,
    cancelVideoWait: null,

    status(message) {
        document.getElementById('cameraStatus').textContent = message;
    },
    isOpen() { return document.getElementById('scanModal').classList.contains('active'); },
    hasLiveStream() { return this.stream?.getVideoTracks().some(track => track.readyState === 'live'); },
    startCamera() {
        if (this.startPromise) return this.startPromise;
        const generation = this.generation;
        const task = this.openCamera(generation);
        this.startPromise = task;
        void task.finally(() => { if (this.startPromise === task) this.startPromise = null; });
        return task;
    },
    async openCamera(generation) {
        const current = () => generation === this.generation && this.isOpen();
        if (!current()) return false;
        this.status('Kamera açılıyor…');
        document.getElementById('uploadContainer').classList.add('hidden');
        try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera için HTTPS bağlantısı ve kamera destekleyen bir tarayıcı gerekli.');
            if (!this.hasLiveStream()) {
                // Do not enumerate devices or request permission as a separate preflight.
                // The browser reuses its stored permission; no app-level permission prompt.
                let stream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } } });
                } catch (error) {
                    if (!current()) return false;
                    if (!['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error.name)) throw error;
                    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
                }
                if (!current()) { stream.getTracks().forEach(track => track.stop()); return false; }
                this.stream = stream;
            }
            const video = document.getElementById('cameraPreview');
            this.videoElement = video;
            video.muted = true;
            document.getElementById('cameraContainer').classList.remove('hidden');
            await new Promise((resolve, reject) => {
                let timer;
                const finish = error => {
                    clearTimeout(timer);
                    video.onloadedmetadata = video.onerror = null;
                    this.cancelVideoWait = null;
                    error ? reject(error) : resolve();
                };
                this.cancelVideoWait = () => finish(new Error('Kamera kapatıldı.'));
                video.onloadedmetadata = () => finish();
                video.onerror = () => finish(new Error('Kamera görüntüsü yüklenemedi.'));
                timer = setTimeout(() => finish(new Error('Kamera görüntüsü zamanında hazır olmadı.')), 10000);
                if (video.srcObject !== this.stream) video.srcObject = this.stream;
                if (video.readyState >= 1) finish();
            });
            if (!current()) return false;
            await video.play();
            if (!current()) return false;
            document.getElementById('captureBtn').classList.remove('hidden');
            this.status('Fişi düz tutun ve kadrajı doldurun. Yazıya netlik gelmesini bekleyin; gölge ve yansımadan kaçının.');
            return true;
        } catch (error) {
            if (!current()) return false;
            this.releaseStream();
            const messages = {
                NotAllowedError: 'Kamera izni kapalı. Tarayıcının site ayarlarından kameraya izin verebilir veya dosyadan seçebilirsiniz.',
                PermissionDeniedError: 'Kamera izni kapalı. Site ayarlarından izin verebilir veya dosyadan seçebilirsiniz.',
                NotFoundError: 'Kamera bulunamadı. Dosyadan bir fotoğraf seçebilirsiniz.',
                NotReadableError: 'Kamera başka bir uygulamada açık olabilir. Kapatıp tekrar deneyin.'
            };
            this.status(messages[error.name] || error.message || 'Kamera açılamadı. Dosyadan seçebilirsiniz.');
            document.getElementById('cameraContainer').classList.add('hidden');
            document.getElementById('captureBtn').classList.add('hidden');
            document.getElementById('uploadContainer').classList.remove('hidden');
            return false;
        }
    },
    releaseStream() {
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = null;
        if (this.videoElement) this.videoElement.srcObject = null;
    },
    stopCamera() {
        this.generation++;
        this.cancelVideoWait?.();
        this.releaseStream();
        // Keep an unresolved permission request single-flight until the browser settles it.
    },

    capturePhoto() {
        if (!this.videoElement || !this.videoElement.videoWidth) {
            Utils.showToast('Kamera henüz hazır değil, lütfen bekleyin.', 'error');
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.videoElement, 0, 0);

        // Görüntüyü önizleme olarak göster
        const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
        this.showPreview(dataUrl);

        // Keep the same stream while this scan dialog is open, so Retake needs no new request.
        this.status('Fotoğraf alındı. Tekrar çekim için kamera bu pencere kapanana kadar hazır.');

        return dataUrl;
    },

    showPreview(dataUrl) {
        const previewImage = document.getElementById('scanPreviewImage');
        if (previewImage) {
            previewImage.src = dataUrl;
        }

        document.getElementById('cameraContainer').classList.add('hidden');
        document.getElementById('uploadContainer').classList.add('hidden');
        document.getElementById('scanPreviewContainer').classList.remove('hidden');
        document.getElementById('captureBtn').classList.add('hidden');
    }
};

// ============================================
// MODAL İŞLEMLERİ
// ============================================
let scanRevision = 0;
function openScanModal() {
    if (CameraManager.isOpen()) return CameraManager.startPromise || Promise.resolve(true);
    document.getElementById('scanModal').classList.add('active');

    // Modalı sıfırla
    document.getElementById('cameraContainer').classList.add('hidden');
    document.getElementById('uploadContainer').classList.add('hidden');
    document.getElementById('scanPreviewContainer').classList.add('hidden');
    document.getElementById('scanProcessing').classList.add('hidden');
    document.getElementById('scanResults').classList.add('hidden');
    document.getElementById('captureBtn').classList.add('hidden');
    document.getElementById('addScannedBtn').classList.add('hidden');

    // Input'ları sıfırla
    document.getElementById('receiptFileInput').value = '';
    return startCameraScan();
}

function closeScanModal() {
    scanRevision++;
    void ReceiptScanner.terminate();
    document.getElementById('scanModal').classList.remove('active');
    CameraManager.stopCamera();
}

// Kamera başlat butonu
async function startCameraScan() {
    scanRevision++;
    void ReceiptScanner.terminate();
    document.getElementById('scanProcessing').classList.add('hidden');
    document.getElementById('scanPreviewContainer').classList.add('hidden');
    document.getElementById('scanResults').classList.add('hidden');
    document.getElementById('addScannedBtn').classList.add('hidden');
    const success = await CameraManager.startCamera();
    if (!success && CameraManager.isOpen()) {
        // Dosya yükleme seçeneğine geri dön
        document.getElementById('uploadContainer').classList.remove('hidden');
    }
    return success;
}

// Fotoğraf çek
function capturePhoto() {
    const dataUrl = CameraManager.capturePhoto();
    if (dataUrl) {
        processImage(dataUrl);
    }
}

// Dosya yükle
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Dosya türü kontrolü
    if (!file.type.startsWith('image/')) {
        Utils.showToast('Lütfen bir görüntü dosyası seçin', 'error');
        return;
    }

    void ReceiptScanner.terminate();
    CameraManager.stopCamera();
    CameraManager.status('Seçilen fotoğraf okunuyor…');
    const revision = ++scanRevision;

    const reader = new FileReader();
    reader.onload = (e) => {
        if (!CameraManager.isOpen() || revision !== scanRevision) return;
        CameraManager.showPreview(e.target.result);
        processImage(e.target.result);
    };
    reader.readAsDataURL(file);
}

// Görüntüyü işle
async function processImage(imageSource, detailed = false) {
    const generation = CameraManager.generation;
    const revision = scanRevision;
    const result = await ReceiptScanner.recognizeText(imageSource, detailed);
    if (result && CameraManager.isOpen() && generation === CameraManager.generation && revision === scanRevision) {
        ReceiptScanner.showResults(result);
    }
}

// Tekrar dene
function retryScanning() {
    document.getElementById('scanPreviewContainer').classList.add('hidden');
    document.getElementById('scanResults').classList.add('hidden');
    document.getElementById('addScannedBtn').classList.add('hidden');
    document.getElementById('scanProcessing').classList.add('hidden');
    document.getElementById('receiptFileInput').value = '';
    return startCameraScan();
}

window.addEventListener('pagehide', () => CameraManager.stopCamera());
document.addEventListener('visibilitychange', () => {
    if (document.hidden && CameraManager.isOpen()) {
        CameraManager.stopCamera();
        document.getElementById('captureBtn').classList.add('hidden');
        document.getElementById('uploadContainer').classList.remove('hidden');
        CameraManager.status('Kamera duraklatıldı. Devam etmek için Kamerayı tekrar aç’a dokunun.');
    }
});

// Ham metni göster/gizle
function toggleRawText() {
    const container = document.getElementById('rawTextContainer');
    container.classList.toggle('hidden');
}

// Reuse the photo without a new camera permission request.
async function rereadReceipt(rotate = false) {
    if (ReceiptScanner.isProcessing) return;
    const revision = ++scanRevision;
    const source = document.getElementById('scanPreviewImage').getAttribute('src');
    if (!source) return;
    try {
        let image = source;
        if (rotate) {
            const canvas = await ReceiptScanner.prepareImage(source, 90);
            if (revision !== scanRevision || !CameraManager.isOpen()) return;
            image = canvas.toDataURL('image/png');
            CameraManager.showPreview(image);
        }
        await processImage(image, true);
    } catch (_) { Utils.showToast('Fotoğraf açılamadı. Yeniden çekmeyi deneyin.', 'error'); }
}
