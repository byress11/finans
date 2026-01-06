/**
 * Fiş/Fatura Tarayıcı Modülü
 * Tesseract.js ile OCR ve Akıllı Kategori Belirleme
 */

// ============================================
// RECEIPT SCANNER
// ============================================
const ReceiptScanner = {
    // Tesseract worker
    worker: null,
    isProcessing: false,

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
    async initWorker() {
        if (this.worker) return this.worker;

        try {
            // Tesseract worker oluştur - Türkçe dil desteği
            this.worker = await Tesseract.createWorker('tur', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        this.updateProgress(Math.round(m.progress * 100));
                    }
                }
            });

            // Türkçe karakterler için özel ayarlar
            await this.worker.setParameters({
                preserve_interword_spaces: '1',
            });

            return this.worker;
        } catch (error) {
            console.error('Tesseract worker başlatılamadı:', error);
            throw error;
        }
    },

    // İlerleme güncelle
    updateProgress(percent) {
        const progressBar = document.getElementById('scanProgressBar');
        const progressText = document.getElementById('scanProgressText');

        if (progressBar) {
            progressBar.style.width = percent + '%';
        }
        if (progressText) {
            progressText.textContent = `Metin okunuyor... %${percent}`;
        }
    },

    // Görüntüden metin oku
    async recognizeText(imageSource) {
        if (this.isProcessing) {
            Utils.showToast('Zaten bir işlem devam ediyor', 'error');
            return null;
        }

        this.isProcessing = true;
        this.showProcessingUI();

        try {
            await this.initWorker();

            const result = await this.worker.recognize(imageSource);
            const text = result.data.text;

            console.log('OCR Sonucu:', text);

            // Metni analiz et
            const analysis = this.analyzeText(text);

            return {
                rawText: text,
                ...analysis
            };
        } catch (error) {
            console.error('OCR hatası:', error);
            Utils.showToast('Metin okunamadı. Lütfen daha net bir görüntü deneyin.', 'error');
            return null;
        } finally {
            this.isProcessing = false;
            this.hideProcessingUI();
        }
    },

    // Metni analiz et
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
            confidence: this.calculateConfidence(category, amount, date)
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

    // Tutar çıkar - Türkiye Formatı (1.234,56 TL)
    extractAmount(text) {
        // Önce OCR hatalarını düzelt
        let cleanedText = this.fixOCRErrors(text);

        // Türkçe para formatları - öncelik sırasına göre
        const patterns = [
            // Öncelikli: TOPLAM, GENEL TOPLAM, ÖDENECEK gibi anahtar kelimeler
            /(?:toplam|tutar|total|genel\s*toplam|odenecek\s*tutar|odenecek|odenen|nakit|kart|bedel|fiyat)[\s:*]*[TL]*\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*(?:tl)?/gi,
            /(?:toplam|tutar|total|genel\s*toplam|odenecek\s*tutar|odenecek|odenen|nakit|kart|bedel|fiyat)[\s:*]*[TL]*\s*([0-9]+,[0-9]{2})\s*(?:tl)?/gi,
            // TL ile biten
            /([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*(?:tl)/gi,
            /([0-9]+,[0-9]{2})\s*(?:tl)/gi,
            // Sadece Türk formatındaki sayılar (binlik nokta, ondalık virgül)
            /([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/g,
            /([0-9]+,[0-9]{2})/g
        ];

        let amounts = [];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            let match;
            pattern.lastIndex = 0;

            while ((match = pattern.exec(cleanedText)) !== null) {
                let amountStr = match[1] || match[0];
                const parsedAmount = this.parseTurkishAmount(amountStr);

                if (parsedAmount !== null && parsedAmount > 0 && parsedAmount < 10000000) {
                    amounts.push({
                        value: parsedAmount,
                        priority: i
                    });
                }
            }
        }

        // Önceliğe göre sırala, sonra en büyük tutarı al
        if (amounts.length > 0) {
            amounts.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                return b.value - a.value;
            });
            return amounts[0].value;
        }

        return null;
    },

    // OCR hatalarını düzelt
    fixOCRErrors(text) {
        let result = text;
        // Sayı içindeki O harflerini 0 yap
        result = result.replace(/(\d)[oO](\d)/g, '$10$2');
        result = result.replace(/[oO](\d)/g, '0$1');
        result = result.replace(/(\d)[oO]/g, '$10');
        // Sayı içindeki l ve I harflerini 1 yap
        result = result.replace(/(\d)[lI|](\d)/g, '$11$2');
        result = result.replace(/[lI|](\d)/g, '1$1');
        result = result.replace(/(\d)[lI|]/g, '$11');
        // Boşlukları temizle
        result = result.replace(/(\d)\s+([,.])\s*(\d)/g, '$1$2$3');
        result = result.replace(/\s+/g, ' ');
        return result;
    },

    // Türkiye para formatını parse et (1.234,56 -> 1234.56)
    parseTurkishAmount(amountStr) {
        if (!amountStr) return null;

        let cleanStr = amountStr.replace(/[^0-9.,]/g, '').trim();
        if (!cleanStr) return null;

        const hasComma = cleanStr.includes(',');
        const hasDot = cleanStr.includes('.');

        if (hasComma && hasDot) {
            const commaIndex = cleanStr.lastIndexOf(',');
            const dotIndex = cleanStr.lastIndexOf('.');

            if (commaIndex > dotIndex) {
                // Türk formatı: 1.455,33
                cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
            } else {
                // Amerikan formatı: 1,455.33
                cleanStr = cleanStr.replace(/,/g, '');
            }
        } else if (hasComma) {
            const commaParts = cleanStr.split(',');
            const lastPart = commaParts[commaParts.length - 1];

            if (lastPart.length <= 2) {
                // Ondalık virgül: 1455,33 veya 1455,3
                cleanStr = cleanStr.replace(',', '.');
            } else {
                cleanStr = cleanStr.replace(/,/g, '');
            }
        } else if (hasDot) {
            const dotParts = cleanStr.split('.');
            const lastPart = dotParts[dotParts.length - 1];

            if (dotParts.length === 2 && lastPart.length <= 2) {
                // Zaten JavaScript formatı
            } else if (lastPart.length === 3 || dotParts.length > 2) {
                // Binlik nokta
                cleanStr = cleanStr.replace(/\./g, '');
            }
        }

        const amount = parseFloat(cleanStr);
        return isNaN(amount) ? null : amount;
    },

    // Tarih çıkar
    extractDate(text) {
        const patterns = [
            // DD.MM.YYYY veya DD/MM/YYYY
            /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/g,
            // DD.MM.YY
            /(\d{1,2})[.\/](\d{1,2})[.\/](\d{2})\b/g,
            // DD Ay YYYY
            /(\d{1,2})\s*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s*(\d{4})/gi
        ];

        const monthNames = {
            'ocak': '01', 'şubat': '02', 'mart': '03', 'nisan': '04',
            'mayıs': '05', 'haziran': '06', 'temmuz': '07', 'ağustos': '08',
            'eylül': '09', 'ekim': '10', 'kasım': '11', 'aralık': '12'
        };

        for (const pattern of patterns) {
            const match = pattern.exec(text);
            if (match) {
                let day, month, year;

                if (match[2] && monthNames[match[2].toLowerCase()]) {
                    // Ay ismiyle
                    day = match[1].padStart(2, '0');
                    month = monthNames[match[2].toLowerCase()];
                    year = match[3];
                } else {
                    day = match[1].padStart(2, '0');
                    month = match[2].padStart(2, '0');
                    year = match[3];

                    // 2 haneli yıl kontrolü
                    if (year.length === 2) {
                        year = '20' + year;
                    }
                }

                // Geçerlilik kontrolü
                const dateStr = `${year}-${month}-${day}`;
                const date = new Date(dateStr);

                if (!isNaN(date.getTime()) && date <= new Date()) {
                    return dateStr;
                }
            }
        }

        // Bugünün tarihini döndür
        return new Date().toISOString().split('T')[0];
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

    // Güven skoru hesapla
    calculateConfidence(category, amount, date) {
        let score = 0;

        if (category && category.score > 0) score += 40;
        if (amount && amount > 0) score += 40;
        if (date) score += 20;

        return score;
    },

    // İşlem UI göster
    showProcessingUI() {
        document.getElementById('scanPreviewContainer').classList.add('hidden');
        document.getElementById('scanProcessing').classList.remove('hidden');
        document.getElementById('scanResults').classList.add('hidden');
    },

    // İşlem UI gizle
    hideProcessingUI() {
        document.getElementById('scanProcessing').classList.add('hidden');
    },

    // Sonuçları göster
    showResults(result) {
        if (!result) return;

        document.getElementById('scanResults').classList.remove('hidden');

        // Kategori
        const categoryEl = document.getElementById('scanResultCategory');
        const catName = result.category.subcategory
            ? `${result.category.name} > ${result.category.subcategory}`
            : result.category.name;
        categoryEl.innerHTML = `${Utils.iconHTML(result.category.icon)} ${catName}`;

        // Tutar
        const amountEl = document.getElementById('scanResultAmount');
        amountEl.value = result.amount ? result.amount.toFixed(2) : '';

        // Tarih
        const dateEl = document.getElementById('scanResultDate');
        dateEl.value = result.date || new Date().toISOString().split('T')[0];

        // Açıklama
        const descEl = document.getElementById('scanResultDescription');
        descEl.value = result.description || '';

        // Güven skoru
        const confidenceEl = document.getElementById('scanConfidence');
        const confidenceBar = document.getElementById('scanConfidenceBar');
        confidenceEl.textContent = `%${result.confidence} doğruluk`;
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
        const categoryName = document.getElementById('scanResultCategory').textContent.trim();

        if (!amount || amount <= 0) {
            Utils.showToast('Lütfen geçerli bir tutar girin', 'error');
            return;
        }

        // Kategoriyi bul
        const mainCatName = categoryName.includes('>')
            ? categoryName.split('>')[0].trim()
            : categoryName;

        // İkon kısmını çıkar
        const cleanCatName = mainCatName.replace(/^[^\s]+\s/, '').trim();

        const category = AppState.categories.find(c =>
            c.type === 'expense' && c.name.toLowerCase() === cleanCatName.toLowerCase()
        );

        // İşlemi ekle
        const transaction = {
            type: 'expense',
            amount: amount,
            category: category ? category.name : 'Diğer Gider',
            categoryId: category ? category.id : null,
            date: date,
            description: description,
            tags: ['fatura-tarama'],
            note: 'Fiş/fatura taramasından eklendi'
        };

        try {
            await TransactionManager.add(transaction);
            closeScanModal();
            Utils.showToast('İşlem başarıyla eklendi!', 'success');
        } catch (error) {
            console.error('İşlem eklenemedi:', error);
            Utils.showToast('İşlem eklenirken hata oluştu', 'error');
        }
    },

    // Worker'ı kapat
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
};

// ============================================
// KAMERA İŞLEMLERİ
// ============================================
const CameraManager = {
    stream: null,
    videoElement: null,

    async startCamera() {
        try {
            const video = document.getElementById('cameraPreview');
            this.videoElement = video;

            // Kamera izni al
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Arka kamera
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });

            video.srcObject = this.stream;
            await video.play();

            document.getElementById('cameraContainer').classList.remove('hidden');
            document.getElementById('uploadContainer').classList.add('hidden');
            document.getElementById('captureBtn').classList.remove('hidden');

            return true;
        } catch (error) {
            console.error('Kamera başlatılamadı:', error);

            if (error.name === 'NotAllowedError') {
                Utils.showToast('Kamera izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.', 'error');
            } else if (error.name === 'NotFoundError') {
                Utils.showToast('Kamera bulunamadı. Dosya yükleyerek devam edebilirsiniz.', 'error');
            } else {
                Utils.showToast('Kamera başlatılamadı. Dosya yükleyerek devam edebilirsiniz.', 'error');
            }

            return false;
        }
    },

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
    },

    capturePhoto() {
        if (!this.videoElement) return null;

        const canvas = document.createElement('canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.videoElement, 0, 0);

        // Görüntüyü önizleme olarak göster
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        this.showPreview(dataUrl);

        // Kamerayı durdur
        this.stopCamera();

        return dataUrl;
    },

    showPreview(dataUrl) {
        const previewImage = document.getElementById('scanPreviewImage');
        previewImage.src = dataUrl;

        document.getElementById('cameraContainer').classList.add('hidden');
        document.getElementById('uploadContainer').classList.add('hidden');
        document.getElementById('scanPreviewContainer').classList.remove('hidden');
        document.getElementById('captureBtn').classList.add('hidden');
    }
};

// ============================================
// MODAL İŞLEMLERİ
// ============================================
function openScanModal() {
    document.getElementById('scanModal').classList.add('active');

    // Modalı sıfırla
    document.getElementById('cameraContainer').classList.add('hidden');
    document.getElementById('uploadContainer').classList.remove('hidden');
    document.getElementById('scanPreviewContainer').classList.add('hidden');
    document.getElementById('scanProcessing').classList.add('hidden');
    document.getElementById('scanResults').classList.add('hidden');
    document.getElementById('captureBtn').classList.add('hidden');

    // Input'ları sıfırla
    document.getElementById('receiptFileInput').value = '';
}

function closeScanModal() {
    document.getElementById('scanModal').classList.remove('active');
    CameraManager.stopCamera();
}

// Kamera başlat butonu
async function startCameraScan() {
    const success = await CameraManager.startCamera();
    if (!success) {
        // Dosya yükleme seçeneğine geri dön
        document.getElementById('uploadContainer').classList.remove('hidden');
    }
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

    const reader = new FileReader();
    reader.onload = (e) => {
        CameraManager.showPreview(e.target.result);
        processImage(e.target.result);
    };
    reader.readAsDataURL(file);
}

// Görüntüyü işle
async function processImage(imageSource) {
    const result = await ReceiptScanner.recognizeText(imageSource);
    if (result) {
        ReceiptScanner.showResults(result);
    }
}

// Tekrar dene
function retryScanning() {
    document.getElementById('scanPreviewContainer').classList.add('hidden');
    document.getElementById('scanResults').classList.add('hidden');
    document.getElementById('uploadContainer').classList.remove('hidden');
    document.getElementById('receiptFileInput').value = '';
}

// Ham metni göster/gizle
function toggleRawText() {
    const container = document.getElementById('rawTextContainer');
    container.classList.toggle('hidden');
}
