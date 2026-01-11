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
    async initWorker() {
        // Zaten başlatılmış worker varsa onu döndür
        if (this.worker && this.isWorkerInitialized) {
            return this.worker;
        }

        // Başlatma işlemi devam ediyorsa, aynı promise'i bekle
        if (this.workerInitPromise) {
            return this.workerInitPromise;
        }

        // Yeni worker başlatma işlemi
        this.workerInitPromise = this._createWorker();
        
        try {
            this.worker = await this.workerInitPromise;
            this.isWorkerInitialized = true;
            return this.worker;
        } catch (error) {
            this.workerInitPromise = null;
            this.isWorkerInitialized = false;
            throw error;
        }
    },

    // Worker oluşturma (internal)
    async _createWorker() {
        try {
            // Önce mevcut worker'ı temizle
            if (this.worker) {
                try {
                    await this.worker.terminate();
                } catch (e) {
                    console.warn('Eski worker temizlenirken hata:', e);
                }
                this.worker = null;
            }

            // Tesseract worker oluştur - Türkçe dil desteği
            const worker = await Tesseract.createWorker('tur', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        this.updateProgress(Math.round(m.progress * 100));
                    }
                },
                errorHandler: (error) => {
                    console.error('Tesseract worker hatası:', error);
                }
            });

            // Türkçe karakterler için özel ayarlar
            await worker.setParameters({
                preserve_interword_spaces: '1',
            });

            return worker;
        } catch (error) {
            console.error('Tesseract worker başlatılamadı:', error);
            throw new Error('OCR motoru başlatılamadı. Lütfen sayfayı yenileyip tekrar deneyin.');
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

    // Görüntüden metin oku - Gelişmiş hata yönetimi
    async recognizeText(imageSource) {
        if (this.isProcessing) {
            Utils.showToast('Zaten bir işlem devam ediyor', 'error');
            return null;
        }

        // Görüntü kaynağı kontrolü
        if (!imageSource) {
            Utils.showToast('Görüntü kaynağı bulunamadı', 'error');
            return null;
        }

        this.isProcessing = true;
        this.showProcessingUI();

        try {
            // Worker başlatma - timeout ile
            const workerPromise = this.initWorker();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('OCR motoru başlatma zaman aşımı')), 30000)
            );
            
            await Promise.race([workerPromise, timeoutPromise]);

            // OCR işlemi - timeout ile
            const recognizePromise = this.worker.recognize(imageSource);
            const recognizeTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Metin okuma zaman aşımı')), 60000)
            );
            
            const result = await Promise.race([recognizePromise, recognizeTimeout]);
            
            if (!result || !result.data) {
                throw new Error('OCR sonucu alınamadı');
            }
            
            const text = result.data.text;

            // Boş metin kontrolü
            if (!text || text.trim().length < 5) {
                Utils.showToast('Görüntüde okunabilir metin bulunamadı. Daha net bir görüntü deneyin.', 'error');
                return null;
            }

            console.log('OCR Sonucu:', text);

            // Metni analiz et
            const analysis = this.analyzeText(text);

            return {
                rawText: text,
                ...analysis
            };
        } catch (error) {
            console.error('OCR hatası:', error);
            
            // Hata türüne göre mesaj
            let errorMessage = 'Metin okunamadı. ';
            if (error.message.includes('zaman aşımı')) {
                errorMessage += 'İşlem çok uzun sürdü. Daha küçük bir görüntü deneyin.';
            } else if (error.message.includes('başlatılamadı')) {
                errorMessage += 'Lütfen sayfayı yenileyip tekrar deneyin.';
            } else {
                errorMessage += 'Lütfen daha net bir görüntü deneyin.';
            }
            
            Utils.showToast(errorMessage, 'error');
            
            // Worker'ı sıfırla (hata durumunda)
            this.isWorkerInitialized = false;
            this.workerInitPromise = null;
            
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

    // Tutar çıkar - Optimize edilmiş regex pattern'leri
    // Hem Türk (1.234,56) hem Amerikan (1,234.56) formatı destekler
    extractAmount(text) {
        // Önce OCR hatalarını düzelt
        let cleanedText = this.fixOCRErrors(text);

        // Öncelikli anahtar kelimeler (yüksekten düşüğe)
        const priorityKeywords = [
            { pattern: /(?:odenecek|ödenecek)\s*(?:tutar)?/gi, priority: 0 },
            { pattern: /(?:kredi)\s*(?:kart[ıi]?)/gi, priority: 1 },
            { pattern: /(?:toplam)\s*(?:tutar[ıi]?)/gi, priority: 2 },
            { pattern: /(?:genel\s*toplam|nakit|kart|total)/gi, priority: 3 }
        ];

        // Para formatı pattern'leri (daha basit ve hızlı)
        const amountPatterns = [
            // Amerikan formatı: 1,142.16
            /([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})\b/,
            // Türk formatı: 1.142,16
            /([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\b/,
            // Basit formatlar
            /([0-9]+,[0-9]{2})\b/,
            /([0-9]+\.[0-9]{2})\b/
        ];

        let amounts = [];

        // Öncelikli anahtar kelimeleri ara
        for (const { pattern, priority } of priorityKeywords) {
            let keywordMatch;
            pattern.lastIndex = 0;
            
            while ((keywordMatch = pattern.exec(cleanedText)) !== null) {
                // Anahtar kelimeden sonraki 80 karakteri al
                const afterKeyword = cleanedText.substring(keywordMatch.index, keywordMatch.index + 80);
                
                for (const amountPattern of amountPatterns) {
                    const amountMatch = afterKeyword.match(amountPattern);
                    if (amountMatch) {
                        const parsedAmount = this.parseAmount(amountMatch[1]);
                        if (parsedAmount !== null && parsedAmount > 0 && parsedAmount < 10000000) {
                            amounts.push({
                                value: parsedAmount,
                                priority: priority,
                                original: amountMatch[1]
                            });
                            break; // İlk eşleşmeyi al
                        }
                    }
                }
            }
        }

        // Anahtar kelime bulunamadıysa, tüm metinde ara
        if (amounts.length === 0) {
            for (let i = 0; i < amountPatterns.length; i++) {
                const globalPattern = new RegExp(amountPatterns[i].source, 'g');
                let match;
                
                while ((match = globalPattern.exec(cleanedText)) !== null) {
                    const parsedAmount = this.parseAmount(match[1]);
                    if (parsedAmount !== null && parsedAmount > 0 && parsedAmount < 10000000) {
                        amounts.push({
                            value: parsedAmount,
                            priority: 10 + i, // Düşük öncelik
                            original: match[1]
                        });
                    }
                }
            }
        }

        // Önceliğe göre sırala, aynı öncelikte en büyük tutarı al
        if (amounts.length > 0) {
            amounts.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                return b.value - a.value;
            });

            console.log('Bulunan tutarlar:', amounts.slice(0, 5).map(a => `${a.original} -> ${a.value} (öncelik: ${a.priority})`));
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

    // Para formatını parse et - Hem Türk hem Amerikan formatı destekler
    // Türk: 1.234,56 (nokta binlik, virgül ondalık)
    // Amerikan: 1,234.56 (virgül binlik, nokta ondalık)
    parseAmount(amountStr) {
        if (!amountStr) return null;

        let cleanStr = amountStr.replace(/[^0-9.,]/g, '').trim();
        if (!cleanStr) return null;

        const hasComma = cleanStr.includes(',');
        const hasDot = cleanStr.includes('.');

        // Her iki ayraç da varsa - son ayracın türüne göre formatı belirle
        if (hasComma && hasDot) {
            const lastComma = cleanStr.lastIndexOf(',');
            const lastDot = cleanStr.lastIndexOf('.');

            if (lastDot > lastComma) {
                // Amerikan formatı: 1,142.16 -> son ayraç nokta = ondalık
                // Virgülleri kaldır, nokta ondalık olarak kalır
                cleanStr = cleanStr.replace(/,/g, '');
            } else {
                // Türk formatı: 1.142,16 -> son ayraç virgül = ondalık
                // Noktaları kaldır, virgülü noktaya çevir
                cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
            }
        } else if (hasComma) {
            // Sadece virgül var
            const commaParts = cleanStr.split(',');
            const lastPart = commaParts[commaParts.length - 1];

            if (lastPart.length === 2) {
                // Ondalık virgül: 1455,33 veya 142,16
                cleanStr = cleanStr.replace(',', '.');
            } else if (lastPart.length === 3 && commaParts.length > 1) {
                // Binlik virgül: 1,142 -> virgülleri kaldır
                cleanStr = cleanStr.replace(/,/g, '');
            } else {
                // Varsayılan: virgülü kaldır
                cleanStr = cleanStr.replace(/,/g, '');
            }
        } else if (hasDot) {
            // Sadece nokta var
            const dotParts = cleanStr.split('.');
            const lastPart = dotParts[dotParts.length - 1];

            if (dotParts.length === 2 && lastPart.length === 2) {
                // Ondalık nokta: 1142.16 - zaten JavaScript formatı
                // Değiştirme
            } else if (lastPart.length === 3 || dotParts.length > 2) {
                // Binlik nokta: 1.142 veya 1.142.000 -> noktaları kaldır
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

        // Açıklama - boş bırak, kullanıcı dolduracak
        const descEl = document.getElementById('scanResultDescription');
        descEl.value = '';

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
            note: ''
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

    // Worker'ı kapat - Güvenli temizlik
    async terminate() {
        if (this.worker) {
            try {
                await this.worker.terminate();
            } catch (error) {
                console.warn('Worker kapatılırken hata:', error);
            }
            this.worker = null;
        }
        this.isWorkerInitialized = false;
        this.workerInitPromise = null;
        this.isProcessing = false;
    }
};

// ============================================
// KAMERA İŞLEMLERİ - Mobil Uyumlu
// ============================================
const CameraManager = {
    stream: null,
    videoElement: null,
    retryCount: 0,
    maxRetries: 3,

    // Kamera desteği kontrolü
    async checkCameraSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return { supported: false, reason: 'Tarayıcınız kamera erişimini desteklemiyor.' };
        }
        
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            if (videoDevices.length === 0) {
                return { supported: false, reason: 'Kamera bulunamadı.' };
            }
            return { supported: true, devices: videoDevices };
        } catch (error) {
            return { supported: false, reason: 'Kamera erişimi kontrol edilemedi.' };
        }
    },

    async startCamera() {
        try {
            const video = document.getElementById('cameraPreview');
            this.videoElement = video;

            // Önce kamera desteğini kontrol et
            const support = await this.checkCameraSupport();
            if (!support.supported) {
                Utils.showToast(support.reason + ' Dosya yükleyerek devam edebilirsiniz.', 'error');
                return false;
            }

            // Kamera ayarları - fallback destekli
            const constraints = await this.getCameraConstraints();
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            video.srcObject = this.stream;
            
            // Video yüklenene kadar bekle
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    video.play()
                        .then(resolve)
                        .catch(reject);
                };
                video.onerror = reject;
                // Timeout
                setTimeout(() => reject(new Error('Video yükleme zaman aşımı')), 10000);
            });

            document.getElementById('cameraContainer').classList.remove('hidden');
            document.getElementById('uploadContainer').classList.add('hidden');
            document.getElementById('captureBtn').classList.remove('hidden');

            this.retryCount = 0; // Başarılı, sayacı sıfırla
            return true;
        } catch (error) {
            console.error('Kamera başlatılamadı:', error);
            return await this.handleCameraError(error);
        }
    },

    // Kamera ayarlarını al - mobil uyumlu fallback
    async getCameraConstraints() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Önce ideal ayarları dene
        if (this.retryCount === 0) {
            return {
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: isMobile ? 1280 : 1920 },
                    height: { ideal: isMobile ? 720 : 1080 }
                }
            };
        }
        
        // İkinci deneme - daha basit ayarlar
        if (this.retryCount === 1) {
            return {
                video: {
                    facingMode: 'environment',
                    width: { min: 640, ideal: 1280 },
                    height: { min: 480, ideal: 720 }
                }
            };
        }
        
        // Son deneme - en basit ayarlar
        return {
            video: true
        };
    },

    // Kamera hatası yönetimi
    async handleCameraError(error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            Utils.showToast('Kamera izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.', 'error');
            return false;
        }
        
        if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            Utils.showToast('Kamera bulunamadı. Dosya yükleyerek devam edebilirsiniz.', 'error');
            return false;
        }
        
        if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            Utils.showToast('Kamera başka bir uygulama tarafından kullanılıyor olabilir.', 'error');
            return false;
        }
        
        // OverconstrainedError - ayarlar desteklenmiyor, fallback dene
        if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`Kamera ayarları desteklenmiyor, fallback deneniyor (${this.retryCount}/${this.maxRetries})`);
                return await this.startCamera();
            }
        }
        
        Utils.showToast('Kamera başlatılamadı. Dosya yükleyerek devam edebilirsiniz.', 'error');
        return false;
    },

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
            });
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement.onloadedmetadata = null;
            this.videoElement.onerror = null;
        }
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        this.showPreview(dataUrl);

        // Kamerayı durdur
        this.stopCamera();

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
