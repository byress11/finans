// Shared validation for backups and records received from the cloud.
const DataSafety = {
    stores: ['profiles', 'transactions', 'categories', 'debts', 'investments', 'bills', 'notes'],
    id(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); },
    token() { return crypto.randomUUID(); },
    signature(value) {
        if (value == null) return 'null';
        if (Array.isArray(value)) return '[' + value.map(v => this.signature(v)).join(',') + ']';
        if (typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + this.signature(value[k])).join(',') + '}';
        return JSON.stringify(value);
    },
    remoteSignature(record, deletion) { return this.signature({ record: record || null, deletion: deletion || null }); },
    html(value) {
        // Fail closed if the bundled sanitizer could not load.
        if (typeof DOMPurify === 'undefined') throw new Error('Güvenli metin düzenleyicisi yüklenemedi.');
        const fragment = DOMPurify.sanitize(String(value || ''), {
            ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'ul', 'ol', 'li', 'a', 'blockquote', 'font'],
            ALLOWED_ATTR: ['href', 'title', 'color', 'size', 'style'],
            ALLOW_DATA_ATTR: false,
            RETURN_DOM_FRAGMENT: true
        });
        for (const node of fragment.querySelectorAll('[style]')) {
            const safe = [];
            for (const property of ['color', 'background-color', 'text-align', 'font-weight', 'font-style', 'text-decoration', 'font-size']) {
                const content = node.style.getPropertyValue(property);
                if (content && /^[#\w\s.,()%+-]+$/.test(content) && !/url|expression|var\(/i.test(content)) safe.push(`${property}:${content}`);
            }
            node.removeAttribute('style');
            if (safe.length) node.setAttribute('style', safe.join(';'));
        }
        const container = document.createElement('div'); container.append(fragment);
        return container.innerHTML;
    },
    record(store, input) {
        if (!this.stores.includes(store) || !input || typeof input !== 'object' || Array.isArray(input) || !this.id(input.id)) {
            throw new Error('Geçersiz kayıt veya kimlik: ' + store);
        }
        const item = JSON.parse(JSON.stringify(input, (key, value) => {
            if (['__proto__', 'prototype', 'constructor'].includes(key) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Geçersiz kayıt içeriği.');
            return value;
        }));
        if (['profiles', 'categories', 'investments', 'bills'].includes(store) && (typeof item.name !== 'string' || !item.name.trim())) throw new Error('Kayıt adı gerekli: ' + store);
        if (item.profileId != null && !this.id(item.profileId)) throw new Error('Geçersiz profil kimliği.');
        if (item.categoryId != null && !this.id(item.categoryId)) throw new Error('Geçersiz kategori kimliği.');
        for (const field of ['amount', 'remainingAmount', 'purchasePrice', 'currentPrice', 'quantity', 'interestRate', 'openingBalance']) {
            if (item[field] != null && (typeof item[field] !== 'number' || !Number.isFinite(item[field]) || (field !== 'openingBalance' && item[field] < 0))) {
                throw new Error('Geçersiz sayısal alan: ' + field);
            }
        }
        if (store === 'transactions' && (!['income', 'expense'].includes(item.type) || !(item.amount > 0) || !item.date)) throw new Error('Geçersiz işlem.');
        if (store === 'categories' && !['income', 'expense'].includes(item.type)) throw new Error('Geçersiz kategori.');
        for (const field of ['date', 'dueDate', 'purchaseDate', 'createdAt', 'updatedAt']) {
            if (item[field] && (typeof item[field] !== 'string' || !Number.isFinite(Date.parse(item[field])))) throw new Error('Geçersiz tarih: ' + field);
        }
        for (const field of ['name', 'title', 'person', 'description', 'notes', 'note', 'symbol', 'currency', 'content']) {
            if (item[field] != null && typeof item[field] !== 'string') throw new Error('Geçersiz metin: ' + field);
        }
        if (item.tags != null && (!Array.isArray(item.tags) || item.tags.some(t => typeof t !== 'string'))) throw new Error('Geçersiz etiketler.');
        if (item.color != null && !/^#[\da-f]{6}$/i.test(item.color)) throw new Error('Geçersiz renk.');
        if (store === 'notes') item.content = this.html(item.content);
        return item;
    },
    backup(input) {
        if (!input || !['1.0', '1.0.0', '2.0'].includes(input.version) || !Array.isArray(input.profiles)) throw new Error('Desteklenmeyen yedek dosyası.');
        const result = { version: '2.0' };
        for (const store of this.stores) {
            const items = input[store] === undefined ? [] : input[store];
            if (!Array.isArray(items)) throw new Error('Geçersiz kayıt listesi: ' + store);
            const ids = new Set();
            result[store] = items.map(value => {
                const item = this.record(store, value);
                if (ids.has(item.id)) throw new Error('Yinelenen kimlik: ' + item.id);
                ids.add(item.id);
                return item;
            });
        }
        const profiles = new Set(result.profiles.map(p => p.id));
        for (const store of this.stores.filter(s => s !== 'profiles')) {
            for (const item of result[store]) {
                if (!['bills', 'debts'].includes(store) && !profiles.has(item.profileId)) throw new Error('Kayıt profili bulunamadı: ' + item.id);
                // Bills/debts are shared; old backups may reference a deleted profile.
            }
        }
        // Deleted categories are supported by the existing UI (uncategorized fallback).
        if (input.settings !== undefined && (!Array.isArray(input.settings) || input.settings.some(s => !s || typeof s.key !== 'string'))) throw new Error('Geçersiz ayarlar.');
        if (input.settings) result.settings = input.settings.filter(s => !s.key.startsWith('sync:') && s.key !== 'recoveryBackup' && !s.key.startsWith('conflictBackup:'));
        return result;
    }
};
