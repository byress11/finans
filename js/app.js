/**
 * Hızlı Bütçe - Gelir Gider Takip Uygulaması
 * Fast Budget Style
 * Ana JavaScript Modülü
 */

// ============================================
// DATABASE MANAGER (IndexedDB)
// ============================================
const DB_NAME = 'HizliButceDB';
const DB_VERSION = 1;

const DBManager = {
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Profiles store
                if (!db.objectStoreNames.contains('profiles')) {
                    const profileStore = db.createObjectStore('profiles', { keyPath: 'id' });
                    profileStore.createIndex('name', 'name', { unique: false });
                }

                // Transactions store
                if (!db.objectStoreNames.contains('transactions')) {
                    const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
                    txStore.createIndex('profileId', 'profileId', { unique: false });
                    txStore.createIndex('date', 'date', { unique: false });
                    txStore.createIndex('type', 'type', { unique: false });
                    txStore.createIndex('category', 'category', { unique: false });
                }

                // Categories store
                if (!db.objectStoreNames.contains('categories')) {
                    const catStore = db.createObjectStore('categories', { keyPath: 'id' });
                    catStore.createIndex('profileId', 'profileId', { unique: false });
                    catStore.createIndex('type', 'type', { unique: false });
                }

                // Debts store
                if (!db.objectStoreNames.contains('debts')) {
                    const debtStore = db.createObjectStore('debts', { keyPath: 'id' });
                    debtStore.createIndex('profileId', 'profileId', { unique: false });
                    debtStore.createIndex('type', 'type', { unique: false });
                }

                // Investments store
                if (!db.objectStoreNames.contains('investments')) {
                    const invStore = db.createObjectStore('investments', { keyPath: 'id' });
                    invStore.createIndex('profileId', 'profileId', { unique: false });
                    invStore.createIndex('type', 'type', { unique: false });
                }

                // Bills store
                if (!db.objectStoreNames.contains('bills')) {
                    const billStore = db.createObjectStore('bills', { keyPath: 'id' });
                    // Bills artık tüm profiller için ortak - profileId index'i kaldırıldı
                    billStore.createIndex('dueDate', 'dueDate', { unique: false });
                }

                // Notes store
                if (!db.objectStoreNames.contains('notes')) {
                    const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
                    noteStore.createIndex('profileId', 'profileId', { unique: false });
                }

                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // Pending sync store
                if (!db.objectStoreNames.contains('pendingSync')) {
                    db.createObjectStore('pendingSync', { keyPath: 'id' });
                }
            };
        });
    },

    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// ============================================
// CUSTOM DIALOG SYSTEM
// ============================================
const Dialog = {
    resolveCallback: null,
    rejectCallback: null,
    type: 'alert', // alert, confirm, prompt

    iconHTML(icon) {
        if (typeof icon !== 'string') return '';
        const trimmed = icon.trim();
        if (trimmed.startsWith('bi:')) {
            const name = trimmed.slice(3).trim();
            if (!name) return '';
            return `<i class="bi bi-${name}"></i>`;
        }
        if (trimmed.startsWith('bi-')) return `<i class="bi ${trimmed}"></i>`;
        if (trimmed.startsWith('bi bi-')) return `<i class="${trimmed}"></i>`;
        return Utils ? Utils.escapeHTML(trimmed) : trimmed;
    },

    show(options) {
        return new Promise((resolve, reject) => {
            this.resolveCallback = resolve;
            this.rejectCallback = reject;
            this.type = options.type || 'alert';

            // Set title
            const titleEl = document.getElementById('dialogTitle');
            titleEl.textContent = options.title || this.getDefaultTitle(options.type);

            // Set icon
            const iconEl = document.getElementById('dialogIcon');
            const iconValue = options.icon === false ? '' : (options.icon || this.getDefaultIcon(options.type));
            iconEl.innerHTML = this.iconHTML(iconValue);
            iconEl.style.display = options.icon === false ? 'none' : 'block';

            // Set message
            document.getElementById('dialogMessage').innerHTML = options.message || '';

            // Handle input for prompt
            const inputGroup = document.getElementById('dialogInputGroup');
            const inputEl = document.getElementById('dialogInput');
            if (options.type === 'prompt') {
                inputGroup.classList.remove('hidden');
                inputEl.value = options.defaultValue || '';
                inputEl.placeholder = options.placeholder || '';
                inputEl.type = options.inputType || 'text';
                setTimeout(() => inputEl.focus(), 100);
            } else {
                inputGroup.classList.add('hidden');
            }

            // Handle buttons
            const cancelBtn = document.getElementById('dialogCancelBtn');
            const confirmBtn = document.getElementById('dialogConfirmBtn');

            if (options.type === 'alert') {
                cancelBtn.style.display = 'none';
                confirmBtn.textContent = options.confirmText || 'Tamam';
            } else {
                cancelBtn.style.display = 'inline-flex';
                cancelBtn.textContent = options.cancelText || 'İptal';
                confirmBtn.textContent = options.confirmText || 'Tamam';
            }

            // Set button colors for danger actions
            if (options.danger) {
                confirmBtn.classList.remove('btn-primary');
                confirmBtn.classList.add('btn-danger');
            } else {
                confirmBtn.classList.remove('btn-danger');
                confirmBtn.classList.add('btn-primary');
            }

            // Show modal
            document.getElementById('dialogModal').classList.add('active');

            // Focus confirm button for alert/confirm
            if (options.type !== 'prompt') {
                setTimeout(() => confirmBtn.focus(), 100);
            }
        });
    },

    getDefaultTitle(type) {
        switch (type) {
            case 'confirm': return 'Onay';
            case 'prompt': return 'Giriş';
            default: return 'Bildirim';
        }
    },

    getDefaultIcon(type) {
        switch (type) {
            case 'confirm': return 'bi:question-circle';
            case 'prompt': return 'bi:pencil-square';
            case 'success': return 'bi:check-circle';
            case 'error': return 'bi:x-circle';
            case 'warning': return 'bi:exclamation-triangle';
            default: return 'bi:info-circle';
        }
    },

    confirm() {
        const modal = document.getElementById('dialogModal');
        modal.classList.remove('active');

        if (this.type === 'prompt') {
            const value = document.getElementById('dialogInput').value;
            if (this.resolveCallback) this.resolveCallback(value);
        } else {
            if (this.resolveCallback) this.resolveCallback(true);
        }

        this.cleanup();
    },

    cancel() {
        const modal = document.getElementById('dialogModal');
        modal.classList.remove('active');

        if (this.type === 'prompt') {
            if (this.resolveCallback) this.resolveCallback(null);
        } else {
            if (this.resolveCallback) this.resolveCallback(false);
        }

        this.cleanup();
    },

    close() {
        this.cancel();
    },

    cleanup() {
        this.resolveCallback = null;
        this.rejectCallback = null;
        this.type = 'alert';
    },

    // Shorthand methods
    async alert(message, options = {}) {
        return this.show({
            type: 'alert',
            message,
            ...options
        });
    },

    async confirmAction(message, options = {}) {
        return this.show({
            type: 'confirm',
            message,
            ...options
        });
    },

    async prompt(message, options = {}) {
        return this.show({
            type: 'prompt',
            message,
            ...options
        });
    },

    // Specific dialog types
    async confirmDelete(itemName, itemType = 'öğe') {
        return this.show({
            type: 'confirm',
            title: 'Silme Onayı',
            icon: 'bi:trash3',
            message: `<strong>"${itemName}"</strong> ${itemType}sini silmek istediğinize emin misiniz?<br><br><small style="color: var(--expense-color);">Bu işlem geri alınamaz.</small>`,
            confirmText: 'Sil',
            cancelText: 'Vazgeç',
            danger: true
        });
    },

    async promptPin(message, options = {}) {
        return this.show({
            type: 'prompt',
            title: 'PIN Girişi',
            icon: 'bi:lock-fill',
            message,
            inputType: 'password',
            placeholder: '••••',
            ...options
        });
    }
};

// Add keyboard support for dialog
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('dialogModal');
    if (!modal || !modal.classList.contains('active')) return;

    if (e.key === 'Enter') {
        e.preventDefault();
        Dialog.confirm();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        Dialog.cancel();
    }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================
const Utils = {
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    iconHTML(icon) {
        if (typeof icon !== 'string') return '';
        const trimmed = icon.trim();
        if (trimmed.startsWith('bi:')) {
            const name = trimmed.slice(3).trim();
            if (!name) return '';
            return `<i class="bi bi-${name}"></i>`;
        }
        if (trimmed.startsWith('bi-')) return `<i class="bi ${trimmed}"></i>`;
        if (trimmed.startsWith('bi bi-')) return `<i class="${trimmed}"></i>`;
        return this.escapeHTML(trimmed);
    },

    formatCurrency(amount, currency = 'TRY') {
        const symbols = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
        const symbol = symbols[currency] || currency;
        const formatted = Math.abs(amount).toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return `${amount < 0 ? '-' : ''}${symbol}${formatted}`;
    },

    formatDate(date, format = 'short') {
        const d = new Date(date);
        const options = format === 'short'
            ? { day: 'numeric', month: 'short' }
            : { day: 'numeric', month: 'long', year: 'numeric' };
        return d.toLocaleDateString('tr-TR', options);
    },

    formatDateInput(date) {
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    },

    setDateInputToday(inputId, force = true) {
        const input = document.getElementById(inputId);
        if (!input) return;
        if (!force && input.value) return;
        input.value = this.formatDateInput(new Date());
    },

    getMonthName(month) {
        const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        return months[month];
    },

    getDayName(day) {
        const days = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
        return days[day];
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    speak(message, options = {}) {
        if (!message || !('speechSynthesis' in window)) return false;
        try {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.lang = options.lang || 'tr-TR';
            if (typeof options.rate === 'number') utterance.rate = options.rate;
            if (typeof options.pitch === 'number') utterance.pitch = options.pitch;
            if (typeof options.volume === 'number') utterance.volume = options.volume;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
            return true;
        } catch (error) {
            console.warn('Speech synthesis failed:', error);
            return false;
        }
    },

    addNotification(data) {
        if (!data) return;
        if (!AppState.notifications) AppState.notifications = [];

        const now = new Date();
        const notification = {
            id: data.id || this.generateId(),
            type: data.type || 'info',
            icon: data.icon || 'bi:bell',
            title: data.title || 'Bildirim',
            message: data.message || '',
            time: data.time || 'Şimdi',
            timestamp: data.timestamp || now.toISOString(),
            profileId: data.profileId || AppState.currentProfile?.id || null,
            key: data.key || null
        };

        if (notification.key && AppState.notifications.some(n => n.key === notification.key)) {
            return;
        }

        AppState.notifications.unshift(notification);
        AppState.notifications = AppState.notifications.slice(0, 50);
    },

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? this.iconHTML('bi:check-lg') : type === 'error' ? this.iconHTML('bi:x-lg') : this.iconHTML('bi:info-circle')}</span>
            <span class="toast-message">${message}</span>
        `;

        // Add toast styles if not exist
        if (!document.querySelector('#toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                .toast {
                    position: fixed;
                    bottom: 100px;
                    left: 50%;
                    transform: translateX(-50%) translateY(100px);
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    padding: 12px 20px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    z-index: 1000;
                    box-shadow: var(--shadow-lg);
                    animation: toastIn 0.3s ease forwards;
                }
                .toast.hiding {
                    animation: toastOut 0.3s ease forwards;
                }
                .toast-success { border-color: var(--income-color); }
                .toast-error { border-color: var(--expense-color); }
                .toast-success .toast-icon { color: var(--income-color); }
                .toast-error .toast-icon { color: var(--expense-color); }
                @keyframes toastIn {
                    to { transform: translateX(-50%) translateY(0); }
                }
                @keyframes toastOut {
                    to { transform: translateX(-50%) translateY(100px); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// ============================================
// APP STATE
// ============================================
const AppState = {
    currentProfile: null,
    profiles: [],
    transactions: [],
    categories: [],
    debts: [],
    investments: [],
    bills: [],
    notes: [],
    notifications: [],
    settings: {
        theme: 'light',
        currency: 'TRY',
        language: 'tr'
    },
    currentPage: 'dashboard',
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    selectedDate: new Date(),

    // Global refresh function for all pages
    refreshAllPages() {
        // Refresh Dashboard
        if (typeof Dashboard !== 'undefined' && Dashboard.refresh) {
            Dashboard.refresh();
        }

        // Refresh TransactionsPage if visible
        if (this.currentPage === 'transactions' && typeof TransactionsPage !== 'undefined' && TransactionsPage.renderAll) {
            TransactionsPage.renderAll();
        }

        // Refresh CategoriesPage if visible
        if (this.currentPage === 'categories' && typeof CategoriesPage !== 'undefined' && CategoriesPage.renderCategories) {
            CategoriesPage.renderCategories();
        }

        // Refresh DebtsPage if visible
        if (this.currentPage === 'debts' && typeof DebtsPage !== 'undefined' && DebtsPage.renderDebts) {
            DebtsPage.renderDebts();
        }

        // Refresh InvestmentsPage if visible
        if (this.currentPage === 'investments' && typeof InvestmentsPage !== 'undefined' && InvestmentsPage.renderInvestments) {
            InvestmentsPage.renderInvestments();
        }

        // Refresh BillsPage if visible
        if (this.currentPage === 'bills' && typeof BillsPage !== 'undefined' && BillsPage.renderBills) {
            BillsPage.renderBills();
        }

        // Refresh NotesPage if visible
        if (this.currentPage === 'notes' && typeof NotesPage !== 'undefined' && NotesPage.renderNotes) {
            NotesPage.renderNotes();
        }

        // Refresh ReportsPage if visible
        if (this.currentPage === 'reports' && typeof ReportsPage !== 'undefined' && ReportsPage.initCharts) {
            ReportsPage.initCharts();
        }

        // Update badges (debts, bills counts)
        if (typeof DataManager !== 'undefined' && DataManager.updateBadges) {
            DataManager.updateBadges();
        }
    }
};

// ============================================
// PROFILE MANAGER
// ============================================
const ProfileManager = {
    pendingProfileSwitch: null, // For PIN verification

    async loadProfiles() {
        AppState.profiles = await DBManager.getAll('profiles');

        if (AppState.profiles.length === 0) {
            // Create default profile
            const defaultProfile = {
                id: Utils.generateId(),
                name: 'Kişisel',
                icon: 'bi:person-circle',
                currency: 'TRY',
                openingBalance: 0,
                isLocked: false,
                pin: null,
                createdAt: new Date().toISOString()
            };
            await DBManager.add('profiles', defaultProfile);
            AppState.profiles = [defaultProfile];

            // Create default categories
            await this.createDefaultCategories(defaultProfile.id);
        }

        // Load active profile from settings
        const savedProfileId = localStorage.getItem('activeProfileId');
        if (savedProfileId) {
            AppState.currentProfile = AppState.profiles.find(p => p.id === savedProfileId);
        }
        if (!AppState.currentProfile) {
            AppState.currentProfile = AppState.profiles[0];
        }

        this.updateProfileUI();
    },

    async createDefaultCategories(profileId) {
        const defaultCategories = [
            // Income categories - Fast Budget Green tones
            { id: Utils.generateId(), profileId, type: 'income', name: 'Maaş', icon: 'bi:cash-coin', color: '#4caf50' },
            { id: Utils.generateId(), profileId, type: 'income', name: 'Freelance', icon: 'bi:laptop', color: '#2196f3' },
            { id: Utils.generateId(), profileId, type: 'income', name: 'Yatırım Getirisi', icon: 'bi:graph-up-arrow', color: '#00bcd4' },
            { id: Utils.generateId(), profileId, type: 'income', name: 'Kira Geliri', icon: 'bi:house-door', color: '#ff9800' },
            { id: Utils.generateId(), profileId, type: 'income', name: 'Proje Parası', icon: 'bi:briefcase', color: '#673ab7' },
            { id: Utils.generateId(), profileId, type: 'income', name: 'Diğer Gelir', icon: 'bi:wallet2', color: '#1e88e5' },
            // Expense categories - Fast Budget style
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Gıda', icon: 'bi:cart3', color: '#f44336' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Ulaşım', icon: 'bi:car-front', color: '#ff5722' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Faturalar', icon: 'bi:receipt', color: '#ffc107' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Sağlık', icon: 'bi:heart-pulse', color: '#4caf50' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Eğlence', icon: 'bi:film', color: '#9c27b0' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Giyim', icon: 'bi:bag', color: '#e91e63' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Eğitim', icon: 'bi:book', color: '#009688' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Kira', icon: 'bi:house', color: '#3f51b5' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Dijital Medya', icon: 'bi:phone', color: '#03a9f4' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Vergi Ödemeleri', icon: 'bi:bank', color: '#795548' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Apartman Aidatı', icon: 'bi:building', color: '#ff7043' },
            { id: Utils.generateId(), profileId, type: 'expense', name: 'Diğer Gider', icon: 'bi:box-seam', color: '#607d8b' }
        ];

        for (const cat of defaultCategories) {
            await DBManager.add('categories', cat);
        }
    },

    // Mevcut profile eksik kategorileri ekle
    async checkAndAddMissingCategories(profileId) {
        const existingCategories = await DBManager.getAllByIndex('categories', 'profileId', profileId);
        const existingNames = existingCategories.map(c => c.name.toLowerCase());

        const newCategories = [
            // Yeni eklenen kategoriler
            { type: 'income', name: 'Proje Parası', icon: 'bi:briefcase', color: '#673ab7' },
            { type: 'expense', name: 'Dijital Medya', icon: 'bi:phone', color: '#03a9f4' },
            { type: 'expense', name: 'Vergi Ödemeleri', icon: 'bi:bank', color: '#795548' },
            { type: 'expense', name: 'Apartman Aidatı', icon: 'bi:building', color: '#ff7043' }
        ];

        for (const cat of newCategories) {
            if (!existingNames.includes(cat.name.toLowerCase())) {
                await DBManager.add('categories', {
                    id: Utils.generateId(),
                    profileId,
                    ...cat
                });
                console.log(`Kategori eklendi: ${cat.name}`);
            }
        }
    },

    async switchProfile(profileId) {
        const profile = AppState.profiles.find(p => p.id === profileId);

        // Check if profile is locked
        if (profile.isLocked && profile.pin) {
            this.pendingProfileSwitch = profileId;
            openPinModal(profile);
            return;
        }

        await this.completeSwitchProfile(profileId);
    },

    async completeSwitchProfile(profileId) {
        AppState.currentProfile = AppState.profiles.find(p => p.id === profileId);
        localStorage.setItem('activeProfileId', profileId);
        this.updateProfileUI();
        await DataManager.loadProfileData();

        // Refresh all pages
        Dashboard.refresh();

        // Refresh current page if not dashboard
        if (AppState.currentPage === 'transactions' && typeof TransactionsPage !== 'undefined') {
            TransactionsPage.renderAll();
        } else if (AppState.currentPage === 'categories' && typeof CategoriesPage !== 'undefined') {
            CategoriesPage.renderCategories();
        } else if (AppState.currentPage === 'debts' && typeof DebtsPage !== 'undefined') {
            DebtsPage.renderDebts();
        } else if (AppState.currentPage === 'investments' && typeof InvestmentsPage !== 'undefined') {
            InvestmentsPage.renderInvestments();
        } else if (AppState.currentPage === 'bills' && typeof BillsPage !== 'undefined') {
            BillsPage.renderBills();
        } else if (AppState.currentPage === 'notes' && typeof NotesPage !== 'undefined') {
            NotesPage.renderNotes();
        }

        closeProfileModal();
        Utils.showToast(`${AppState.currentProfile.name} profiline geçildi`, 'success');
    },

    async createProfile(data) {
        const profile = {
            id: Utils.generateId(),
            name: data.name,
            icon: data.icon || 'bi:person-circle',
            currency: data.currency || 'TRY',
            openingBalance: parseFloat(data.openingBalance) || 0,
            isLocked: data.isLocked || false,
            pin: data.pin || null,
            createdAt: new Date().toISOString()
        };

        await DBManager.add('profiles', profile);
        await this.createDefaultCategories(profile.id);
        AppState.profiles.push(profile);

        // Yeni profile otomatik geçiş yap ve verileri yükle
        AppState.currentProfile = profile;
        localStorage.setItem('activeProfileId', profile.id);
        await DataManager.loadProfileData();
        this.updateProfileUI();
        Dashboard.refresh();

        if (typeof FirebaseSync !== 'undefined' && FirebaseSync.syncEnabled) {
            FirebaseSync.syncToCloud();
        }

        Utils.showToast('Profil oluşturuldu ve geçiş yapıldı', 'success');
        this.renderProfileList();
        closeProfileModal();

        return profile;
    },

    async deleteProfile(profileId) {
        if (AppState.profiles.length <= 1) {
            Utils.showToast('En az bir profil olmalı', 'error');
            return;
        }

        await DBManager.delete('profiles', profileId);
        AppState.profiles = AppState.profiles.filter(p => p.id !== profileId);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('profiles', profileId);
        }

        if (AppState.currentProfile.id === profileId) {
            await this.switchProfile(AppState.profiles[0].id);
        }

        Utils.showToast('Profil silindi', 'success');
        this.renderProfileList();
    },

    updateProfileUI() {
        const profile = AppState.currentProfile;
        if (!profile) return;

        document.getElementById('profileAvatar').innerHTML = Utils.iconHTML(profile.icon);
        document.getElementById('profileName').textContent = profile.name;

        const currencyNames = {
            TRY: '₺ Türk Lirası',
            USD: '$ Amerikan Doları',
            EUR: '€ Euro',
            GBP: '£ İngiliz Sterlini'
        };
        document.getElementById('profileCurrency').textContent = currencyNames[profile.currency] || profile.currency;
    },

    renderProfileList() {
        const container = document.getElementById('profileList');
        if (!container) return;

        container.innerHTML = AppState.profiles.map(profile => `
            <div class="profile-item ${profile.id === AppState.currentProfile.id ? 'active' : ''}" 
                 onclick="ProfileManager.switchProfile('${profile.id}')">
                <div class="profile-item-avatar">${Utils.iconHTML(profile.icon)}</div>
                <div class="profile-item-details">
                    <div class="profile-item-name">
                        ${profile.name}
                        ${profile.isLocked ? `<span style="margin-left: 4px;">${Utils.iconHTML('bi:lock-fill')}</span>` : ''}
                    </div>
                    <div class="profile-item-currency">${profile.currency}</div>
                </div>
                <div class="profile-item-actions" style="display: flex; gap: 4px;">
                    <button class="profile-action-btn" onclick="event.stopPropagation(); ProfileManager.openLockSettings('${profile.id}')" title="${profile.isLocked ? 'Kilit Ayarları' : 'Kilitle'}">
                        ${profile.isLocked ? Utils.iconHTML('bi:key-fill') : Utils.iconHTML('bi:unlock')}
                    </button>
                    ${AppState.profiles.length > 1 ? `
                        <button class="profile-action-btn" onclick="event.stopPropagation(); ProfileManager.deleteProfile('${profile.id}')" title="Sil">${Utils.iconHTML('bi:trash3')}</button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    },

    async openLockSettings(profileId) {
        const profile = AppState.profiles.find(p => p.id === profileId);
        if (!profile) return;

        if (profile.isLocked) {
            // Show unlock/change PIN options
            const action = await Dialog.confirmAction(
                `<strong>"${profile.name}"</strong> profili kilitli.<br><br>Kilidi kaldırmak istiyor musunuz?`,
                { title: 'Kilit Ayarları', icon: 'bi:lock-fill', confirmText: 'Kilidi Kaldır' }
            );
            if (action) {
                this.promptUnlockProfile(profileId);
            }
        } else {
            // Show lock options
            this.promptLockProfile(profileId);
        }
    },

    async promptLockProfile(profileId) {
        const pin = await Dialog.prompt(
            'Profili kilitlemek için 4-6 haneli PIN kodu girin:',
            { title: 'Profili Kilitle', icon: 'bi:lock-fill', inputType: 'password', placeholder: '••••' }
        );
        if (pin && pin.length >= 4 && pin.length <= 6 && /^\d+$/.test(pin)) {
            this.setProfileLock(profileId, true, pin);
        } else if (pin !== null && pin !== '') {
            Utils.showToast('PIN kodu 4-6 haneli rakamlardan oluşmalıdır', 'error');
        }
    },

    async promptUnlockProfile(profileId) {
        const profile = AppState.profiles.find(p => p.id === profileId);
        const pin = await Dialog.prompt(
            'Kilidi kaldırmak için mevcut PIN kodunu girin:',
            { title: 'Kilidi Kaldır', icon: 'bi:unlock', inputType: 'password', placeholder: '••••' }
        );

        if (pin === profile.pin) {
            this.setProfileLock(profileId, false, null);
        } else if (pin !== null && pin !== '') {
            Utils.showToast('Yanlış PIN kodu', 'error');
        }
    },

    async setProfileLock(profileId, isLocked, pin) {
        const profile = AppState.profiles.find(p => p.id === profileId);
        if (!profile) return;

        profile.isLocked = isLocked;
        profile.pin = pin;
        profile.updatedAt = new Date().toISOString();

        await DBManager.put('profiles', profile);

        Utils.showToast(isLocked ? 'Profil kilitlendi' : 'Kilit kaldırıldı', 'success');
        this.renderProfileList();
    },

    verifyProfilePin(pin) {
        if (!this.pendingProfileSwitch) return false;

        const profile = AppState.profiles.find(p => p.id === this.pendingProfileSwitch);
        if (profile && profile.pin === pin) {
            this.completeSwitchProfile(this.pendingProfileSwitch);
            this.pendingProfileSwitch = null;
            return true;
        }
        return false;
    }
};

// ============================================
// DATA MANAGER
// ============================================
const DataManager = {
    async loadProfileData() {
        const profileId = AppState.currentProfile.id;

        AppState.transactions = await DBManager.getAllByIndex('transactions', 'profileId', profileId);
        AppState.categories = await DBManager.getAllByIndex('categories', 'profileId', profileId);
        AppState.debts = await DBManager.getAll('debts'); // Tüm profiller için ortak
        AppState.investments = await DBManager.getAllByIndex('investments', 'profileId', profileId);
        AppState.bills = await DBManager.getAll('bills'); // Tüm profiller için ortak
        AppState.notes = await DBManager.getAllByIndex('notes', 'profileId', profileId);

        // Sort transactions by date
        AppState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        this.updateBadges();
    },

    updateBadges() {
        // Update debts badge
        const activeDebts = AppState.debts.filter(d => !d.isPaid).length;
        const debtsBadge = document.getElementById('debtsBadge');
        if (debtsBadge) {
            debtsBadge.textContent = activeDebts;
            debtsBadge.style.display = activeDebts > 0 ? 'block' : 'none';
        }

        // Update bills badge - upcoming bills in next 7 days
        const now = new Date();
        const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const upcomingBills = AppState.bills.filter(b => {
            const dueDate = new Date(b.dueDate);
            return !b.isPaid && dueDate >= now && dueDate <= weekLater;
        }).length;
        const billsBadge = document.getElementById('billsBadge');
        if (billsBadge) {
            billsBadge.textContent = upcomingBills;
            billsBadge.style.display = upcomingBills > 0 ? 'block' : 'none';
        }
    },

    getMonthlyData(month, year) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);

        const monthlyTx = AppState.transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= startDate && txDate <= endDate;
        });

        const income = monthlyTx.filter(tx => tx.type === 'income')
            .reduce((sum, tx) => sum + tx.amount, 0);
        const expense = monthlyTx.filter(tx => tx.type === 'expense')
            .reduce((sum, tx) => sum + tx.amount, 0);

        return { income, expense, balance: income - expense, transactions: monthlyTx };
    },

    getCategoryTotals(type, month, year) {
        const { transactions } = this.getMonthlyData(month, year);
        const filtered = transactions.filter(tx => tx.type === type);

        const totals = {};
        filtered.forEach(tx => {
            if (!totals[tx.categoryId]) {
                const cat = AppState.categories.find(c => c.id === tx.categoryId);
                totals[tx.categoryId] = {
                    category: cat,
                    total: 0
                };
            }
            totals[tx.categoryId].total += tx.amount;
        });

        return Object.values(totals).sort((a, b) => b.total - a.total);
    }
};

// ============================================
// TRANSACTION MANAGER
// ============================================
const TransactionManager = {
    undoStack: [],
    redoStack: [],
    maxUndoSize: 50,

    async add(data) {
        const transaction = {
            id: Utils.generateId(),
            profileId: AppState.currentProfile.id,
            type: data.type,
            amount: parseFloat(data.amount),
            description: data.description || '',
            categoryId: data.categoryId,
            date: data.date,
            tags: data.tags || [],
            note: data.note || '',
            isRecurring: data.isRecurring || false,
            createdAt: new Date().toISOString()
        };

        await DBManager.add('transactions', transaction);
        AppState.transactions.unshift(transaction);
        AppState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        this.pushUndo({ action: 'add', transaction });
        this.updateUndoButton();

        const actionType = data.type === 'income' ? 'Gelir' : 'Gider';
        Utils.showToast(`${actionType} eklendi - Geri almak için Ctrl+Z`, 'success');

        // Refresh all pages
        AppState.refreshAllPages();

        return transaction;
    },

    async update(id, data) {
        const index = AppState.transactions.findIndex(tx => tx.id === id);
        if (index === -1) return null;

        const oldTransaction = { ...AppState.transactions[index] };
        const updated = { ...AppState.transactions[index], ...data, updatedAt: new Date().toISOString() };
        await DBManager.put('transactions', updated);
        AppState.transactions[index] = updated;

        this.pushUndo({ action: 'update', oldTransaction, newTransaction: updated });
        this.updateUndoButton();

        Utils.showToast('İşlem güncellendi - Geri almak için Ctrl+Z', 'success');

        // Refresh all pages
        AppState.refreshAllPages();

        return updated;
    },

    async delete(id) {
        const transaction = AppState.transactions.find(tx => tx.id === id);
        if (!transaction) return;

        await DBManager.delete('transactions', id);
        AppState.transactions = AppState.transactions.filter(tx => tx.id !== id);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('transactions', id);
        }

        this.pushUndo({ action: 'delete', transaction });
        this.updateUndoButton();

        Utils.showToast('İşlem silindi - Geri almak için Ctrl+Z', 'success');

        // Refresh all pages
        AppState.refreshAllPages();
    },

    pushUndo(action) {
        this.undoStack.push(action);
        if (this.undoStack.length > this.maxUndoSize) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    },

    async undo() {
        if (this.undoStack.length === 0) {
            Utils.showToast('Geri alınacak işlem yok', 'error');
            return;
        }

        const lastAction = this.undoStack.pop();
        this.redoStack.push(lastAction);

        switch (lastAction.action) {
            case 'add':
                await DBManager.delete('transactions', lastAction.transaction.id);
                AppState.transactions = AppState.transactions.filter(tx => tx.id !== lastAction.transaction.id);
                if (typeof FirebaseSync !== 'undefined') {
                    FirebaseSync.queueDeletion('transactions', lastAction.transaction.id);
                }
                Utils.showToast('Ekleme geri alındı', 'success');
                break;

            case 'delete':
                await DBManager.add('transactions', lastAction.transaction);
                AppState.transactions.unshift(lastAction.transaction);
                AppState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
                if (typeof FirebaseSync !== 'undefined') {
                    FirebaseSync.clearPendingDeletion('transactions', lastAction.transaction.id);
                }
                Utils.showToast('Silme geri alındı', 'success');
                break;

            case 'update':
                await DBManager.put('transactions', lastAction.oldTransaction);
                const index = AppState.transactions.findIndex(tx => tx.id === lastAction.oldTransaction.id);
                if (index !== -1) {
                    AppState.transactions[index] = lastAction.oldTransaction;
                }
                Utils.showToast('Güncelleme geri alındı', 'success');
                break;
        }

        this.updateUndoButton();
        AppState.refreshAllPages();
    },

    async redo() {
        if (this.redoStack.length === 0) {
            Utils.showToast('Yinelenecek işlem yok', 'error');
            return;
        }

        const lastRedo = this.redoStack.pop();
        this.undoStack.push(lastRedo);

        switch (lastRedo.action) {
            case 'add':
                await DBManager.add('transactions', lastRedo.transaction);
                AppState.transactions.unshift(lastRedo.transaction);
                AppState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
                if (typeof FirebaseSync !== 'undefined') {
                    FirebaseSync.clearPendingDeletion('transactions', lastRedo.transaction.id);
                }
                Utils.showToast('Ekleme yinelendi', 'success');
                break;

            case 'delete':
                await DBManager.delete('transactions', lastRedo.transaction.id);
                AppState.transactions = AppState.transactions.filter(tx => tx.id !== lastRedo.transaction.id);
                if (typeof FirebaseSync !== 'undefined') {
                    FirebaseSync.queueDeletion('transactions', lastRedo.transaction.id);
                }
                Utils.showToast('Silme yinelendi', 'success');
                break;

            case 'update':
                await DBManager.put('transactions', lastRedo.newTransaction);
                const index = AppState.transactions.findIndex(tx => tx.id === lastRedo.newTransaction.id);
                if (index !== -1) {
                    AppState.transactions[index] = lastRedo.newTransaction;
                }
                Utils.showToast('Güncelleme yinelendi', 'success');
                break;
        }

        this.updateUndoButton();
        AppState.refreshAllPages();
    },

    updateUndoButton() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        if (undoBtn) {
            undoBtn.disabled = this.undoStack.length === 0;
            undoBtn.style.opacity = this.undoStack.length === 0 ? '0.5' : '1';
            undoBtn.title = this.undoStack.length > 0
                ? `Geri Al (${this.undoStack.length}) - Ctrl+Z`
                : 'Geri alınacak işlem yok';
        }

        if (redoBtn) {
            redoBtn.disabled = this.redoStack.length === 0;
            redoBtn.style.opacity = this.redoStack.length === 0 ? '0.5' : '1';
            redoBtn.title = this.redoStack.length > 0
                ? `Yinele (${this.redoStack.length}) - Ctrl+Y`
                : 'Yinelenecek işlem yok';
        }
    },

    openEdit(id) {
        const transaction = AppState.transactions.find(tx => tx.id === id);
        if (!transaction) return;

        document.getElementById('editTransactionId').value = id;
        document.getElementById('editTransactionType').value = transaction.type;
        document.getElementById('editModalTitle').textContent = transaction.type === 'income' ? 'Gelir Düzenle' : 'Gider Düzenle';
        document.getElementById('editTransactionAmount').value = transaction.amount;
        document.getElementById('editTransactionDescription').value = transaction.description || '';
        document.getElementById('editTransactionDate').value = transaction.date;
        document.getElementById('editTransactionTags').value = transaction.tags ? transaction.tags.join(', ') : '';
        document.getElementById('editTransactionNote').value = transaction.note || '';
        document.getElementById('editTransactionRecurring').checked = transaction.isRecurring || false;

        updateCategorySelect('editTransactionCategory', transaction.type);
        setTimeout(() => {
            document.getElementById('editTransactionCategory').value = transaction.categoryId;
        }, 10);

        document.getElementById('editModal').classList.add('active');
    },

    async confirmDelete(id) {
        const transaction = AppState.transactions.find(tx => tx.id === id);
        if (!transaction) return;

        const category = AppState.categories.find(c => c.id === transaction.categoryId);
        const name = transaction.description || category?.name || 'İşlem';

        const confirmed = await Dialog.confirmDelete(name, 'işlem');
        if (confirmed) {
            closeEditModal();
            await this.delete(id);
        }
    }
};

// ============================================
// DASHBOARD
// ============================================
const Dashboard = {
    trendChart: null,
    categoryChart: null,

    refresh() {
        this.updateSummaryCards();
        this.renderCalendar();
        this.renderTransactions();
        this.updateCharts();
        DataManager.updateBadges();
    },

    updateSummaryCards() {
        const { income, expense, balance } = DataManager.getMonthlyData(
            AppState.currentMonth,
            AppState.currentYear
        );

        const currency = AppState.currentProfile?.currency || 'TRY';

        document.getElementById('totalIncome').textContent = Utils.formatCurrency(income, currency);
        document.getElementById('totalExpense').textContent = Utils.formatCurrency(expense, currency);
        document.getElementById('netBalance').textContent = Utils.formatCurrency(balance, currency);

        // Savings rate
        const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;
        document.getElementById('savingsRate').textContent = `${savingsRate}%`;

        // Calculate change from last month
        const lastMonth = DataManager.getMonthlyData(
            AppState.currentMonth === 0 ? 11 : AppState.currentMonth - 1,
            AppState.currentMonth === 0 ? AppState.currentYear - 1 : AppState.currentYear
        );

        if (lastMonth.income > 0) {
            const incomeChange = Math.round(((income - lastMonth.income) / lastMonth.income) * 100);
            document.getElementById('incomeChange').textContent = `${incomeChange >= 0 ? '+' : ''}${incomeChange}%`;
        }

        if (lastMonth.expense > 0) {
            const expenseChange = Math.round(((expense - lastMonth.expense) / lastMonth.expense) * 100);
            document.getElementById('expenseChange').textContent = `${expenseChange >= 0 ? '+' : ''}${expenseChange}%`;
        }

        // Budget progress
        const budget = AppState.currentProfile?.monthlyBudget || 10000;
        const progress = Math.min((expense / budget) * 100, 100);
        document.getElementById('budgetProgress').textContent =
            `${Utils.formatCurrency(expense, currency)} / ${Utils.formatCurrency(budget, currency)}`;
        document.getElementById('budgetBar').style.width = `${progress}%`;
        document.getElementById('budgetBar').style.background =
            progress > 90 ? 'var(--expense-gradient)' :
                progress > 70 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' :
                    'var(--accent-gradient)';
    },

    renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const title = document.getElementById('calendarTitle');

        const year = AppState.currentYear;
        const month = AppState.currentMonth;

        title.textContent = `${Utils.getMonthName(month)} ${year}`;

        // Day headers
        let html = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct']
            .map(day => `<div class="calendar-day-header">${day}</div>`)
            .join('');

        // Get first day of month and total days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        // Get transactions for this month
        const { transactions } = DataManager.getMonthlyData(month, year);
        const txByDay = {};
        transactions.forEach(tx => {
            const day = new Date(tx.date).getDate();
            if (!txByDay[day]) txByDay[day] = { income: false, expense: false };
            txByDay[day][tx.type] = true;
        });

        // Previous month days
        for (let i = firstDay - 1; i >= 0; i--) {
            html += `<div class="calendar-day other-month">${daysInPrevMonth - i}</div>`;
        }

        // Current month days
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear();
            const isSelected = day === AppState.selectedDate.getDate() &&
                month === AppState.selectedDate.getMonth() &&
                year === AppState.selectedDate.getFullYear();

            const indicators = txByDay[day] ? `
                <div class="calendar-day-indicator">
                    ${txByDay[day].income ? '<span class="indicator-dot income"></span>' : ''}
                    ${txByDay[day].expense ? '<span class="indicator-dot expense"></span>' : ''}
                </div>
            ` : '';

            html += `
                <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}"
                     onclick="Dashboard.selectDate(${day})">
                    ${day}
                    ${indicators}
                </div>
            `;
        }

        // Next month days
        const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
        for (let i = 1; i <= totalCells - firstDay - daysInMonth; i++) {
            html += `<div class="calendar-day other-month">${i}</div>`;
        }

        grid.innerHTML = html;
    },

    selectDate(day) {
        AppState.selectedDate = new Date(AppState.currentYear, AppState.currentMonth, day);
        this.renderCalendar();
        this.renderTransactions();
    },

    renderTransactions() {
        const container = document.getElementById('transactionsList');
        if (!container) return;

        // Get recent transactions (last 10)
        const recentTx = AppState.transactions.slice(0, 10);

        if (recentTx.length === 0) {
            container.innerHTML = `
                <div class="empty-state" id="emptyTransactions">
                    <div class="empty-state-icon">${Utils.iconHTML('bi:inbox')}</div>
                    <div class="empty-state-title">Henüz işlem yok</div>
                    <div class="empty-state-text">İlk gelir veya giderinizi ekleyerek başlayın</div>
                </div>
            `;
            return;
        }

        // Group by date
        const grouped = {};
        recentTx.forEach(tx => {
            const dateKey = tx.date;
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(tx);
        });

        const currency = AppState.currentProfile?.currency || 'TRY';

        let html = '';
        Object.keys(grouped).forEach(dateKey => {
            html += `<div class="transaction-group">
                <div class="transaction-date">${Utils.formatDate(dateKey)}</div>`;

            grouped[dateKey].forEach(tx => {
                const category = AppState.categories.find(c => c.id === tx.categoryId);
                html += `
                    <div class="transaction-item ${tx.type}">
                        <div class="transaction-icon" onclick="TransactionManager.openEdit('${tx.id}')">${Utils.iconHTML(category?.icon || 'bi:wallet2')}</div>
                        <div class="transaction-details" onclick="TransactionManager.openEdit('${tx.id}')">
                            <div class="transaction-name">${tx.description || category?.name || 'İşlem'}</div>
                            <div class="transaction-category">${category?.name || ''}</div>
                        </div>
                        <div class="transaction-amount" onclick="TransactionManager.openEdit('${tx.id}')">
                            ${tx.type === 'income' ? '+' : '-'}${Utils.formatCurrency(tx.amount, currency)}
                        </div>
                        <div class="transaction-actions">
                            <button class="transaction-action-btn" onclick="event.stopPropagation(); TransactionManager.openEdit('${tx.id}')" title="Düzenle">${Utils.iconHTML('bi:pencil')}</button>
                            <button class="transaction-action-btn delete" onclick="event.stopPropagation(); TransactionManager.confirmDelete('${tx.id}')" title="Sil">${Utils.iconHTML('bi:trash3')}</button>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        });

        container.innerHTML = html;
    },

    updateCharts() {
        this.updateTrendChart();
        this.updateCategoryChart();
    },

    updateTrendChart() {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;

        // Get last 6 months data
        const labels = [];
        const incomeData = [];
        const expenseData = [];

        for (let i = 5; i >= 0; i--) {
            let month = AppState.currentMonth - i;
            let year = AppState.currentYear;
            if (month < 0) {
                month += 12;
                year -= 1;
            }

            labels.push(Utils.getMonthName(month).substring(0, 3));
            const data = DataManager.getMonthlyData(month, year);
            incomeData.push(data.income);
            expenseData.push(data.expense);
        }

        if (this.trendChart) {
            this.trendChart.destroy();
        }

        this.trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Gelir',
                        data: incomeData,
                        borderColor: '#4caf50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Gider',
                        data: expenseData,
                        borderColor: '#f44336',
                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-secondary'),
                            usePointStyle: true
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-muted') }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-muted') }
                    }
                }
            }
        });
    },

    updateCategoryChart() {
        const ctx = document.getElementById('categoryChart');
        if (!ctx) return;

        const categoryTotals = DataManager.getCategoryTotals('expense', AppState.currentMonth, AppState.currentYear);

        const labels = categoryTotals.map(ct => ct.category?.name || 'Diğer');
        const data = categoryTotals.map(ct => ct.total);
        const colors = categoryTotals.map(ct => ct.category?.color || '#64748b');

        if (this.categoryChart) {
            this.categoryChart.destroy();
        }

        this.categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-secondary'),
                            usePointStyle: true,
                            padding: 15
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }
};

// ============================================
// NAVIGATION & UI
// ============================================
function navigateTo(page) {
    AppState.currentPage = page;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Update page title
    const titles = {
        dashboard: 'Ajanda',
        transactions: 'İşlemler',
        categories: 'Kategoriler',
        debts: 'Ödemeler',
        investments: 'Yatırımlar',
        bills: 'Hatırlatıcılar',
        notes: 'Notlar',
        reports: 'Analiz & Rapor',
        settings: 'Ayarlar'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;

    // Close sidebar on mobile
    if (window.innerWidth < 768) {
        document.getElementById('sidebar').classList.remove('active');
    }

    // Load page content
    loadPageContent(page);
}

function loadPageContent(page) {
    const content = document.getElementById('mainContent');

    // Hide all pages first
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));

    // Show requested page
    const pageElement = document.getElementById(`${page}Page`);
    if (pageElement) {
        pageElement.classList.remove('hidden');
        if (page === 'transactions' && typeof TransactionsPage !== 'undefined') {
            if (typeof TransactionsPage.refresh === 'function') {
                TransactionsPage.refresh();
            } else if (typeof TransactionsPage.renderAll === 'function') {
                TransactionsPage.renderAll();
            }
        } else if (page === 'debts' && typeof DebtsPage !== 'undefined') {
            if (typeof DebtsPage.refresh === 'function') {
                DebtsPage.refresh();
            } else if (typeof DebtsPage.renderDebts === 'function') {
                DebtsPage.renderDebts();
            }
        } else if (page === 'reports' && typeof ReportsPage !== 'undefined') {
            if (typeof ReportsPage.refresh === 'function') {
                ReportsPage.refresh();
            } else if (typeof ReportsPage.initCharts === 'function') {
                ReportsPage.initCharts();
            }
        }
    } else {
        // Generate page content dynamically
        generatePageContent(page);
    }
}

function generatePageContent(page) {
    const content = document.getElementById('mainContent');

    switch (page) {
        case 'transactions':
            content.innerHTML += TransactionsPage.render();
            TransactionsPage.init();
            break;
        case 'categories':
            content.innerHTML += CategoriesPage.render();
            CategoriesPage.init();
            break;
        case 'debts':
            content.innerHTML += DebtsPage.render();
            DebtsPage.init();
            break;
        case 'investments':
            content.innerHTML += InvestmentsPage.render();
            InvestmentsPage.init();
            break;
        case 'bills':
            content.innerHTML += BillsPage.render();
            BillsPage.init();
            break;
        case 'notes':
            content.innerHTML += NotesPage.render();
            NotesPage.init();
            break;
        case 'reports':
            content.innerHTML += ReportsPage.render();
            ReportsPage.init();
            break;
        case 'sync':
            content.innerHTML += SyncPage.render();
            SyncPage.init();
            break;
        case 'settings':
            content.innerHTML += SettingsPage.render();
            SettingsPage.init();
            break;
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    const themeIcon = document.getElementById('themeIcon');
    themeIcon.className = `bi ${newTheme === 'light' ? 'bi-sun-fill' : 'bi-moon-stars-fill'}`;

    // Update charts
    Dashboard.updateCharts();
}

function prevMonth() {
    AppState.currentMonth--;
    if (AppState.currentMonth < 0) {
        AppState.currentMonth = 11;
        AppState.currentYear--;
    }
    Dashboard.refresh();
}

function nextMonth() {
    AppState.currentMonth++;
    if (AppState.currentMonth > 11) {
        AppState.currentMonth = 0;
        AppState.currentYear++;
    }
    Dashboard.refresh();
}

// ============================================
// QUICK ADD
// ============================================
function openQuickAdd() {
    document.getElementById('quickAddPanel').classList.add('active');
    updateCategorySelect('quickCategory', 'expense');
}

function closeQuickAdd() {
    document.getElementById('quickAddPanel').classList.remove('active');
    document.getElementById('quickAddForm').reset();
}

function updateQuickAddType() {
    const type = document.getElementById('quickType').value;
    updateCategorySelect('quickCategory', type);
}

function updateCategorySelect(selectId, type) {
    const select = document.getElementById(selectId);
    const categories = AppState.categories.filter(c => c.type === type);

    select.innerHTML = '<option value="">Kategori seçin</option>' +
        categories.map(c => `<option value="${c.id}">${Utils.escapeHTML(c.name)}</option>`).join('');
}

function handleQuickAdd(event) {
    event.preventDefault();

    const type = document.getElementById('quickType').value;
    const amount = document.getElementById('quickAmount').value;
    const categoryId = document.getElementById('quickCategory').value;

    if (!amount || !categoryId) {
        Utils.showToast('Lütfen tüm alanları doldurun', 'error');
        return;
    }

    TransactionManager.add({
        type,
        amount,
        categoryId,
        date: Utils.formatDateInput(new Date())
    });

    closeQuickAdd();
}

function quickAddFavorite(name, categoryName, type) {
    document.getElementById('quickType').value = type;
    updateQuickAddType();

    const category = AppState.categories.find(c => c.name === categoryName && c.type === type);
    if (category) {
        document.getElementById('quickCategory').value = category.id;
    }

    document.getElementById('quickAmount').focus();
}

// ============================================
// ADD MODAL
// ============================================
function openAddModal(type) {
    document.getElementById('transactionType').value = type;
    document.getElementById('addModalTitle').textContent = type === 'income' ? 'Gelir Ekle' : 'Gider Ekle';
    Utils.setDateInputToday('transactionDate', true);

    updateCategorySelect('transactionCategory', type);

    document.getElementById('addModal').classList.add('active');
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
    document.getElementById('addTransactionForm').reset();
}

function handleAddTransaction(event) {
    event.preventDefault();

    const type = document.getElementById('transactionType').value;
    const amount = document.getElementById('transactionAmount').value;
    const description = document.getElementById('transactionDescription').value;
    const categoryId = document.getElementById('transactionCategory').value;
    const date = document.getElementById('transactionDate').value;
    const tags = document.getElementById('transactionTags').value.split(',').map(t => t.trim()).filter(t => t);
    const note = document.getElementById('transactionNote').value;
    const isRecurring = document.getElementById('transactionRecurring').checked;

    if (!amount || !categoryId || !date) {
        Utils.showToast('Lütfen zorunlu alanları doldurun', 'error');
        return;
    }

    TransactionManager.add({
        type,
        amount,
        description,
        categoryId,
        date,
        tags,
        note,
        isRecurring
    });

    closeAddModal();
}

// ============================================
// EDIT MODAL
// ============================================
function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    document.getElementById('editTransactionForm').reset();
}

function handleEditTransaction(event) {
    event.preventDefault();

    const id = document.getElementById('editTransactionId').value;
    const amount = document.getElementById('editTransactionAmount').value;
    const description = document.getElementById('editTransactionDescription').value;
    const categoryId = document.getElementById('editTransactionCategory').value;
    const date = document.getElementById('editTransactionDate').value;
    const tags = document.getElementById('editTransactionTags').value.split(',').map(t => t.trim()).filter(t => t);
    const note = document.getElementById('editTransactionNote').value;
    const isRecurring = document.getElementById('editTransactionRecurring').checked;

    if (!amount || !categoryId || !date) {
        Utils.showToast('Lütfen zorunlu alanları doldurun', 'error');
        return;
    }

    TransactionManager.update(id, {
        amount: parseFloat(amount),
        description,
        categoryId,
        date,
        tags,
        note,
        isRecurring
    });

    closeEditModal();
}

// ============================================
// PROFILE MODAL
// ============================================
function openProfileModal() {
    ProfileManager.renderProfileList();
    document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('active');
    document.getElementById('newProfileForm').classList.add('hidden');
}

function openNewProfileForm() {
    document.getElementById('newProfileForm').classList.remove('hidden');
}

function cancelNewProfile() {
    document.getElementById('newProfileForm').classList.add('hidden');
    document.getElementById('newProfileName').value = '';
    document.getElementById('newProfileBalance').value = '';
    document.getElementById('newProfileLockEnabled').checked = false;
    document.getElementById('newProfilePin').value = '';
    document.getElementById('newProfilePinGroup').classList.add('hidden');
}

function togglePinInput() {
    const lockEnabled = document.getElementById('newProfileLockEnabled').checked;
    const pinGroup = document.getElementById('newProfilePinGroup');

    if (lockEnabled) {
        pinGroup.classList.remove('hidden');
    } else {
        pinGroup.classList.add('hidden');
        document.getElementById('newProfilePin').value = '';
    }
}

function selectProfileIcon(icon) {
    document.getElementById('selectedProfileIcon').value = icon;
    document.querySelectorAll('.profile-icon-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.icon === icon);
    });
}

function createNewProfile() {
    const name = document.getElementById('newProfileName').value.trim();
    const currency = document.getElementById('newProfileCurrency').value;
    const openingBalance = document.getElementById('newProfileBalance').value;
    const icon = document.getElementById('selectedProfileIcon').value;
    const lockEnabled = document.getElementById('newProfileLockEnabled').checked;
    const pin = document.getElementById('newProfilePin').value;

    if (!name) {
        Utils.showToast('Profil adı gerekli', 'error');
        return;
    }

    if (lockEnabled) {
        if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
            Utils.showToast('PIN kodu 4-6 haneli rakamlardan oluşmalıdır', 'error');
            return;
        }
    }

    ProfileManager.createProfile({
        name,
        currency,
        openingBalance,
        icon,
        isLocked: lockEnabled,
        pin: lockEnabled ? pin : null
    });
    cancelNewProfile();
}

// PIN Modal Functions
function openPinModal(profile) {
    document.getElementById('pinModalProfileName').textContent = `Profil: ${profile.name}`;
    document.getElementById('pinInput').value = '';
    document.getElementById('pinError').classList.add('hidden');
    document.getElementById('pinModal').classList.add('active');
    setTimeout(() => document.getElementById('pinInput').focus(), 100);
}

function closePinModal() {
    document.getElementById('pinModal').classList.remove('active');
    ProfileManager.pendingProfileSwitch = null;
}

function checkPinEntry(event) {
    if (event.key === 'Enter') {
        verifyPin();
    }
}

function verifyPin() {
    const pin = document.getElementById('pinInput').value;

    if (ProfileManager.verifyProfilePin(pin)) {
        closePinModal();
    } else {
        document.getElementById('pinError').classList.remove('hidden');
        document.getElementById('pinInput').value = '';
        document.getElementById('pinInput').focus();
    }
}

// ============================================
// OTHER FUNCTIONS
// ============================================
// ============================================
// SEARCH FUNCTIONALITY
// ============================================
function openSearch() {
    document.getElementById('searchModal').classList.add('active');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = `
        <div class="empty-state" style="padding: var(--spacing-xl);">
            <div class="empty-state-icon">🔎</div>
            <div class="empty-state-text">Aramak için bir şeyler yazın</div>
        </div>
    `;
    setTimeout(() => document.getElementById('searchInput').focus(), 100);
}

function closeSearchModal() {
    document.getElementById('searchModal').classList.remove('active');
}

function performSearch(query) {
    const resultsContainer = document.getElementById('searchResults');

    if (!query || query.trim().length < 2) {
        resultsContainer.innerHTML = `
            <div class="empty-state" style="padding: var(--spacing-xl);">
                <div class="empty-state-icon">🔎</div>
                <div class="empty-state-text">En az 2 karakter girin</div>
            </div>
        `;
        return;
    }

    const searchTerm = query.toLowerCase().trim();
    const results = [];

    // Search in transactions
    AppState.transactions.forEach(t => {
        const category = AppState.categories.find(c => c.id === t.categoryId);
        const categoryName = category ? category.name : '';
        const description = t.description || '';

        if (categoryName.toLowerCase().includes(searchTerm) ||
            description.toLowerCase().includes(searchTerm)) {
            results.push({
                type: 'transaction',
                icon: category?.icon || (t.type === 'income' ? 'bi:arrow-down-circle' : 'bi:arrow-up-circle'),
                title: categoryName || (t.type === 'income' ? 'Gelir' : 'Gider'),
                subtitle: description || Utils.formatDate(t.date),
                amount: t.amount,
                isIncome: t.type === 'income',
                date: t.date
            });
        }
    });

    // Search in categories
    AppState.categories.forEach(c => {
        if (c.name.toLowerCase().includes(searchTerm)) {
            results.push({
                type: 'category',
                icon: c.icon,
                title: c.name,
                subtitle: c.type === 'income' ? 'Gelir Kategorisi' : 'Gider Kategorisi',
                color: c.color
            });
        }
    });

    // Search in debts
    AppState.debts.forEach(d => {
        if (d.person.toLowerCase().includes(searchTerm) ||
            (d.description && d.description.toLowerCase().includes(searchTerm))) {
            results.push({
                type: 'debt',
                icon: d.type === 'owed' ? 'bi:arrow-down-circle' : 'bi:arrow-up-circle',
                title: d.person,
                subtitle: d.type === 'owed' ? 'Bana Borçlu' : 'Benim Borcum',
                amount: d.amount,
                isIncome: d.type === 'owed'
            });
        }
    });

    // Search in bills
    AppState.bills.forEach(b => {
        if (b.name.toLowerCase().includes(searchTerm)) {
            results.push({
                type: 'bill',
                icon: 'bi:receipt',
                title: b.name,
                subtitle: `Her ayın ${b.dueDay || b.dueDate}. günü`,
                amount: b.amount,
                isIncome: false
            });
        }
    });

    // Search in investments
    AppState.investments.forEach(i => {
        if (i.name.toLowerCase().includes(searchTerm)) {
            const currentValue = (i.amount || i.quantity) * i.currentPrice;
            results.push({
                type: 'investment',
                icon: 'bi:graph-up-arrow',
                title: i.name,
                subtitle: i.type,
                amount: currentValue,
                isIncome: true
            });
        }
    });

    // Render results
    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state" style="padding: var(--spacing-xl);">
                <div class="empty-state-icon">${Utils.iconHTML('bi:emoji-frown')}</div>
                <div class="empty-state-text">Sonuç bulunamadı</div>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = results.map(r => `
        <div class="search-result-item" onclick="handleSearchResultClick('${r.type}')">
            <div class="search-result-icon" style="${r.color ? `background: ${r.color}20; color: ${r.color}` : ''}">${Utils.iconHTML(r.icon)}</div>
            <div class="search-result-details">
                <div class="search-result-title">${r.title}</div>
                <div class="search-result-subtitle">${r.subtitle}</div>
            </div>
            ${r.amount !== undefined ? `
                <div class="search-result-amount" style="color: ${r.isIncome ? 'var(--income-color)' : 'var(--expense-color)'}">
                    ${r.isIncome ? '+' : '-'}${Utils.formatCurrency(r.amount, 'TRY')}
                </div>
            ` : ''}
        </div>
    `).join('');
}

function handleSearchResultClick(type) {
    closeSearchModal();
    switch (type) {
        case 'transaction':
            navigateTo('transactions');
            break;
        case 'category':
            navigateTo('categories');
            break;
        case 'debt':
            navigateTo('debts');
            break;
        case 'bill':
            navigateTo('bills');
            break;
        case 'investment':
            navigateTo('investments');
            break;
    }
}

// ============================================
// NOTIFICATIONS FUNCTIONALITY
// ============================================
function openNotifications() {
    renderNotifications();
    document.getElementById('notificationsModal').classList.add('active');
}

function closeNotificationsModal() {
    document.getElementById('notificationsModal').classList.remove('active');
}

function renderNotifications() {
    const container = document.getElementById('notificationsList');
    const notifications = generateNotifications();

    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: var(--spacing-xl);">
                <div class="empty-state-icon">${Utils.iconHTML('bi:bell')}</div>
                <div class="empty-state-title">Bildirim yok</div>
                <div class="empty-state-text">Şu an için yeni bildiriminiz bulunmuyor</div>
            </div>
        `;
        return;
    }

    container.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.type}">
            <div class="notification-icon">${Utils.iconHTML(n.icon)}</div>
            <div class="notification-content">
                <div class="notification-title">${n.title}</div>
                <div class="notification-message">${n.message}</div>
                <div class="notification-time">${n.time}</div>
            </div>
        </div>
    `).join('');
}

function generateNotifications() {
    const notifications = [];
    const profileId = AppState.currentProfile?.id || null;
    const storedNotifications = (AppState.notifications || [])
        .filter(n => !n.profileId || n.profileId === profileId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    notifications.push(...storedNotifications);
    const today = new Date();
    const currentDay = today.getDate();

    // Check upcoming bills
    AppState.bills.forEach(bill => {
        const dueDay = bill.dueDay || bill.dueDate;
        const daysUntilDue = dueDay - currentDay;

        if (daysUntilDue >= 0 && daysUntilDue <= 5) {
            notifications.push({
                type: 'warning',
                icon: 'bi:receipt',
                title: 'Yaklaşan Fatura',
                message: `${bill.name} faturası ${daysUntilDue === 0 ? 'bugün' : daysUntilDue + ' gün sonra'} ödenmeli (${Utils.formatCurrency(bill.amount, 'TRY')})`,
                time: daysUntilDue === 0 ? 'Bugün' : `${daysUntilDue} gün kaldı`
            });
        }
    });

    // Check debts
    AppState.debts.forEach(debt => {
        if (debt.type === 'owe' && debt.dueDate) {
            const dueDate = new Date(debt.dueDate);
            const diffTime = dueDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= 7) {
                notifications.push({
                    type: 'warning',
                    icon: 'bi:cash-coin',
                    title: 'Yaklaşan Borç Ödeme',
                    message: `${debt.person} kişisine ${Utils.formatCurrency(debt.amount, 'TRY')} borcunuz var`,
                    time: diffDays === 0 ? 'Bugün' : `${diffDays} gün kaldı`
                });
            }
        }
    });

    // Check negative balance
    const balance = AppState.transactions.reduce((sum, t) => {
        return sum + (t.type === 'income' ? t.amount : -t.amount);
    }, AppState.currentProfile?.openingBalance || 0);

    if (balance < 0) {
        notifications.push({
            type: 'danger',
            icon: 'bi:exclamation-triangle',
            title: 'Negatif Bakiye',
            message: `Bakiyeniz ${Utils.formatCurrency(Math.abs(balance), 'TRY')} eksiye düştü`,
            time: 'Şimdi'
        });
    }

    // Monthly summary notification (if first 3 days of month)
    if (currentDay <= 3) {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthTransactions = AppState.transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate.getMonth() === lastMonth.getMonth() && tDate.getFullYear() === lastMonth.getFullYear();
        });

        if (lastMonthTransactions.length > 0) {
            const income = lastMonthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const expense = lastMonthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

            notifications.push({
                type: 'info',
                icon: 'bi:pie-chart',
                title: 'Geçen Ay Özeti',
                message: `Gelir: ${Utils.formatCurrency(income, 'TRY')}, Gider: ${Utils.formatCurrency(expense, 'TRY')}`,
                time: 'Bu ay'
            });
        }
    }

    // Welcome notification if no transactions
    if (AppState.transactions.length === 0) {
        notifications.push({
            type: 'info',
            icon: 'bi:emoji-smile',
            title: 'Hoş Geldiniz!',
            message: 'İlk işleminizi ekleyerek finanslarınızı takip etmeye başlayın',
            time: 'Şimdi'
        });
    }

    return notifications;
}

function clearAllNotifications() {
    AppState.notifications = [];
    Utils.showToast('Bildirimler temizlendi', 'success');
    closeNotificationsModal();
}

// ============================================
// PAGE MODULES
// ============================================
const TransactionsPage = {
    currentFilter: 'all',
    currentMonth: null,
    searchTerm: '',
    currentType: 'income',

    render() {
        return `
            <div id="transactionsPage" class="page-content">
                <div class="two-panel-grid">
                    <!-- Left Panel - Yeni İşlem Ekle -->
                    <div class="chart-container" style="background: var(--bg-card); height: fit-content; max-height: 100%; overflow-y: auto;">
                        <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">Yeni İşlem Ekle</h3>
                        
                        <!-- Type Selector -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm); margin-bottom: var(--spacing-lg);">
                            <button class="transaction-type-btn active" data-type="income" onclick="TransactionsPage.selectType('income')" 
                                    style="padding: var(--spacing-md); border-radius: var(--radius-md); border: 2px solid var(--income-color); background: var(--income-bg); color: var(--income-color); font-weight: 600; cursor: pointer; transition: all 0.2s;">
                                <div style="font-size: 1.5rem; margin-bottom: var(--spacing-xs);">${Utils.iconHTML('bi:arrow-down-circle')}</div>
                                Gelir
                            </button>
                            <button class="transaction-type-btn" data-type="expense" onclick="TransactionsPage.selectType('expense')" 
                                    style="padding: var(--spacing-md); border-radius: var(--radius-md); border: 2px solid var(--border-color); background: var(--bg-input); color: var(--text-secondary); font-weight: 600; cursor: pointer; transition: all 0.2s;">
                                <div style="font-size: 1.5rem; margin-bottom: var(--spacing-xs);">${Utils.iconHTML('bi:arrow-up-circle')}</div>
                                Gider
                            </button>
                        </div>
                        
                        <form id="quickTransactionForm" onsubmit="TransactionsPage.handleQuickAdd(event)">
                            <input type="hidden" id="quickTransactionType" value="income">
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Kategori</label>
                                <select class="form-input" id="quickTransactionCategory" required>
                                    <option value="">Kategori seçin</option>
                                </select>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Tutar (₺)</label>
                                <input type="number" class="form-input" id="quickTransactionAmount" placeholder="0.00" step="0.01" required style="font-size: 1.2rem; text-align: right;">
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Açıklama (Opsiyonel)</label>
                                <input type="text" class="form-input" id="quickTransactionDescription" placeholder="İşlem açıklaması">
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Tarih</label>
                                <input type="date" class="form-input" id="quickTransactionDate" required>
                            </div>
                            
                            <button type="submit" class="btn btn-income" id="quickSubmitBtn" style="width: 100%; padding: var(--spacing-md); font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: var(--spacing-sm);">
                                <span style="font-size: 1.2rem;">${Utils.iconHTML('bi:plus-lg')}</span>
                                <span>İşlem Ekle</span>
                            </button>
                        </form>
                    </div>
                    
                    <!-- Right Panel - Son İşlemler -->
                    <div class="chart-container" style="background: var(--bg-card); display: flex; flex-direction: column; max-height: 100%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-shrink: 0;">
                            <h3 style="font-size: 1.1rem; font-weight: 600;">Son İşlemler</h3>
                            <div style="color: var(--text-secondary); font-size: 0.9rem;">
                                <span id="transactionCount">0 işlem</span>
                            </div>
                        </div>
                        
                        <!-- Filters -->
                        <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md); flex-shrink: 0; flex-wrap: wrap;">
                            <select class="form-input" id="transactionTypeFilter" style="flex: 1; min-width: 120px; font-size: 0.9rem; padding: var(--spacing-sm) var(--spacing-md);" onchange="TransactionsPage.applyFilters()">
                                <option value="all">Tüm İşlemler</option>
                                <option value="income">Gelirler</option>
                                <option value="expense">Giderler</option>
                            </select>
                            <input type="month" class="form-input" id="transactionMonthFilter" style="flex: 1; min-width: 140px; font-size: 0.9rem; padding: var(--spacing-sm) var(--spacing-md);" onchange="TransactionsPage.applyFilters()">
                        </div>
                        
                        <div id="allTransactionsList" class="panel-list">
                            <div id="allTransactionsListContent">
                                <!-- Transactions will be rendered here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    init() {
        // Set current month as default
        const now = new Date();
        const monthInput = document.getElementById('transactionMonthFilter');
        if (monthInput) {
            monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        // Set current date
        Utils.setDateInputToday('quickTransactionDate', true);

        // Initialize with income type (default)
        setTimeout(() => {
            this.selectType('income');
        }, 100);

        this.renderAll();
    },

    refresh() {
        this.updateQuickCategories();
        Utils.setDateInputToday('quickTransactionDate', true);
        this.renderAll();
    },

    selectType(type) {
        this.currentType = type;
        document.getElementById('quickTransactionType').value = type;

        // Update button styles
        document.querySelectorAll('.transaction-type-btn').forEach(btn => {
            const btnType = btn.dataset.type;
            if (btnType === type) {
                btn.classList.add('active');
                if (type === 'income') {
                    btn.style.border = '2px solid var(--income-color)';
                    btn.style.background = 'var(--income-bg)';
                    btn.style.color = 'var(--income-color)';
                } else {
                    btn.style.border = '2px solid var(--expense-color)';
                    btn.style.background = 'var(--expense-bg)';
                    btn.style.color = 'var(--expense-color)';
                }
            } else {
                btn.classList.remove('active');
                btn.style.border = '2px solid var(--border-color)';
                btn.style.background = 'var(--bg-input)';
                btn.style.color = 'var(--text-secondary)';
            }
        });

        // Update submit button
        const submitBtn = document.getElementById('quickSubmitBtn');
        submitBtn.className = `btn btn-${type}`;

        // Update categories
        this.updateQuickCategories();
    },

    updateQuickCategories() {
        const select = document.getElementById('quickTransactionCategory');
        if (!select) {
            console.warn('quickTransactionCategory select not found');
            return;
        }

        const categories = AppState.categories.filter(c => c.type === this.currentType);
        console.log(`Loading ${this.currentType} categories:`, categories.length);

        select.innerHTML = '<option value="">Kategori seçin</option>' +
            categories.map(c => `<option value="${c.id}">${Utils.escapeHTML(c.name)}</option>`).join('');
    },

    handleQuickAdd(event) {
        event.preventDefault();

        const type = document.getElementById('quickTransactionType').value;
        const amount = document.getElementById('quickTransactionAmount').value;
        const categoryId = document.getElementById('quickTransactionCategory').value;
        const description = document.getElementById('quickTransactionDescription').value;
        const date = document.getElementById('quickTransactionDate').value;

        if (!amount || !categoryId || !date) {
            Utils.showToast('Lütfen zorunlu alanları doldurun', 'error');
            return;
        }

        TransactionManager.add({
            type,
            amount,
            categoryId,
            description,
            date,
            tags: [],
            note: '',
            isRecurring: false
        });

        // Clear form but keep the type
        document.getElementById('quickTransactionAmount').value = '';
        document.getElementById('quickTransactionDescription').value = '';
        document.getElementById('quickTransactionCategory').value = '';
        Utils.setDateInputToday('quickTransactionDate', true);

        // Keep focus on amount field for quick entry
        setTimeout(() => {
            document.getElementById('quickTransactionAmount').focus();
        }, 100);
    },

    renderAll() {
        const container = document.getElementById('allTransactionsListContent');
        if (!container) return;

        let filteredTransactions = [...AppState.transactions];

        // Apply type filter
        const typeFilter = document.getElementById('transactionTypeFilter')?.value || 'all';
        if (typeFilter !== 'all') {
            filteredTransactions = filteredTransactions.filter(tx => tx.type === typeFilter);
        }

        // Apply month filter
        const monthFilter = document.getElementById('transactionMonthFilter')?.value;
        if (monthFilter) {
            const [year, month] = monthFilter.split('-');
            filteredTransactions = filteredTransactions.filter(tx => {
                const txDate = new Date(tx.date);
                return txDate.getFullYear() === parseInt(year) &&
                    txDate.getMonth() === parseInt(month) - 1;
            });
        }

        // Apply search filter
        const searchFilter = document.getElementById('transactionSearchFilter')?.value.toLowerCase() || '';
        if (searchFilter) {
            filteredTransactions = filteredTransactions.filter(tx => {
                const category = AppState.categories.find(c => c.id === tx.categoryId);
                const categoryName = category ? category.name.toLowerCase() : '';
                const description = tx.description ? tx.description.toLowerCase() : '';
                const note = tx.note ? tx.note.toLowerCase() : '';

                return categoryName.includes(searchFilter) ||
                    description.includes(searchFilter) ||
                    note.includes(searchFilter);
            });
        }

        // Update count
        const countEl = document.getElementById('transactionCount');
        if (countEl) {
            const totalAmount = filteredTransactions.reduce((sum, tx) => {
                return sum + (tx.type === 'income' ? tx.amount : -tx.amount);
            }, 0);
            const currency = AppState.currentProfile?.currency || 'TRY';
            countEl.innerHTML = `
                ${filteredTransactions.length} işlem 
                <span style="color: ${totalAmount >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}; font-weight: 600; margin-left: var(--spacing-sm);">
                    (${totalAmount >= 0 ? '+' : ''}${Utils.formatCurrency(totalAmount, currency)})
                </span>
            `;
        }

        if (filteredTransactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: var(--spacing-xl) var(--spacing-lg);">
                    <div class="empty-state-icon">${Utils.iconHTML('bi:inbox')}</div>
                    <div class="empty-state-title">İşlem bulunamadı</div>
                    <div class="empty-state-text">Arama kriterlerinize uygun işlem yok</div>
                </div>
            `;
            return;
        }

        // Group by date
        const grouped = {};
        filteredTransactions.forEach(tx => {
            const dateKey = tx.date;
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(tx);
        });

        const currency = AppState.currentProfile?.currency || 'TRY';

        let html = '';
        Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a)).forEach(dateKey => {
            const dayTotal = grouped[dateKey].reduce((sum, tx) => {
                return sum + (tx.type === 'income' ? tx.amount : -tx.amount);
            }, 0);

            html += `
                <div class="transaction-group" style="padding: 0 var(--spacing-md);">
                    <div class="transaction-date" style="display: flex; justify-content: space-between; align-items: center;">
                        <span>${Utils.formatDate(dateKey, 'long')}</span>
                        <span style="font-size: 0.85rem; color: ${dayTotal >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}; font-weight: 600;">
                            ${dayTotal >= 0 ? '+' : ''}${Utils.formatCurrency(dayTotal, currency)}
                        </span>
                    </div>
            `;

            grouped[dateKey].forEach(tx => {
                const category = AppState.categories.find(c => c.id === tx.categoryId);
                html += `
                        <div class="transaction-item ${tx.type}">
                        <div class="transaction-icon" onclick="TransactionManager.openEdit('${tx.id}')">${Utils.iconHTML(category?.icon || 'bi:wallet2')}</div>
                        <div class="transaction-details" onclick="TransactionManager.openEdit('${tx.id}')">
                            <div class="transaction-name">${tx.description || category?.name || 'İşlem'}</div>
                            <div class="transaction-category">${category?.name || ''}${tx.note ? ' • ' + tx.note.substring(0, 30) + (tx.note.length > 30 ? '...' : '') : ''}</div>
                        </div>
                        <div class="transaction-amount" onclick="TransactionManager.openEdit('${tx.id}')">
                            ${tx.type === 'income' ? '+' : '-'}${Utils.formatCurrency(tx.amount, currency)}
                        </div>
                        <div class="transaction-actions">
                            <button class="transaction-action-btn" onclick="event.stopPropagation(); TransactionManager.openEdit('${tx.id}')" title="Düzenle">${Utils.iconHTML('bi:pencil')}</button>
                            <button class="transaction-action-btn delete" onclick="event.stopPropagation(); TransactionManager.confirmDelete('${tx.id}')" title="Sil">${Utils.iconHTML('bi:trash3')}</button>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        });

        container.innerHTML = html;
    },

    applyFilters() {
        this.renderAll();
    }
};

const CategoriesPage = {
    editingCategory: null,

    render() {
        return `
            <div id="categoriesPage" class="page-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg); padding: 0 var(--spacing-md);">
                    <div>
                        <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: var(--spacing-xs);">Kategoriler</h2>
                        <p style="font-size: 0.9rem; color: var(--text-secondary); margin: 0;">Gelir ve gider kategorilerinizi yönetin</p>
                    </div>
                    <button class="btn btn-primary" onclick="CategoriesPage.openAddModal()" style="display: flex; align-items: center; gap: var(--spacing-sm);">
                        <span style="font-size: 1.2rem;">+</span>
                        <span>Yeni Kategori</span>
                    </button>
                </div>
                
                <!-- Category Stats -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-lg); padding: 0 var(--spacing-md);">
                    <div style="background: linear-gradient(135deg, var(--income-color) 0%, #66bb6a 100%); padding: var(--spacing-md) var(--spacing-lg); border-radius: var(--radius-md); color: white;">
                        <div style="font-size: 1.5rem; margin-bottom: var(--spacing-xs);">${Utils.iconHTML('bi:arrow-down-circle')}</div>
                        <div style="font-size: 0.8rem; opacity: 0.9; margin-bottom: 2px;">Gelir Kategorileri</div>
                        <div style="font-size: 1.75rem; font-weight: 700;" id="incomeCategoryCount">0</div>
                    </div>
                        <div style="background: linear-gradient(135deg, var(--expense-color) 0%, #ef5350 100%); padding: var(--spacing-md) var(--spacing-lg); border-radius: var(--radius-md); color: white;">
                            <div style="font-size: 1.5rem; margin-bottom: var(--spacing-xs);">${Utils.iconHTML('bi:arrow-up-circle')}</div>
                            <div style="font-size: 0.8rem; opacity: 0.9; margin-bottom: 2px;">Gider Kategorileri</div>
                            <div style="font-size: 1.75rem; font-weight: 700;" id="expenseCategoryCount">0</div>
                        </div>
                        <div style="background: linear-gradient(135deg, var(--accent-primary) 0%, #42a5f5 100%); padding: var(--spacing-md) var(--spacing-lg); border-radius: var(--radius-md); color: white;">
                            <div style="font-size: 1.5rem; margin-bottom: var(--spacing-xs);">${Utils.iconHTML('bi:pie-chart')}</div>
                            <div style="font-size: 0.8rem; opacity: 0.9; margin-bottom: 2px;">Toplam Kategori</div>
                            <div style="font-size: 1.75rem; font-weight: 700;" id="totalCategoryCount">0</div>
                        </div>
                </div>
                
                <div class="auto-grid-320">
                    <div class="chart-container">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
                            <h3 style="color: var(--income-color); font-size: 1.1rem; font-weight: 600;">${Utils.iconHTML('bi:arrow-down-circle')} Gelir Kategorileri</h3>
                            <button class="btn btn-income" onclick="CategoriesPage.openAddModal('income')" style="font-size: 0.85rem; padding: var(--spacing-xs) var(--spacing-sm);">+ Ekle</button>
                        </div>
                        <div id="incomeCategoriesList" style="max-height: 600px; overflow-y: auto;"></div>
                    </div>
                    <div class="chart-container">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
                            <h3 style="color: var(--expense-color); font-size: 1.1rem; font-weight: 600;">${Utils.iconHTML('bi:arrow-up-circle')} Gider Kategorileri</h3>
                            <button class="btn btn-expense" onclick="CategoriesPage.openAddModal('expense')" style="font-size: 0.85rem; padding: var(--spacing-xs) var(--spacing-sm);">+ Ekle</button>
                        </div>
                        <div id="expenseCategoriesList" style="max-height: 600px; overflow-y: auto;"></div>
                    </div>
                </div>
            </div>
            
            <!-- Category Modal -->
            <div class="modal-overlay" id="categoryModal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title" id="categoryModalTitle">Yeni Kategori</h3>
                        <button class="modal-close" onclick="CategoriesPage.closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="categoryForm" onsubmit="CategoriesPage.handleSubmit(event)">
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Kategori Türü *</label>
                                <select class="form-input" id="categoryType" required>
                                    <option value="expense">Gider</option>
                                    <option value="income">Gelir</option>
                                </select>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Kategori Adı *</label>
                                <input type="text" class="form-input" id="categoryName" placeholder="Örn: Market, Kira, Maaş" required>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">İkon Seçin</label>
                                <div id="iconPicker" style="display: flex; flex-wrap: wrap; gap: var(--spacing-sm); max-height: 150px; overflow-y: auto; padding: var(--spacing-sm); background: var(--bg-input); border-radius: var(--radius-md);">
                                    <!-- Icons will be rendered by JS -->
                                </div>
                                <input type="hidden" id="categoryIcon" value="bi:folder">
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Renk Seçin</label>
                                <div id="colorPicker" style="display: flex; flex-wrap: wrap; gap: var(--spacing-sm);">
                                    <!-- Colors will be rendered by JS -->
                                </div>
                                <input type="hidden" id="categoryColor" value="#1e88e5">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="CategoriesPage.closeModal()">İptal</button>
                        <button class="btn btn-expense" id="categoryDeleteBtn" onclick="CategoriesPage.deleteCategory()" style="display: none;">Sil</button>
                        <button class="btn btn-primary" onclick="document.getElementById('categoryForm').requestSubmit()">Kaydet</button>
                    </div>
                </div>
            </div>
        `;
    },

    init() {
        this.renderCategories();
        this.initIconPicker();
        this.initColorPicker();
    },

    availableIcons: [
        'bi:cart3', 'bi:cart-check', 'bi:basket', 'bi:cup-hot', 'bi:egg-fried', 'bi:bag', 'bi:gift', 'bi:balloon',
        'bi:car-front', 'bi:bus-front', 'bi:train-front', 'bi:airplane', 'bi:fuel-pump', 'bi:bicycle',
        'bi:house', 'bi:house-door', 'bi:building', 'bi:bank2', 'bi:hospital', 'bi:shop', 'bi:shop-window',
        'bi:lightbulb', 'bi:phone', 'bi:laptop', 'bi:tv', 'bi:headphones', 'bi:controller', 'bi:camera',
        'bi:heart-pulse', 'bi:bandage', 'bi:thermometer', 'bi:capsule', 'bi:eyeglasses', 'bi:person-walking',
        'bi:book', 'bi:mortarboard', 'bi:journal-text', 'bi:pencil', 'bi:palette', 'bi:music-note', 'bi:film',
        'bi:cash-coin', 'bi:wallet2', 'bi:credit-card', 'bi:graph-up-arrow', 'bi:graph-down-arrow', 'bi:coin', 'bi:gem',
        'bi:flower1', 'bi:tree', 'bi:sun', 'bi:moon-stars',
        'bi:file-earmark-text', 'bi:receipt', 'bi:box-seam', 'bi:gear', 'bi:tools', 'bi:hammer', 'bi:wrench-adjustable',
        'bi:question-circle', 'bi:exclamation-circle', 'bi:check-circle', 'bi:x-circle', 'bi:star', 'bi:bell', 'bi:folder', 'bi:folder2-open'
    ],

    availableColors: [
        '#f44336', '#e91e63', '#9c27b0', '#673ab7',
        '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
        '#009688', '#4caf50', '#8bc34a', '#cddc39',
        '#ffeb3b', '#ffc107', '#ff9800', '#ff5722',
        '#795548', '#9e9e9e', '#607d8b', '#1e88e5'
    ],

    initIconPicker() {
        const container = document.getElementById('iconPicker');
        if (!container) return;

        container.innerHTML = this.availableIcons.map(icon => `
            <button type="button" class="icon-picker-btn" onclick="CategoriesPage.selectIcon('${icon}')" 
                    style="width: 40px; height: 40px; font-size: 1.25rem; background: var(--bg-card); border: 2px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.15s ease;"
                    data-icon="${icon}">
                ${Utils.iconHTML(icon)}
            </button>
        `).join('');

        // Select first icon by default
        this.selectIcon('bi:folder');
    },

    initColorPicker() {
        const container = document.getElementById('colorPicker');
        if (!container) return;

        container.innerHTML = this.availableColors.map(color => `
            <button type="button" class="color-picker-btn" onclick="CategoriesPage.selectColor('${color}')"
                    style="width: 36px; height: 36px; background: ${color}; border: 3px solid transparent; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.15s ease;"
                    data-color="${color}">
            </button>
        `).join('');

        // Select first color by default
        this.selectColor('#1e88e5');
    },

    selectIcon(icon) {
        document.getElementById('categoryIcon').value = icon;
        document.querySelectorAll('.icon-picker-btn').forEach(btn => {
            btn.style.borderColor = btn.dataset.icon === icon ? 'var(--accent-primary)' : 'var(--border-color)';
            btn.style.background = btn.dataset.icon === icon ? 'var(--bg-card-hover)' : 'var(--bg-card)';
        });
    },

    selectColor(color) {
        document.getElementById('categoryColor').value = color;
        document.querySelectorAll('.color-picker-btn').forEach(btn => {
            btn.style.borderColor = btn.dataset.color === color ? 'var(--text-primary)' : 'transparent';
            btn.style.transform = btn.dataset.color === color ? 'scale(1.15)' : 'scale(1)';
        });
    },

    renderCategories() {
        const incomeList = document.getElementById('incomeCategoriesList');
        const expenseList = document.getElementById('expenseCategoriesList');

        if (!incomeList || !expenseList) return;

        const incomeCategories = AppState.categories.filter(c => c.type === 'income');
        const expenseCategories = AppState.categories.filter(c => c.type === 'expense');

        // Update counts
        const incomeCategoryCount = document.getElementById('incomeCategoryCount');
        const expenseCategoryCount = document.getElementById('expenseCategoryCount');
        const totalCategoryCount = document.getElementById('totalCategoryCount');

        if (incomeCategoryCount) incomeCategoryCount.textContent = incomeCategories.length;
        if (expenseCategoryCount) expenseCategoryCount.textContent = expenseCategories.length;
        if (totalCategoryCount) totalCategoryCount.textContent = AppState.categories.length;

        incomeList.innerHTML = incomeCategories.length > 0
            ? incomeCategories.map(c => this.renderCategoryItem(c)).join('')
            : `<div class="empty-state" style="padding: var(--spacing-xl);">
                <div class="empty-state-icon">${Utils.iconHTML('bi:arrow-down-circle')}</div>
                <div class="empty-state-title">Gelir kategorisi yok</div>
                <div class="empty-state-text">Yeni gelir kategorisi ekleyin</div>
            </div>`;

        expenseList.innerHTML = expenseCategories.length > 0
            ? expenseCategories.map(c => this.renderCategoryItem(c)).join('')
            : `<div class="empty-state" style="padding: var(--spacing-xl);">
                <div class="empty-state-icon">${Utils.iconHTML('bi:arrow-up-circle')}</div>
                <div class="empty-state-title">Gider kategorisi yok</div>
                <div class="empty-state-text">Yeni gider kategorisi ekleyin</div>
            </div>`;
    },

    renderCategoryItem(category) {
        // Count transactions using this category
        const transactionCount = AppState.transactions.filter(t => t.categoryId === category.id).length;
        const totalAmount = AppState.transactions
            .filter(t => t.categoryId === category.id)
            .reduce((sum, t) => sum + t.amount, 0);
        const currency = AppState.currentProfile?.currency || 'TRY';

        return `
            <div class="transaction-item" style="background: var(--bg-input); margin-bottom: var(--spacing-xs); position: relative; padding: var(--spacing-sm) var(--spacing-md);">
                <div class="transaction-icon" style="background: ${category.color}20; color: ${category.color}; font-size: 1.25rem; width: 36px; height: 36px;">
                    ${Utils.iconHTML(category.icon)}
                </div>
                <div class="transaction-details" style="margin-right: 60px;">
                    <div class="transaction-name" style="font-weight: 600; font-size: 0.9rem;">${category.name}</div>
                    <div class="transaction-category" style="font-size: 0.75rem; display: flex; align-items: center; gap: var(--spacing-xs);">
                        <span style="color: ${category.color};">●</span>
                        <span>${transactionCount} işlem</span>
                        ${totalAmount > 0 ? `<span style="color: ${category.type === 'income' ? 'var(--income-color)' : 'var(--expense-color)'}; font-weight: 600;">• ${Utils.formatCurrency(totalAmount, currency)}</span>` : ''}
                    </div>
                </div>
                <div class="transaction-actions" style="opacity: 1;">
                    <button class="transaction-action-btn" onclick="event.stopPropagation(); CategoriesPage.openEditModal('${category.id}')" title="Düzenle" style="width: 28px; height: 28px; font-size: 0.85rem;">${Utils.iconHTML('bi:pencil')}</button>
                    <button class="transaction-action-btn delete" onclick="event.stopPropagation(); CategoriesPage.confirmDelete('${category.id}')" title="Sil" style="width: 28px; height: 28px; font-size: 0.85rem;">${Utils.iconHTML('bi:trash3')}</button>
                </div>
            </div>
        `;
    },

    openAddModal(defaultType = null) {
        this.editingCategory = null;
        document.getElementById('categoryModalTitle').textContent = 'Yeni Kategori';
        document.getElementById('categoryDeleteBtn').style.display = 'none';
        document.getElementById('categoryForm').reset();
        document.getElementById('categoryType').value = defaultType || 'expense';

        // Reset pickers
        this.selectIcon('bi:folder');
        this.selectColor('#1e88e5');

        document.getElementById('categoryModal').classList.add('active');
    },

    openEditModal(categoryId) {
        const category = AppState.categories.find(c => c.id === categoryId);
        if (!category) return;

        this.editingCategory = category;
        document.getElementById('categoryModalTitle').textContent = 'Kategori Düzenle';
        document.getElementById('categoryDeleteBtn').style.display = 'inline-flex';

        document.getElementById('categoryType').value = category.type;
        document.getElementById('categoryName').value = category.name;

        this.selectIcon(category.icon);
        this.selectColor(category.color);

        document.getElementById('categoryModal').classList.add('active');
    },

    closeModal() {
        document.getElementById('categoryModal').classList.remove('active');
        this.editingCategory = null;
    },

    async handleSubmit(event) {
        event.preventDefault();

        const type = document.getElementById('categoryType').value;
        const name = document.getElementById('categoryName').value.trim();
        const icon = document.getElementById('categoryIcon').value;
        const color = document.getElementById('categoryColor').value;

        if (!name) {
            Utils.showToast('Kategori adı gerekli', 'error');
            return;
        }

        if (this.editingCategory) {
            // Update existing category
            const updated = {
                ...this.editingCategory,
                type,
                name,
                icon,
                color,
                updatedAt: new Date().toISOString()
            };

            await DBManager.put('categories', updated);
            const index = AppState.categories.findIndex(c => c.id === this.editingCategory.id);
            if (index !== -1) {
                AppState.categories[index] = updated;
            }

            Utils.showToast('Kategori güncellendi', 'success');
        } else {
            // Create new category
            const newCategory = {
                id: Utils.generateId(),
                profileId: AppState.currentProfile.id,
                type,
                name,
                icon,
                color,
                createdAt: new Date().toISOString()
            };

            await DBManager.add('categories', newCategory);
            AppState.categories.push(newCategory);

            Utils.showToast('Kategori eklendi', 'success');
        }

        this.closeModal();
        this.renderCategories();
    },

    async confirmDelete(categoryId) {
        const category = AppState.categories.find(c => c.id === categoryId);
        if (!category) return;

        // Check if category is used in any transaction
        const usedInTransactions = AppState.transactions.some(t => t.categoryId === categoryId);

        if (usedInTransactions) {
            Utils.showToast('Bu kategori işlemlerde kullanılıyor, silinemez', 'error');
            return;
        }

        const confirmed = await Dialog.confirmDelete(category.name, 'kategori');
        if (confirmed) {
            this.deleteCategory(categoryId);
        }
    },

    async deleteCategory(categoryId = null) {
        const id = categoryId || this.editingCategory?.id;
        if (!id) return;

        const category = AppState.categories.find(c => c.id === id);
        if (!category) return;

        // Check if category is used in any transaction
        const usedInTransactions = AppState.transactions.some(t => t.categoryId === id);

        if (usedInTransactions) {
            Utils.showToast('Bu kategori işlemlerde kullanılıyor, silinemez', 'error');
            return;
        }

        await DBManager.delete('categories', id);
        AppState.categories = AppState.categories.filter(c => c.id !== id);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('categories', id);
        }

        Utils.showToast('Kategori silindi', 'success');
        this.closeModal();
        this.renderCategories();
    }
};

const DebtsPage = {
    editingDebt: null,

    render() {
        return `
            <div id="debtsPage" class="page-content">
                <div class="two-panel-grid">
                    <!-- Left Panel - Yeni Ödeme Ekle -->
                    <div class="chart-container" style="background: var(--bg-card); height: fit-content; max-height: 100%; overflow-y: auto;">
                        <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">Yeni Ödeme Ekle</h3>
                        
                        <!-- Type Selector -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm); margin-bottom: var(--spacing-lg);">
                            <button class="debt-type-btn active" data-type="borrowed" onclick="DebtsPage.selectType('borrowed')" 
                                    style="padding: var(--spacing-md); border-radius: var(--radius-md); border: 2px solid var(--income-color); background: var(--income-bg); color: var(--income-color); font-weight: 600; cursor: pointer; transition: all 0.2s;">
                                <div style="font-size: 1.5rem; margin-bottom: var(--spacing-xs);">${Utils.iconHTML('bi:arrow-down-circle')}</div>
                                Gelen
                            </button>
                            <button class="debt-type-btn" data-type="lent" onclick="DebtsPage.selectType('lent')" 
                                    style="padding: var(--spacing-md); border-radius: var(--radius-md); border: 2px solid var(--border-color); background: var(--bg-input); color: var(--text-secondary); font-weight: 600; cursor: pointer; transition: all 0.2s;">
                                <div style="font-size: 1.5rem; margin-bottom: var(--spacing-xs);">${Utils.iconHTML('bi:arrow-up-circle')}</div>
                                Yapılan
                            </button>
                        </div>
                        
                        <form id="quickDebtForm" onsubmit="DebtsPage.handleQuickAdd(event)">
                            <input type="hidden" id="quickDebtType" value="borrowed">
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Kişi/Kurum</label>
                                <input type="text" class="form-input" id="quickDebtPerson" placeholder="Kimden / kime?" required>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Tutar (₺)</label>
                                <input type="number" class="form-input" id="quickDebtAmount" placeholder="0.00" step="0.01" required style="font-size: 1.2rem; text-align: right;">
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Vade Tarihi (Opsiyonel)</label>
                                <input type="date" class="form-input" id="quickDebtDueDate">
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Notlar (Opsiyonel)</label>
                                <textarea class="form-input" id="quickDebtNotes" rows="3" placeholder="Ek bilgiler..."></textarea>
                            </div>
                            
                            <button type="submit" class="btn btn-income" id="quickDebtSubmitBtn" style="width: 100%; padding: var(--spacing-md); font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: var(--spacing-sm);">
                                <span style="font-size: 1.2rem;">${Utils.iconHTML('bi:plus-lg')}</span>
                                <span>Ödeme Ekle</span>
                            </button>
                        </form>
                    </div>
                    
                    <!-- Right Panel - Ödemeler Listesi -->
                    <div class="chart-container" style="background: var(--bg-card); display: flex; flex-direction: column; max-height: 100%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-shrink: 0;">
                            <h3 style="font-size: 1.1rem; font-weight: 600;">Ödemeler</h3>
                            <div style="display: flex; gap: var(--spacing-lg);">
                                <div style="text-align: center;">
                                    <div style="font-size: 0.75rem; color: var(--income-color);">Gelen</div>
                                    <div style="font-weight: 600; color: var(--income-color);" id="totalBorrowed">₺0</div>
                                </div>
                                <div style="text-align: center;">
                                    <div style="font-size: 0.75rem; color: var(--expense-color);">Yapılan</div>
                                    <div style="font-weight: 600; color: var(--expense-color);" id="totalLent">₺0</div>
                                </div>
                            </div>
                        </div>
                        
                        <div id="allDebtsList" class="panel-list">
                            <div id="allDebtsListContent">
                                <!-- Debts will be rendered here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Edit Modal -->
            <div class="modal-overlay" id="debtModal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title" id="debtModalTitle">Ödeme Düzenle</h3>
                        <button class="modal-close" onclick="DebtsPage.closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="debtForm" onsubmit="DebtsPage.handleSubmit(event)">
                            <div class="form-group">
                                <label class="form-label">Tür *</label>
                                <select class="form-input" id="debtType" required>
                                    <option value="borrowed">Gelen Ödeme</option>
                                    <option value="lent">Yapılan Ödeme</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Kişi/Kurum *</label>
                                <input type="text" class="form-input" id="debtPerson" placeholder="Kimden / kime?" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Tutar (₺) *</label>
                                <input type="number" step="0.01" class="form-input" id="debtAmount" placeholder="0.00" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Vade Tarihi</label>
                                <input type="date" class="form-input" id="debtDueDate">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Notlar</label>
                                <textarea class="form-input" id="debtNotes" rows="3" placeholder="Ek bilgiler..."></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="DebtsPage.closeModal()">İptal</button>
                        <button class="btn btn-expense" id="debtDeleteBtn" onclick="DebtsPage.deleteDebt()">Sil</button>
                        <button class="btn btn-primary" onclick="document.getElementById('debtForm').requestSubmit()">Güncelle</button>
                    </div>
                </div>
            </div>
        `;
    },

    init() {
        this.selectType('borrowed');
        Utils.setDateInputToday('quickDebtDueDate', true);
        this.renderDebts();
    },

    refresh() {
        Utils.setDateInputToday('quickDebtDueDate', true);
        this.renderDebts();
    },

    selectType(type) {
        this.currentType = type;
        document.getElementById('quickDebtType').value = type;

        // Update button styles
        document.querySelectorAll('.debt-type-btn').forEach(btn => {
            const btnType = btn.dataset.type;
            if (btnType === type) {
                btn.classList.add('active');
                if (type === 'borrowed') {
                    btn.style.border = '2px solid var(--income-color)';
                    btn.style.background = 'var(--income-bg)';
                    btn.style.color = 'var(--income-color)';
                } else {
                    btn.style.border = '2px solid var(--expense-color)';
                    btn.style.background = 'var(--expense-bg)';
                    btn.style.color = 'var(--expense-color)';
                }
            } else {
                btn.classList.remove('active');
                btn.style.border = '2px solid var(--border-color)';
                btn.style.background = 'var(--bg-input)';
                btn.style.color = 'var(--text-secondary)';
            }
        });

        // Update submit button
        const submitBtn = document.getElementById('quickDebtSubmitBtn');
        submitBtn.className = `btn btn-${type === 'borrowed' ? 'income' : 'expense'}`;
        submitBtn.style.width = '100%';
        submitBtn.style.padding = 'var(--spacing-md)';
        submitBtn.style.fontSize = '1rem';
        submitBtn.style.display = 'flex';
        submitBtn.style.alignItems = 'center';
        submitBtn.style.justifyContent = 'center';
        submitBtn.style.gap = 'var(--spacing-sm)';
    },

    handleQuickAdd(event) {
        event.preventDefault();

        const type = document.getElementById('quickDebtType').value;
        const person = document.getElementById('quickDebtPerson').value.trim();
        const amount = document.getElementById('quickDebtAmount').value;
        const dueDate = document.getElementById('quickDebtDueDate').value || null;
        const notes = document.getElementById('quickDebtNotes').value.trim();

        if (!person || !amount) {
            Utils.showToast('Lütfen gerekli alanları doldurun', 'error');
            return;
        }

        const newDebt = {
            id: Utils.generateId(),
            type,
            person,
            amount: parseFloat(amount),
            dueDate,
            notes,
            createdAt: new Date().toISOString()
        };

        DBManager.add('debts', newDebt);
        if (!AppState.debts) AppState.debts = [];
        AppState.debts.push(newDebt);

        Utils.showToast('Ödeme eklendi', 'success');

        // Clear form
        document.getElementById('quickDebtPerson').value = '';
        document.getElementById('quickDebtAmount').value = '';
        Utils.setDateInputToday('quickDebtDueDate', true);
        document.getElementById('quickDebtNotes').value = '';

        this.renderDebts();
        DataManager.updateBadges();

        // Keep focus on person field
        setTimeout(() => {
            document.getElementById('quickDebtPerson').focus();
        }, 100);
    },

    renderDebts() {
        const container = document.getElementById('allDebtsListContent');
        if (!container) return;

        const debts = AppState.debts || [];
        const borrowed = debts.filter(d => d.type === 'borrowed');
        const lent = debts.filter(d => d.type === 'lent');

        // Calculate totals
        const totalBorrowed = borrowed.reduce((sum, d) => sum + d.amount, 0);
        const totalLent = lent.reduce((sum, d) => sum + d.amount, 0);

        // Update summary
        const borrowedEl = document.getElementById('totalBorrowed');
        const lentEl = document.getElementById('totalLent');
        if (borrowedEl) borrowedEl.textContent = Utils.formatCurrency(totalBorrowed, 'TRY');
        if (lentEl) lentEl.textContent = Utils.formatCurrency(totalLent, 'TRY');

        if (debts.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: var(--spacing-xl) var(--spacing-lg);">
                    <div class="empty-state-icon">${Utils.iconHTML('bi:cash-stack')}</div>
                    <div class="empty-state-title">Henüz ödeme yok</div>
                    <div class="empty-state-text">İlk ödemenizi ekleyerek başlayın</div>
                </div>
            `;
            return;
        }

        const currency = AppState.currentProfile?.currency || 'TRY';

        let html = '';

        // Render borrowed debts
        if (borrowed.length > 0) {
            html += `<div class="transaction-group" style="padding: 0 var(--spacing-md);">
                <div class="transaction-date" style="color: var(--income-color); font-weight: 600;">${Utils.iconHTML('bi:arrow-down-circle')} Gelen Ödemeler</div>`;
            borrowed.forEach(d => {
                html += this.renderDebtItem(d, currency);
            });
            html += '</div>';
        }

        // Render lent debts
        if (lent.length > 0) {
            html += `<div class="transaction-group" style="padding: 0 var(--spacing-md); margin-top: var(--spacing-md);">
                <div class="transaction-date" style="color: var(--expense-color); font-weight: 600;">${Utils.iconHTML('bi:arrow-up-circle')} Yapılan Ödemeler</div>`;
            lent.forEach(d => {
                html += this.renderDebtItem(d, currency);
            });
            html += '</div>';
        }

        container.innerHTML = html;
    },

    renderDebtItem(debt, currency) {
        const dueText = debt.dueDate ? `Vade: ${Utils.formatDate(debt.dueDate)}` : '';
        const noteText = debt.notes ? ` • ${debt.notes.substring(0, 30)}${debt.notes.length > 30 ? '...' : ''}` : '';

        return `
            <div class="transaction-item ${debt.type === 'borrowed' ? 'income' : 'expense'}">
                <div class="transaction-icon" onclick="DebtsPage.openEditModal('${debt.id}')" style="background: ${debt.type === 'borrowed' ? 'var(--income-color)' : 'var(--expense-color)'}15;">
                    ${Utils.iconHTML(debt.type === 'borrowed' ? 'bi:arrow-down-circle' : 'bi:arrow-up-circle')}
                </div>
                <div class="transaction-details" onclick="DebtsPage.openEditModal('${debt.id}')">
                    <div class="transaction-name">${debt.person}</div>
                    <div class="transaction-category">${dueText}${noteText}</div>
                </div>
                <div class="transaction-amount" onclick="DebtsPage.openEditModal('${debt.id}')">
                    ${Utils.formatCurrency(debt.amount, currency)}
                </div>
                <div class="transaction-actions">
                    <button class="transaction-action-btn" onclick="event.stopPropagation(); DebtsPage.openEditModal('${debt.id}')" title="Düzenle">${Utils.iconHTML('bi:pencil')}</button>
                    <button class="transaction-action-btn delete" onclick="event.stopPropagation(); DebtsPage.confirmDelete('${debt.id}')" title="Sil">${Utils.iconHTML('bi:trash3')}</button>
                </div>
            </div>
        `;
    },

    openEditModal(debtId) {
        const debt = AppState.debts.find(d => d.id === debtId);
        if (!debt) return;

        this.editingDebt = debt;
        document.getElementById('debtModalTitle').textContent = 'Ödeme Düzenle';
        document.getElementById('debtDeleteBtn').style.display = 'inline-flex';

        document.getElementById('debtType').value = debt.type;
        document.getElementById('debtPerson').value = debt.person;
        document.getElementById('debtAmount').value = debt.amount;
        Utils.setDateInputToday('debtDueDate', true);
        document.getElementById('debtNotes').value = debt.notes || '';

        document.getElementById('debtModal').classList.add('active');
    },

    closeModal() {
        document.getElementById('debtModal').classList.remove('active');
        this.editingDebt = null;
    },

    async handleSubmit(event) {
        event.preventDefault();

        const type = document.getElementById('debtType').value;
        const person = document.getElementById('debtPerson').value.trim();
        const amount = parseFloat(document.getElementById('debtAmount').value);
        const dueDate = document.getElementById('debtDueDate').value || null;
        const notes = document.getElementById('debtNotes').value.trim();

        if (!person || !amount) {
            Utils.showToast('Lütfen tüm gerekli alanları doldurun', 'error');
            return;
        }

        if (this.editingDebt) {
            const updated = {
                ...this.editingDebt,
                type,
                person,
                amount,
                dueDate,
                notes,
                updatedAt: new Date().toISOString()
            };

            await DBManager.put('debts', updated);
            const index = AppState.debts.findIndex(d => d.id === this.editingDebt.id);
            if (index !== -1) {
                AppState.debts[index] = updated;
            }

            Utils.showToast('Ödeme güncellendi', 'success');
        } else {
            const newDebt = {
                id: Utils.generateId(),
                type,
                person,
                amount,
                dueDate,
                notes,
                createdAt: new Date().toISOString()
            };

            await DBManager.add('debts', newDebt);
            if (!AppState.debts) AppState.debts = [];
            AppState.debts.push(newDebt);

            Utils.showToast('Ödeme eklendi', 'success');
        }

        this.closeModal();
        this.renderDebts();
        DataManager.updateBadges();
    },

    async confirmDelete(debtId) {
        const debt = AppState.debts.find(d => d.id === debtId);
        if (!debt) return;

        const confirmed = await Dialog.confirmDelete(debt.person, 'ödeme kaydı');
        if (confirmed) {
            this.deleteDebt(debtId);
        }
    },

    async deleteDebt(debtId = null) {
        const id = debtId || this.editingDebt?.id;
        if (!id) return;

        await DBManager.delete('debts', id);
        AppState.debts = AppState.debts.filter(d => d.id !== id);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('debts', id);
        }

        Utils.showToast('Kayıt silindi', 'success');
        this.closeModal();
        this.renderDebts();
        DataManager.updateBadges();
    }
};

const InvestmentsPage = {
    editingInvestment: null,

    render() {
        return `
            <div id="investmentsPage" class="page-content">
                <div class="two-panel-grid">
                    <!-- Left Panel - Yeni Varlık Ekle -->
                    <div class="chart-container" style="background: var(--bg-card); height: fit-content; max-height: 100%; overflow-y: auto;">
                        <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">Yeni Varlık Ekle</h3>
                        
                        <form id="quickInvestmentForm" onsubmit="InvestmentsPage.handleQuickAdd(event)">
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Varlık Türü</label>
                                <select class="form-input" id="quickInvestmentType" required>
                                    <option value="stock">Hisse Senedi</option>
                                    <option value="crypto">Kripto Para</option>
                                    <option value="forex">Döviz</option>
                                    <option value="gold">Altın</option>
                                    <option value="real-estate">Gayrimenkul</option>
                                    <option value="other">Diğer</option>
                                </select>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Varlık Adı</label>
                                <input type="text" class="form-input" id="quickInvestmentName" placeholder="Örn: BTC, USD, Gram Altın" required>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Miktar</label>
                                <input type="number" step="0.00001" class="form-input" id="quickInvestmentAmount" placeholder="0.00" required style="font-size: 1.2rem; text-align: right;">
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Alış Fiyatı (₺)</label>
                                <input type="number" step="0.01" class="form-input" id="quickInvestmentBuyPrice" placeholder="0.00" required>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Güncel Fiyat (₺) (Opsiyonel)</label>
                                <input type="number" step="0.01" class="form-input" id="quickInvestmentCurrentPrice" placeholder="0.00">
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Notlar (Opsiyonel)</label>
                                <textarea class="form-input" id="quickInvestmentNotes" rows="3" placeholder="Ek bilgiler..."></textarea>
                            </div>
                            
                            <button type="submit" class="btn btn-primary" style="width: 100%; padding: var(--spacing-md); font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: var(--spacing-sm);">
                                <span style="font-size: 1.2rem;">+</span>
                                <span>Varlık Ekle</span>
                            </button>
                        </form>
                    </div>
                    
                    <!-- Right Panel - Varlıklar Listesi -->
                    <div class="chart-container" style="background: var(--bg-card); display: flex; flex-direction: column; max-height: 100%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-shrink: 0;">
                            <h3 style="font-size: 1.1rem; font-weight: 600;">Varlıklarım</h3>
                            <div style="display: flex; gap: var(--spacing-lg);">
                                <div style="text-align: center;">
                                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Toplam Değer</div>
                                    <div style="font-weight: 600; color: var(--accent-primary);" id="totalAssets">₺0</div>
                                </div>
                                <div style="text-align: center;">
                                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Getiri</div>
                                    <div style="font-weight: 600;" id="totalReturn">+₺0</div>
                                </div>
                            </div>
                        </div>
                        
                        <div id="allInvestmentsList" class="panel-list">
                            <div id="allInvestmentsListContent">
                                <!-- Investments will be rendered here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Edit Modal -->
            <div class="modal-overlay" id="investmentModal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title" id="investmentModalTitle">Varlık Düzenle</h3>
                        <button class="modal-close" onclick="InvestmentsPage.closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="investmentForm" onsubmit="InvestmentsPage.handleSubmit(event)">
                            <div class="form-group">
                                <label class="form-label">Varlık Türü *</label>
                                <select class="form-input" id="investmentType" required>
                                    <option value="stock">Hisse Senedi</option>
                                    <option value="crypto">Kripto Para</option>
                                    <option value="forex">Döviz</option>
                                    <option value="gold">Altın</option>
                                    <option value="real-estate">Gayrimenkul</option>
                                    <option value="other">Diğer</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Varlık Adı *</label>
                                <input type="text" class="form-input" id="investmentName" placeholder="Örn: BTC, USD, Gram Altın" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Miktar *</label>
                                <input type="number" step="0.00001" class="form-input" id="investmentAmount" placeholder="0.00" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Alış Fiyatı (₺) *</label>
                                <input type="number" step="0.01" class="form-input" id="investmentBuyPrice" placeholder="0.00" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Güncel Fiyat (₺)</label>
                                <input type="number" step="0.01" class="form-input" id="investmentCurrentPrice" placeholder="0.00">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Notlar</label>
                                <textarea class="form-input" id="investmentNotes" rows="3" placeholder="Ek bilgiler..."></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="InvestmentsPage.closeModal()">İptal</button>
                        <button class="btn btn-expense" id="investmentDeleteBtn" onclick="InvestmentsPage.deleteInvestment()">Sil</button>
                        <button class="btn btn-primary" onclick="document.getElementById('investmentForm').requestSubmit()">Güncelle</button>
                    </div>
                </div>
            </div>
        `;
    },

    init() {
        this.renderInvestments();
    },

    handleQuickAdd(event) {
        event.preventDefault();

        const type = document.getElementById('quickInvestmentType').value;
        const name = document.getElementById('quickInvestmentName').value.trim();
        const amount = document.getElementById('quickInvestmentAmount').value;
        const buyPrice = document.getElementById('quickInvestmentBuyPrice').value;
        const currentPrice = document.getElementById('quickInvestmentCurrentPrice').value || buyPrice;
        const notes = document.getElementById('quickInvestmentNotes').value.trim();

        if (!name || !amount || !buyPrice) {
            Utils.showToast('Lütfen gerekli alanları doldurun', 'error');
            return;
        }

        const newInvestment = {
            id: Utils.generateId(),
            profileId: AppState.currentProfile.id,
            type,
            name,
            amount: parseFloat(amount),
            buyPrice: parseFloat(buyPrice),
            currentPrice: parseFloat(currentPrice),
            notes,
            createdAt: new Date().toISOString()
        };

        DBManager.add('investments', newInvestment);
        if (!AppState.investments) AppState.investments = [];
        AppState.investments.push(newInvestment);

        Utils.showToast('Varlık eklendi', 'success');

        // Clear form
        document.getElementById('quickInvestmentName').value = '';
        document.getElementById('quickInvestmentAmount').value = '';
        document.getElementById('quickInvestmentBuyPrice').value = '';
        document.getElementById('quickInvestmentCurrentPrice').value = '';
        document.getElementById('quickInvestmentNotes').value = '';

        this.renderInvestments();

        // Keep focus on name field
        setTimeout(() => {
            document.getElementById('quickInvestmentName').focus();
        }, 100);
    },

    renderInvestments() {
        const container = document.getElementById('allInvestmentsListContent');
        if (!container) return;

        const investments = AppState.investments || [];

        let totalValue = 0;
        let totalReturn = 0;

        investments.forEach(inv => {
            const buyPrice = inv.buyPrice || inv.purchasePrice || 0;
            const amount = inv.amount || inv.quantity || 0;
            const currentPrice = inv.currentPrice || buyPrice;
            const value = amount * currentPrice;
            const costBasis = amount * buyPrice;
            const returnValue = value - costBasis;

            totalValue += value;
            totalReturn += returnValue;
        });

        // Update summary
        const assetsEl = document.getElementById('totalAssets');
        const returnEl = document.getElementById('totalReturn');
        if (assetsEl) assetsEl.textContent = Utils.formatCurrency(totalValue, 'TRY');
        if (returnEl) {
            returnEl.textContent = (totalReturn >= 0 ? '+' : '') + Utils.formatCurrency(totalReturn, 'TRY');
            returnEl.style.color = totalReturn >= 0 ? 'var(--income-color)' : 'var(--expense-color)';
        }

        if (investments.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: var(--spacing-xl) var(--spacing-lg);">
                    <div class="empty-state-icon">${Utils.iconHTML('bi:graph-up')}</div>
                    <div class="empty-state-title">Henüz varlık yok</div>
                    <div class="empty-state-text">Döviz, hisse, kripto, altın veya gayrimenkul ekleyin</div>
                </div>
            `;
            return;
        }

        const currency = AppState.currentProfile?.currency || 'TRY';

        let html = '<div class="transaction-group" style="padding: 0 var(--spacing-md);">';

        investments.forEach(inv => {
            const buyPrice = inv.buyPrice || inv.purchasePrice || 0;
            const amount = inv.amount || inv.quantity || 0;
            const currentPrice = inv.currentPrice || buyPrice;
            const value = amount * currentPrice;
            const costBasis = amount * buyPrice;
            const returnValue = value - costBasis;
            const returnPercent = costBasis > 0 ? ((returnValue / costBasis) * 100).toFixed(2) : '0.00';

            html += `
                <div class="transaction-item ${returnValue >= 0 ? 'income' : 'expense'}">
                    <div class="transaction-icon" onclick="InvestmentsPage.openEditModal('${inv.id}')" style="background: ${returnValue >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}15;">
                        ${this.getTypeIcon(inv.type)}
                    </div>
                    <div class="transaction-details" onclick="InvestmentsPage.openEditModal('${inv.id}')">
                        <div class="transaction-name">${inv.name}</div>
                        <div class="transaction-category">${amount} ${this.getTypeUnit(inv.type)} × ${Utils.formatCurrency(currentPrice, currency)}</div>
                    </div>
                    <div style="text-align: right;" onclick="InvestmentsPage.openEditModal('${inv.id}')">
                        <div class="transaction-amount">${Utils.formatCurrency(value, currency)}</div>
                        <div style="font-size: 0.75rem; color: ${returnValue >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}; margin-top: 2px;">
                            ${returnValue >= 0 ? '+' : ''}${Utils.formatCurrency(returnValue, currency)} (${returnPercent}%)
                        </div>
                    </div>
                    <div class="transaction-actions">
                        <button class="transaction-action-btn" onclick="event.stopPropagation(); InvestmentsPage.openEditModal('${inv.id}')" title="Düzenle">${Utils.iconHTML('bi:pencil')}</button>
                        <button class="transaction-action-btn delete" onclick="event.stopPropagation(); InvestmentsPage.confirmDelete('${inv.id}')" title="Sil">${Utils.iconHTML('bi:trash3')}</button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    },

    getTypeIcon(type) {
        const icons = {
            stock: 'bi:graph-up',
            crypto: 'bi:currency-bitcoin',
            forex: 'bi:currency-exchange',
            gold: 'bi:coin',
            'real-estate': 'bi:house',
            other: 'bi:gem'
        };
        return Utils.iconHTML(icons[type] || 'bi:gem');
    },

    getTypeUnit(type) {
        const units = {
            stock: 'adet',
            crypto: '',
            forex: '',
            gold: 'gram',
            'real-estate': 'adet',
            other: 'adet'
        };
        return units[type] || '';
    },

    openEditModal(investmentId) {
        const investment = AppState.investments.find(i => i.id === investmentId);
        if (!investment) return;

        this.editingInvestment = investment;
        document.getElementById('investmentModalTitle').textContent = 'Varlık Düzenle';
        document.getElementById('investmentDeleteBtn').style.display = 'inline-flex';

        // Support both old and new formats
        const buyPrice = investment.buyPrice || investment.purchasePrice || 0;
        const amount = investment.amount || investment.quantity || 0;

        document.getElementById('investmentType').value = investment.type;
        document.getElementById('investmentName').value = investment.name;
        document.getElementById('investmentAmount').value = amount;
        document.getElementById('investmentBuyPrice').value = buyPrice;
        document.getElementById('investmentCurrentPrice').value = investment.currentPrice || '';
        document.getElementById('investmentNotes').value = investment.notes || '';

        document.getElementById('investmentModal').classList.add('active');
    },

    closeModal() {
        document.getElementById('investmentModal').classList.remove('active');
        this.editingInvestment = null;
    },

    async handleSubmit(event) {
        event.preventDefault();

        const type = document.getElementById('investmentType').value;
        const name = document.getElementById('investmentName').value.trim();
        const amount = parseFloat(document.getElementById('investmentAmount').value);
        const buyPrice = parseFloat(document.getElementById('investmentBuyPrice').value);
        const currentPrice = parseFloat(document.getElementById('investmentCurrentPrice').value) || buyPrice;
        const notes = document.getElementById('investmentNotes').value.trim();

        if (!name || !amount || !buyPrice) {
            Utils.showToast('Lütfen tüm gerekli alanları doldurun', 'error');
            return;
        }

        if (this.editingInvestment) {
            const updated = {
                ...this.editingInvestment,
                type,
                name,
                amount,
                buyPrice,
                currentPrice,
                notes,
                updatedAt: new Date().toISOString()
            };

            await DBManager.put('investments', updated);
            const index = AppState.investments.findIndex(i => i.id === this.editingInvestment.id);
            if (index !== -1) {
                AppState.investments[index] = updated;
            }

            Utils.showToast('Varlık güncellendi', 'success');
        } else {
            const newInvestment = {
                id: Utils.generateId(),
                profileId: AppState.currentProfile.id,
                type,
                name,
                amount,
                buyPrice,
                currentPrice,
                notes,
                createdAt: new Date().toISOString()
            };

            await DBManager.add('investments', newInvestment);
            if (!AppState.investments) AppState.investments = [];
            AppState.investments.push(newInvestment);

            Utils.showToast('Varlık eklendi', 'success');
        }

        this.closeModal();
        this.renderInvestments();
    },

    async confirmDelete(investmentId) {
        const investment = AppState.investments.find(i => i.id === investmentId);
        if (!investment) return;

        const confirmed = await Dialog.confirmDelete(investment.name, 'varlık');
        if (confirmed) {
            this.deleteInvestment(investmentId);
        }
    },

    async deleteInvestment(investmentId = null) {
        const id = investmentId || this.editingInvestment?.id;
        if (!id) return;

        await DBManager.delete('investments', id);
        AppState.investments = AppState.investments.filter(i => i.id !== id);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('investments', id);
        }

        Utils.showToast('Varlık silindi', 'success');
        this.closeModal();
        this.renderInvestments();
    }
};

const BillsPage = {
    editingBill: null,

    render() {
        return `
            <div id="billsPage" class="page-content">
                <div class="two-panel-grid">
                    <!-- Left Panel - Yeni Hatırlatıcı Ekle -->
                    <div class="chart-container" style="background: var(--bg-card); height: fit-content; max-height: 100%; overflow-y: auto;">
                        <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">Yeni Hatırlatıcı Ekle</h3>
                        
                        <form id="quickBillForm" onsubmit="BillsPage.handleQuickAdd(event)">
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Tür</label>
                                <select class="form-input" id="quickBillType" required>
                                    <option value="electric">Elektrik</option>
                                    <option value="water">Su</option>
                                    <option value="gas">Doğalgaz</option>
                                    <option value="internet">İnternet</option>
                                    <option value="phone">Telefon</option>
                                    <option value="rent">Kira</option>
                                    <option value="insurance">Sigorta</option>
                                    <option value="subscription">Abonelik</option>
                                    <option value="other">Diğer</option>
                                </select>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Adı</label>
                                <input type="text" class="form-input" id="quickBillName" placeholder="Örn: Ev Elektrigi, Netflix" required>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Ödeme Günü</label>
                                <select class="form-input" id="quickBillDueDay" required>
                                    ${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Tekrarlama</label>
                                <select class="form-input" id="quickBillRecurring">
                                    <option value="monthly">Her Ay</option>
                                    <option value="quarterly">3 Ayda Bir</option>
                                    <option value="yearly">Yıllık</option>
                                    <option value="once">Bir Kez</option>
                                </select>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Notlar (Opsiyonel)</label>
                                <textarea class="form-input" id="quickBillNotes" rows="3" placeholder="Ek bilgiler..."></textarea>
                            </div>
                            
                            <button type="submit" class="btn btn-primary" style="width: 100%; padding: var(--spacing-md); font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: var(--spacing-sm);">
                                <span style="font-size: 1.2rem;">+</span>
                                <span>Hatırlatıcı Ekle</span>
                            </button>
                        </form>
                    </div>
                    
                    <!-- Right Panel - Hatırlatıcılar Listesi -->
                    <div class="chart-container" style="background: var(--bg-card); display: flex; flex-direction: column; max-height: 100%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-shrink: 0;">
                            <h3 style="font-size: 1.1rem; font-weight: 600;">Hatırlatıcılarım</h3>
                            <div style="color: var(--text-secondary); font-size: 0.9rem;">
                                <span id="billCount">0 hatırlatıcı</span>
                            </div>
                        </div>
                        
                        <div id="allBillsList" class="panel-list">
                            <div id="allBillsListContent">
                                <!-- Bills will be rendered here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Edit Modal -->
            <div class="modal-overlay" id="billModal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title" id="billModalTitle">Hatırlatıcı Düzenle</h3>
                        <button class="modal-close" onclick="BillsPage.closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="billForm" onsubmit="BillsPage.handleSubmit(event)">
                            <div class="form-group">
                                <label class="form-label">Tür *</label>
                                <select class="form-input" id="billType" required>
                                    <option value="electric">Elektrik</option>
                                    <option value="water">Su</option>
                                    <option value="gas">Doğalgaz</option>
                                    <option value="internet">İnternet</option>
                                    <option value="phone">Telefon</option>
                                    <option value="rent">Kira</option>
                                    <option value="insurance">Sigorta</option>
                                    <option value="subscription">Abonelik</option>
                                    <option value="other">Diğer</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Adı *</label>
                                <input type="text" class="form-input" id="billName" placeholder="Örn: Ev Elektrigi, Netflix" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Ödeme Günü *</label>
                                <select class="form-input" id="billDueDay" required>
                                    ${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Tekrarlama</label>
                                <select class="form-input" id="billRecurring">
                                    <option value="monthly">Her Ay</option>
                                    <option value="quarterly">3 Ayda Bir</option>
                                    <option value="yearly">Yıllık</option>
                                    <option value="once">Bir Kez</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Notlar</label>
                                <textarea class="form-input" id="billNotes" rows="3" placeholder="Ek bilgiler..."></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="BillsPage.closeModal()">İptal</button>
                        <button class="btn btn-expense" id="billDeleteBtn" onclick="BillsPage.deleteBill()">Sil</button>
                        <button class="btn btn-primary" onclick="document.getElementById('billForm').requestSubmit()">Güncelle</button>
                    </div>
                </div>
            </div>
        `;
    },

    init() {
        this.renderBills();
    },

    handleQuickAdd(event) {
        event.preventDefault();

        const type = document.getElementById('quickBillType').value;
        const name = document.getElementById('quickBillName').value.trim();
        const dueDay = parseInt(document.getElementById('quickBillDueDay').value);
        const recurring = document.getElementById('quickBillRecurring').value;
        const notes = document.getElementById('quickBillNotes').value.trim();

        if (!name || !dueDay) {
            Utils.showToast('Lütfen gerekli alanları doldurun', 'error');
            return;
        }

        const newBill = {
            id: Utils.generateId(),
            // profileId kaldırıldı - tüm profiller için ortak
            type,
            name,
            dueDay,
            recurring,
            notes,
            createdAt: new Date().toISOString()
        };

        DBManager.add('bills', newBill);
        if (!AppState.bills) AppState.bills = [];
        AppState.bills.push(newBill);

        Utils.showToast('Hatırlatıcı eklendi', 'success');

        // Clear form
        document.getElementById('quickBillName').value = '';
        document.getElementById('quickBillNotes').value = '';

        this.renderBills();

        // Keep focus on name field
        setTimeout(() => {
            document.getElementById('quickBillName').focus();
        }, 100);
    },

    renderBills() {
        const container = document.getElementById('allBillsListContent');
        if (!container) return;

        const bills = AppState.bills || [];

        // Update count
        const countEl = document.getElementById('billCount');
        if (countEl) {
            countEl.textContent = `${bills.length} hatırlatıcı`;
        }

        if (bills.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: var(--spacing-xl) var(--spacing-lg);">
                    <div class="empty-state-icon">${Utils.iconHTML('bi:bell')}</div>
                    <div class="empty-state-title">Henüz hatırlatıcı yok</div>
                    <div class="empty-state-text">Elektrik, su, internet gibi tekrarlayan hatırlatıcılarınızı ekleyin</div>
                </div>
            `;
            return;
        }

        const today = new Date();
        const currentDay = today.getDate();

        let html = '<div class="transaction-group" style="padding: 0 var(--spacing-md);">';

        bills.forEach(bill => {
            const dueDay = bill.dueDay || (bill.dueDate ? new Date(bill.dueDate).getDate() : 1);
            const daysUntilDue = dueDay - currentDay;
            const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 5;
            const isOverdue = daysUntilDue < 0;
            const recurring = bill.recurring || bill.frequency || 'monthly';

            html += `
                <div class="transaction-item">
                    <div class="transaction-icon" onclick="BillsPage.openEditModal('${bill.id}')" style="background: ${this.getTypeColor(bill.type)}15; color: ${this.getTypeColor(bill.type)};">
                        ${this.getTypeIcon(bill.type)}
                    </div>
                    <div class="transaction-details" onclick="BillsPage.openEditModal('${bill.id}')">
                        <div class="transaction-name">${bill.name}</div>
                        <div class="transaction-category">
                            ${this.getRecurringText(recurring)} • Her ayın ${dueDay}. günü
                            ${isDueSoon ? `<span style="color: var(--warning-color);"> • ${daysUntilDue} gün kaldı</span>` : ''}
                            ${isOverdue ? `<span style="color: var(--expense-color);"> • Gecikmiş!</span>` : ''}
                        </div>
                    </div>
                    <div class="transaction-actions">
                        <button class="transaction-action-btn" onclick="event.stopPropagation(); BillsPage.openEditModal('${bill.id}')" title="Düzenle">${Utils.iconHTML('bi:pencil')}</button>
                        <button class="transaction-action-btn delete" onclick="event.stopPropagation(); BillsPage.confirmDelete('${bill.id}')" title="Sil">${Utils.iconHTML('bi:trash3')}</button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    },

    getTypeIcon(type) {
        const icons = {
            electric: 'bi:lightbulb',
            water: 'bi:droplet',
            gas: 'bi:fire',
            internet: 'bi:wifi',
            phone: 'bi:phone',
            rent: 'bi:house',
            insurance: 'bi:shield-check',
            subscription: 'bi:tv',
            other: 'bi:file-earmark-text'
        };
        return Utils.iconHTML(icons[type] || 'bi:file-earmark-text');
    },

    getTypeColor(type) {
        const colors = {
            electric: '#ffc107',
            water: '#03a9f4',
            gas: '#ff5722',
            internet: '#9c27b0',
            phone: '#4caf50',
            rent: '#ff9800',
            insurance: '#2196f3',
            subscription: '#e91e63',
            other: '#607d8b'
        };
        return colors[type] || '#607d8b';
    },

    getRecurringText(recurring) {
        const texts = {
            monthly: 'Aylık',
            quarterly: '3 Aylık',
            yearly: 'Yıllık',
            once: 'Bir Kez'
        };
        return texts[recurring] || 'Aylık';
    },

    openEditModal(billId) {
        const bill = AppState.bills.find(b => b.id === billId);
        if (!bill) return;

        this.editingBill = bill;
        document.getElementById('billModalTitle').textContent = 'Hatırlatıcı Düzenle';
        document.getElementById('billDeleteBtn').style.display = 'inline-flex';

        // Support both old and new formats
        const dueDay = bill.dueDay || (bill.dueDate ? new Date(bill.dueDate).getDate() : 1);
        const recurring = bill.recurring || bill.frequency || 'monthly';

        document.getElementById('billType').value = bill.type || 'other';
        document.getElementById('billName').value = bill.name;
        document.getElementById('billDueDay').value = dueDay;
        document.getElementById('billRecurring').value = recurring;
        document.getElementById('billNotes').value = bill.notes || '';

        document.getElementById('billModal').classList.add('active');
    },

    closeModal() {
        document.getElementById('billModal').classList.remove('active');
        this.editingBill = null;
    },

    async handleSubmit(event) {
        event.preventDefault();

        const type = document.getElementById('billType').value;
        const name = document.getElementById('billName').value.trim();
        const dueDay = parseInt(document.getElementById('billDueDay').value);
        const recurring = document.getElementById('billRecurring').value;
        const notes = document.getElementById('billNotes').value.trim();

        if (!name || !dueDay) {
            Utils.showToast('Lütfen tüm gerekli alanları doldurun', 'error');
            return;
        }

        if (this.editingBill) {
            const updated = {
                ...this.editingBill,
                type,
                name,
                dueDay,
                recurring,
                notes,
                updatedAt: new Date().toISOString()
            };

            await DBManager.put('bills', updated);
            const index = AppState.bills.findIndex(b => b.id === this.editingBill.id);
            if (index !== -1) {
                AppState.bills[index] = updated;
            }

            Utils.showToast('Hatırlatıcı güncellendi', 'success');
        } else {
            const newBill = {
                id: Utils.generateId(),
                // profileId kaldırıldı - tüm profiller için ortak
                type,
                name,
                dueDay,
                recurring,
                notes,
                createdAt: new Date().toISOString()
            };

            await DBManager.add('bills', newBill);
            if (!AppState.bills) AppState.bills = [];
            AppState.bills.push(newBill);

            Utils.showToast('Hatırlatıcı eklendi', 'success');
        }

        this.closeModal();
        this.renderBills();
    },

    async confirmDelete(billId) {
        const bill = AppState.bills.find(b => b.id === billId);
        if (!bill) return;

        const confirmed = await Dialog.confirmDelete(bill.name, 'hatırlatıcı');
        if (confirmed) {
            this.deleteBill(billId);
        }
    },

    async deleteBill(billId = null) {
        const id = billId || this.editingBill?.id;
        if (!id) return;

        await DBManager.delete('bills', id);
        AppState.bills = AppState.bills.filter(b => b.id !== id);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('bills', id);
        }

        Utils.showToast('Hatırlatıcı silindi', 'success');
        this.closeModal();
        this.renderBills();
    }
};

const NotesPage = {
    editingNote: null,

    render() {
        return `
            <div id="notesPage" class="page-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg);">
                    <h2 style="font-size: 1.25rem; font-weight: 600;">Notlar</h2>
                    <button class="btn btn-primary" onclick="NotesPage.openAddModal()">${Utils.iconHTML('bi:plus-lg')} Not Ekle</button>
                </div>
                <div id="notesList" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--spacing-md);">
                    <div class="empty-state" style="grid-column: 1 / -1;">
                        <div class="empty-state-icon">${Utils.iconHTML('bi:journal-text')}</div>
                        <div class="empty-state-title">Henüz not yok</div>
                        <div class="empty-state-text">Finansal notlarınızı ve hatırlatıcılarınızı ekleyin</div>
                    </div>
                </div>
            </div>
            
            <!-- Note Modal -->
            <div class="modal-overlay" id="noteModal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title" id="noteModalTitle">Yeni Not</h3>
                        <button class="modal-close" onclick="NotesPage.closeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="noteForm" onsubmit="NotesPage.handleSubmit(event)">
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Başlık *</label>
                                <input type="text" class="form-input" id="noteTitle" placeholder="Not başlığı" required>
                            </div>
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">İçerik</label>
                                <textarea class="form-input" id="noteContent" rows="6" placeholder="Not içeriği..."></textarea>
                            </div>
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Etiketler</label>
                                <input type="text" class="form-input" id="noteTags" placeholder="Virgülle ayırarak yazın (örn: önemli, fatura, hatırlatma)">
                            </div>
                            <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                                <label class="form-label">Renk</label>
                                <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                                    <button type="button" class="color-picker-btn" onclick="NotesPage.selectColor('#6366f1')" style="width: 32px; height: 32px; background: #6366f1; border: 2px solid transparent; border-radius: var(--radius-sm); cursor: pointer;" data-color="#6366f1"></button>
                                    <button type="button" class="color-picker-btn" onclick="NotesPage.selectColor('#f59e0b')" style="width: 32px; height: 32px; background: #f59e0b; border: 2px solid transparent; border-radius: var(--radius-sm); cursor: pointer;" data-color="#f59e0b"></button>
                                    <button type="button" class="color-picker-btn" onclick="NotesPage.selectColor('#10b981')" style="width: 32px; height: 32px; background: #10b981; border: 2px solid transparent; border-radius: var(--radius-sm); cursor: pointer;" data-color="#10b981"></button>
                                    <button type="button" class="color-picker-btn" onclick="NotesPage.selectColor('#ef4444')" style="width: 32px; height: 32px; background: #ef4444; border: 2px solid transparent; border-radius: var(--radius-sm); cursor: pointer;" data-color="#ef4444"></button>
                                    <button type="button" class="color-picker-btn" onclick="NotesPage.selectColor('#8b5cf6')" style="width: 32px; height: 32px; background: #8b5cf6; border: 2px solid transparent; border-radius: var(--radius-sm); cursor: pointer;" data-color="#8b5cf6"></button>
                                    <button type="button" class="color-picker-btn" onclick="NotesPage.selectColor('#06b6d4')" style="width: 32px; height: 32px; background: #06b6d4; border: 2px solid transparent; border-radius: var(--radius-sm); cursor: pointer;" data-color="#06b6d4"></button>
                                </div>
                                <input type="hidden" id="noteColor" value="#6366f1">
                            </div>
                            <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                                <input type="checkbox" id="notePinned">
                                <label for="notePinned" style="font-size: 0.9rem;">${Utils.iconHTML('bi:pin-angle')} Sabitle</label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="NotesPage.closeModal()">İptal</button>
                        <button class="btn btn-expense" id="noteDeleteBtn" onclick="NotesPage.deleteNote()" style="display: none;">Sil</button>
                        <button class="btn btn-primary" onclick="document.getElementById('noteForm').requestSubmit()">Kaydet</button>
                    </div>
                </div>
            </div>
        `;
    },

    init() {
        this.renderNotes();
        this.initColorPicker();
    },

    initColorPicker() {
        // Varsayılan rengi seç
        this.selectColor('#6366f1');
    },

    selectColor(color) {
        document.getElementById('noteColor').value = color;
        document.querySelectorAll('.color-picker-btn').forEach(btn => {
            btn.style.borderColor = btn.dataset.color === color ? 'var(--text-primary)' : 'transparent';
            btn.style.transform = btn.dataset.color === color ? 'scale(1.15)' : 'scale(1)';
        });
    },

    renderNotes() {
        const container = document.getElementById('notesList');
        if (!container) return;

        const notes = AppState.notes || [];

        // Sabitlenmiş notları öne getir
        const sortedNotes = notes.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        if (sortedNotes.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">${Utils.iconHTML('bi:journal-text')}</div>
                    <div class="empty-state-title">Henüz not yok</div>
                    <div class="empty-state-text">Finansal notlarınızı ve hatırlatıcılarınızı ekleyin</div>
                </div>
            `;
            return;
        }

        container.innerHTML = sortedNotes.map(note => this.renderNoteItem(note)).join('');
    },

    renderNoteItem(note) {
        const createdDate = new Date(note.createdAt).toLocaleDateString('tr-TR');
        const tags = note.tags || [];
        const pinnedIcon = note.isPinned ? `${Utils.iconHTML('bi:pin-angle-fill')} ` : '';

        return `
            <div class="transaction-item" style="background: var(--bg-input); cursor: pointer; position: relative;" onclick="NotesPage.openEditModal('${note.id}')">
                <div style="position: absolute; top: var(--spacing-sm); right: var(--spacing-sm); width: 12px; height: 12px; background: ${note.color}; border-radius: 50%;"></div>
                ${note.isPinned ? `<div style="position: absolute; top: var(--spacing-sm); left: var(--spacing-sm); font-size: 0.8rem;">${Utils.iconHTML('bi:pin-angle-fill')}</div>` : ''}
                <div style="padding-right: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--spacing-xs);">
                        <h4 style="font-weight: 600; font-size: 0.95rem; margin: 0;">${pinnedIcon}${note.title}</h4>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${createdDate}</span>
                    </div>
                    ${note.content ? `<p style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.4; margin-bottom: var(--spacing-sm);">${note.content.substring(0, 100)}${note.content.length > 100 ? '...' : ''}</p>` : ''}
                    ${tags.length > 0 ? `
                        <div style="display: flex; gap: var(--spacing-xs); flex-wrap: wrap;">
                            ${tags.map(tag => `<span style="background: ${note.color}20; color: ${note.color}; font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm);">${tag}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    openAddModal() {
        this.editingNote = null;
        document.getElementById('noteModalTitle').textContent = 'Yeni Not';
        document.getElementById('noteDeleteBtn').style.display = 'none';
        document.getElementById('noteForm').reset();
        document.getElementById('notePinned').checked = false;
        this.selectColor('#6366f1');
        document.getElementById('noteModal').classList.add('active');
    },

    openEditModal(noteId) {
        const note = AppState.notes.find(n => n.id === noteId);
        if (!note) return;

        this.editingNote = note;
        document.getElementById('noteModalTitle').textContent = 'Not Düzenle';
        document.getElementById('noteDeleteBtn').style.display = 'inline-flex';

        document.getElementById('noteTitle').value = note.title;
        document.getElementById('noteContent').value = note.content || '';
        document.getElementById('noteTags').value = (note.tags || []).join(', ');
        document.getElementById('notePinned').checked = note.isPinned || false;
        this.selectColor(note.color || '#6366f1');

        document.getElementById('noteModal').classList.add('active');
    },

    closeModal() {
        document.getElementById('noteModal').classList.remove('active');
        this.editingNote = null;
    },

    async handleSubmit(event) {
        event.preventDefault();

        const title = document.getElementById('noteTitle').value.trim();
        const content = document.getElementById('noteContent').value.trim();
        const tags = document.getElementById('noteTags').value.split(',').map(t => t.trim()).filter(t => t);
        const color = document.getElementById('noteColor').value;
        const isPinned = document.getElementById('notePinned').checked;

        if (!title) {
            Utils.showToast('Not başlığı gerekli', 'error');
            return;
        }

        if (this.editingNote) {
            // Mevcut notu güncelle
            const updated = {
                ...this.editingNote,
                title,
                content,
                tags,
                color,
                isPinned,
                updatedAt: new Date().toISOString()
            };

            await DBManager.put('notes', updated);
            const index = AppState.notes.findIndex(n => n.id === this.editingNote.id);
            if (index !== -1) {
                AppState.notes[index] = updated;
            }

            Utils.showToast('Not güncellendi', 'success');
        } else {
            // Yeni not oluştur
            const newNote = {
                id: Utils.generateId(),
                profileId: AppState.currentProfile.id,
                title,
                content,
                tags,
                color,
                isPinned,
                linkedTransactions: [],
                attachments: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await DBManager.add('notes', newNote);
            if (!AppState.notes) AppState.notes = [];
            AppState.notes.push(newNote);

            Utils.showToast('Not eklendi', 'success');
        }

        this.closeModal();
        this.renderNotes();
    },

    async confirmDelete(noteId) {
        const note = AppState.notes.find(n => n.id === noteId);
        if (!note) return;

        const confirmed = await Dialog.confirmDelete(note.title, 'not');
        if (confirmed) {
            this.deleteNote(noteId);
        }
    },

    async deleteNote(noteId = null) {
        const id = noteId || this.editingNote?.id;
        if (!id) return;

        await DBManager.delete('notes', id);
        AppState.notes = AppState.notes.filter(n => n.id !== id);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('notes', id);
        }

        Utils.showToast('Not silindi', 'success');
        this.closeModal();
        this.renderNotes();
    }
};

const ReportsPage = {
    netWorthChart: null,
    budgetChart: null,
    render() {
        return `
            <div id="reportsPage" class="page-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg);">
                    <h2 style="font-size: 1.25rem; font-weight: 600;">Analiz & Rapor</h2>
                    <button class="btn btn-secondary" onclick="ReportsPage.exportPDF()">${Utils.iconHTML('bi:file-earmark-pdf')} PDF İndir</button>
                </div>
                <div class="dashboard-grid">
                    <div class="chart-container">
                        <div class="chart-header">
                            <h3 class="chart-title">Net Varlık Trendi</h3>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="netWorthChart"></canvas>
                        </div>
                    </div>
                    <div class="chart-container">
                        <div class="chart-header">
                            <h3 class="chart-title">Bütçe vs Gerçekleşme</h3>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="budgetVsActualChart"></canvas>
                        </div>
                    </div>
                </div>
                <div class="chart-container" style="margin-top: var(--spacing-lg);">
                    <div class="chart-header">
                        <h3 class="chart-title">What-If Analizi</h3>
                    </div>
                    <div style="padding: var(--spacing-lg);">
                        <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
                            "Kira %20 artarsa ne olur?" gibi senaryoları simüle edin
                        </p>
                        <button class="btn btn-primary">${Utils.iconHTML('bi:magic')} Senaryo Oluştur</button>
                    </div>
                </div>
            </div>
        `;
    },
    init() {
        this.initCharts();
    },
    refresh() {
        this.initCharts();
    },
    initCharts() {
        this.renderNetWorthChart();
        this.renderBudgetChart();
    },
    renderNetWorthChart() {
        const ctx = document.getElementById('netWorthChart');
        if (!ctx || typeof Chart === 'undefined') return;

        if (this.netWorthChart) {
            this.netWorthChart.destroy();
        }

        const months = this.getMonthSeries(6);
        const labels = months.map(item => item.label);
        const values = months.map(item => item.netWorth);
        const currency = AppState.currentProfile?.currency || 'TRY';

        this.netWorthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Net Varlık',
                        data: values,
                        borderColor: '#4caf50',
                        backgroundColor: 'rgba(76, 175, 80, 0.12)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-secondary'),
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.y || 0;
                                return `${context.dataset.label}: ${Utils.formatCurrency(value, currency)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-muted')
                        },
                        grid: {
                            color: getComputedStyle(document.body).getPropertyValue('--border-light')
                        }
                    },
                    y: {
                        ticks: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-muted'),
                            callback: (value) => Utils.formatCurrency(value, currency)
                        },
                        grid: {
                            color: getComputedStyle(document.body).getPropertyValue('--border-light')
                        }
                    }
                }
            }
        });
    },
    renderBudgetChart() {
        const ctx = document.getElementById('budgetVsActualChart');
        if (!ctx || typeof Chart === 'undefined') return;

        if (this.budgetChart) {
            this.budgetChart.destroy();
        }

        const months = this.getMonthSeries(6);
        const labels = months.map(item => item.label);
        const actuals = months.map(item => item.expense);
        const budget = AppState.currentProfile?.monthlyBudget || 10000;
        const budgets = months.map(() => budget);
        const currency = AppState.currentProfile?.currency || 'TRY';

        this.budgetChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Gerçekleşen',
                        data: actuals,
                        backgroundColor: 'rgba(244, 67, 54, 0.6)',
                        borderRadius: 8
                    },
                    {
                        label: 'Bütçe',
                        data: budgets,
                        backgroundColor: 'rgba(30, 136, 229, 0.4)',
                        borderRadius: 8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-secondary'),
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.y || 0;
                                return `${context.dataset.label}: ${Utils.formatCurrency(value, currency)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-muted')
                        },
                        grid: {
                            color: getComputedStyle(document.body).getPropertyValue('--border-light')
                        }
                    },
                    y: {
                        ticks: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-muted'),
                            callback: (value) => Utils.formatCurrency(value, currency)
                        },
                        grid: {
                            color: getComputedStyle(document.body).getPropertyValue('--border-light')
                        }
                    }
                }
            }
        });
    },
    getMonthSeries(count) {
        const results = [];
        const today = new Date();
        const openingBalance = AppState.currentProfile?.openingBalance || 0;

        for (let i = count - 1; i >= 0; i--) {
            let month = today.getMonth() - i;
            let year = today.getFullYear();
            if (month < 0) {
                month += 12;
                year -= 1;
            }

            const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
            const monthData = DataManager.getMonthlyData(month, year);
            const netChange = AppState.transactions.reduce((sum, tx) => {
                const txDate = new Date(tx.date);
                if (txDate <= endDate) {
                    return sum + (tx.type === 'income' ? tx.amount : -tx.amount);
                }
                return sum;
            }, 0);

            results.push({
                year,
                month,
                label: Utils.getMonthName(month).substring(0, 3),
                expense: monthData.expense,
                income: monthData.income,
                netWorth: openingBalance + netChange
            });
        }

        return results;
    },
    exportPDF() {
        Utils.showToast('PDF export yakında...', 'info');
    }
};

const SyncPage = {
    render() {
        return `
            <div id="syncPage" class="page-content">
                <div class="chart-container" style="max-width: 600px; margin: 0 auto;">
                    <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: var(--spacing-lg); text-align: center;">
                        ${Utils.iconHTML('bi:cloud-arrow-up')} Bulut Senkronizasyonu
                    </h3>
                    
                    <div id="syncStatus" style="text-align: center; margin-bottom: var(--spacing-xl);">
                        <div style="font-size: 3rem; margin-bottom: var(--spacing-md);">${Utils.iconHTML('bi:cloud-slash')}</div>
                        <p style="color: var(--text-secondary);">Giriş yaparak verilerinizi bulutta saklayın</p>
                    </div>
                    
                    <div id="syncLoginForm">
                        <div class="form-group" style="margin-bottom: var(--spacing-md);">
                            <label class="form-label">E-posta</label>
                            <input type="email" class="form-input" id="syncEmail" placeholder="ornek@email.com">
                        </div>
                        <div class="form-group" style="margin-bottom: var(--spacing-lg);">
                            <label class="form-label">Şifre</label>
                            <input type="password" class="form-input" id="syncPassword" placeholder="••••••••">
                        </div>
                        <div style="display: flex; gap: var(--spacing-md);">
                            <button class="btn btn-primary" onclick="SyncPage.signIn()" style="flex: 1;">
                                ${Utils.iconHTML('bi:box-arrow-in-right')} Giriş Yap
                            </button>
                            <button class="btn btn-secondary" onclick="SyncPage.signUp()" style="flex: 1;">
                                ${Utils.iconHTML('bi:person-plus')} Kayıt Ol
                            </button>
                        </div>
                    </div>
                    
                    <div id="syncLoggedIn" class="hidden">
                        <div style="background: var(--income-bg); padding: var(--spacing-lg); border-radius: var(--radius-md); margin-bottom: var(--spacing-lg);">
                            <div style="display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-sm);">
                                <span style="font-size: 2rem;">${Utils.iconHTML('bi:cloud-check')}</span>
                                <div>
                                    <div style="font-weight: 600; color: var(--income-color);">Bağlı</div>
                                    <div style="font-size: 0.85rem; color: var(--text-secondary);" id="syncUserEmail"></div>
                                </div>
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);" id="syncLastTime">Son senkronizasyon: -</div>
                        </div>
                        
                        <div style="display: flex; gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
                            <button class="btn btn-primary" onclick="SyncPage.syncNow()" style="flex: 1;">
                                ${Utils.iconHTML('bi:arrow-repeat')} Şimdi Senkronize Et
                            </button>
                            <button class="btn btn-secondary" onclick="SyncPage.signOut()">
                                ${Utils.iconHTML('bi:box-arrow-right')} Çıkış
                            </button>
                        </div>
                        
                        <div style="display: flex; gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
                            <button class="btn btn-income" onclick="SyncPage.forceFromCloud()" style="flex: 1;">
                                ${Utils.iconHTML('bi:cloud-download')} Buluttan Tüm Veriyi İndir
                            </button>
                        </div>
                        
                        <div style="display: flex; gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
                            <button class="btn btn-expense" onclick="SyncPage.forceToCloud()" style="flex: 1;">
                                ${Utils.iconHTML('bi:cloud-upload')} Local Veriyi Buluta Yükle
                            </button>
                        </div>
                        
                        <div style="background: var(--bg-input); padding: var(--spacing-md); border-radius: var(--radius-md); font-size: 0.85rem; color: var(--text-secondary);">
                            ${Utils.iconHTML('bi:info-circle')} Verileriniz otomatik olarak 5 dakikada bir senkronize edilir.<br><br>
                            • <strong>Buluttan Tüm Veriyi İndir:</strong> Lokal verileri siler ve buluttaki verileri yükler.<br>
                            • <strong>Local Veriyi Buluta Yükle:</strong> Buluttaki verileri siler ve lokal verileri yükler.
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    init() {
        this.updateUI();
    },

    updateUI() {
        const loginForm = document.getElementById('syncLoginForm');
        const loggedIn = document.getElementById('syncLoggedIn');
        const status = document.getElementById('syncStatus');

        if (FirebaseSync.currentUser) {
            loginForm?.classList.add('hidden');
            loggedIn?.classList.remove('hidden');
            if (status) {
                status.innerHTML = `
                    <div style="font-size: 3rem; margin-bottom: var(--spacing-md); color: var(--income-color);">${Utils.iconHTML('bi:cloud-check')}</div>
                    <p style="color: var(--text-secondary);">Verileriniz bulutta güvende</p>
                `;
            }
            const emailEl = document.getElementById('syncUserEmail');
            if (emailEl) emailEl.textContent = FirebaseSync.currentUser.email;

            const lastTime = localStorage.getItem('lastSyncTime');
            const lastTimeEl = document.getElementById('syncLastTime');
            if (lastTimeEl && lastTime) {
                const date = new Date(lastTime);
                lastTimeEl.textContent = `Son senkronizasyon: ${date.toLocaleString('tr-TR')}`;
            }
        } else {
            loginForm?.classList.remove('hidden');
            loggedIn?.classList.add('hidden');
        }
    },

    async signIn() {
        const email = document.getElementById('syncEmail')?.value;
        const password = document.getElementById('syncPassword')?.value;

        if (!email || !password) {
            Utils.showToast('E-posta ve şifre gerekli', 'error');
            return;
        }

        await FirebaseSync.signIn(email, password);
        this.updateUI();
    },

    async signUp() {
        const email = document.getElementById('syncEmail')?.value;
        const password = document.getElementById('syncPassword')?.value;

        if (!email || !password) {
            Utils.showToast('E-posta ve şifre gerekli', 'error');
            return;
        }

        if (password.length < 6) {
            Utils.showToast('Şifre en az 6 karakter olmalı', 'error');
            return;
        }

        await FirebaseSync.signUp(email, password);
        this.updateUI();
    },

    async signOut() {
        await FirebaseSync.signOut();
        this.updateUI();
    },

    async syncNow() {
        await FirebaseSync.syncNow();
        this.updateUI();
    },

    async forceFromCloud() {
        const confirmed = await Dialog.confirmAction(
            'Bu işlem lokal verilerinizi silecek ve buluttaki verilerle değiştirecektir. Devam etmek istiyor musunuz?',
            { title: 'Buluttan Veri İndir', icon: 'bi:cloud-download', danger: true, confirmText: 'İndir' }
        );
        if (confirmed) {
            await FirebaseSync.forceReplaceFromCloud();
            this.updateUI();
        }
    },

    async forceToCloud() {
        const confirmed = await Dialog.confirmAction(
            'Bu işlem buluttaki tüm verilerinizi silecek ve lokal verilerinizle değiştirecektir. Devam etmek istiyor musunuz?',
            { title: 'Local Veriyi Buluta Yükle', icon: 'bi:cloud-upload', danger: true, confirmText: 'Yükle' }
        );
        if (confirmed) {
            await FirebaseSync.forceUploadToCloud();
            this.updateUI();
        }
    }
};

const SettingsPage = {
    render() {
        return `
            <div id="settingsPage" class="page-content">
                <div class="chart-container" style="margin-bottom: var(--spacing-lg);">
                    <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">${Utils.iconHTML('bi:palette')} Görünüm</h3>
                    <div class="form-group" style="margin-bottom: var(--spacing-md);">
                        <label class="form-label">Tema</label>
                        <select class="form-input" onchange="SettingsPage.setTheme(this.value)">
                            <option value="dark">Koyu</option>
                            <option value="light">Açık</option>
                            <option value="auto">Otomatik</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Dil</label>
                        <select class="form-input">
                            <option value="tr">Türkçe</option>
                            <option value="en">English</option>
                        </select>
                    </div>
                </div>
                
                <div class="chart-container" style="margin-bottom: var(--spacing-lg);">
                    <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">${Utils.iconHTML('bi:cloud-arrow-up')} Yedekleme</h3>
                    <div style="display: flex; gap: var(--spacing-md); flex-wrap: wrap;">
                        <button class="btn btn-secondary">${Utils.iconHTML('bi:cloud-arrow-up')} Veriyi Dışa Aktar</button>
                        <button class="btn btn-secondary">${Utils.iconHTML('bi:cloud-arrow-down')} Veriyi İçe Aktar</button>
                    </div>
                </div>
                
                <div class="chart-container">
                    <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">${Utils.iconHTML('bi:info-circle')} Hakkında</h3>
                    <p style="color: var(--text-secondary);">Hızlı Bütçe v1.0.0</p>
                    <p style="color: var(--text-muted); font-size: 0.85rem;">Gelir Gider Takip Uygulaması</p>
                </div>
            </div>
        `;
    },
    init() {
        // Initialize settings
    },
    setTheme(theme) {
        if (theme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            theme = prefersDark ? 'dark' : 'light';
        }
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        const themeIcon = document.getElementById('themeIcon');
        themeIcon.className = `bi ${theme === 'light' ? 'bi-sun-fill' : 'bi-moon-stars-fill'}`;
    }
};

// ============================================
// INITIALIZATION
// ============================================
async function initApp() {
    try {
        // Initialize database
        await DBManager.init();

        // Initialize Firebase
        await FirebaseSync.init();

        // Load profiles
        await ProfileManager.loadProfiles();

        // Mevcut profile eksik kategorileri ekle
        if (AppState.currentProfile) {
            await ProfileManager.checkAndAddMissingCategories(AppState.currentProfile.id);
        }

        // Load profile data
        await DataManager.loadProfileData();

        // Check bill reminders on startup
        if (window.NotificationManager && NotificationManager.checkBillReminders) {
            NotificationManager.checkBillReminders();
        }

        // Initialize theme (default to light - Fast Budget style)
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        const themeIcon = document.getElementById('themeIcon');
        themeIcon.className = `bi ${savedTheme === 'light' ? 'bi-sun-fill' : 'bi-moon-stars-fill'}`;

        // Refresh dashboard
        Dashboard.refresh();

        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered:', reg.scope))
                .catch(err => console.warn('Service Worker registration failed:', err));
        }

        console.log('Hızlı Bütçe initialized successfully');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        Utils.showToast('Uygulama başlatılamadı', 'error');
    }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

// Keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        TransactionManager.undo();
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        TransactionManager.redo();
    }
});


// ============================================
// DATA IMPORT/EXPORT FUNCTIONS
// ============================================
async function exportData() {
    try {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            profiles: AppState.profiles,
            transactions: AppState.transactions,
            categories: AppState.categories,
            debts: AppState.debts,
            investments: AppState.investments,
            bills: AppState.bills,
            notes: AppState.notes
        };

        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `hizli-butce-yedek-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Utils.showToast('Veriler başarıyla dışa aktarıldı', 'success');
    } catch (error) {
        console.error('Export error:', error);
        Utils.showToast('Dışa aktarma sırasında hata oluştu', 'error');
    }
}

async function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        try {
            const file = e.target.files[0];
            if (!file) return;

            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.version || !data.profiles) {
                Utils.showToast('Geçersiz yedek dosyası', 'error');
                return;
            }

            const confirmed = await Dialog.confirmAction(
                'Mevcut veriler silinecek ve yedek dosyası yüklenecek. Devam etmek istiyor musunuz?',
                { title: 'Veri İçe Aktarma', icon: 'bi:exclamation-triangle', danger: true, confirmText: 'İçe Aktar' }
            );

            if (!confirmed) return;

            // Clear existing data
            await DBManager.clear('profiles');
            await DBManager.clear('transactions');
            await DBManager.clear('categories');
            await DBManager.clear('debts');
            await DBManager.clear('investments');
            await DBManager.clear('bills');
            await DBManager.clear('notes');

            // Import new data
            for (const profile of data.profiles || []) {
                await DBManager.add('profiles', profile);
            }
            for (const tx of data.transactions || []) {
                await DBManager.add('transactions', tx);
            }
            for (const cat of data.categories || []) {
                await DBManager.add('categories', cat);
            }
            for (const debt of data.debts || []) {
                await DBManager.add('debts', debt);
            }
            for (const inv of data.investments || []) {
                await DBManager.add('investments', inv);
            }
            for (const bill of data.bills || []) {
                await DBManager.add('bills', bill);
            }
            for (const note of data.notes || []) {
                await DBManager.add('notes', note);
            }

            Utils.showToast('Veriler başarıyla içe aktarıldı. Sayfa yenileniyor...', 'success');

            setTimeout(() => {
                window.location.reload();
            }, 1500);

        } catch (error) {
            console.error('Import error:', error);
            Utils.showToast('İçe aktarma sırasında hata oluştu', 'error');
        }
    };

    input.click();
}

async function clearAllData() {
    const confirmed = await Dialog.confirmAction(
        '<strong>TÜM VERİLER SİLİNECEK!</strong><br><br>Bu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?',
        { title: 'Tüm Verileri Sil', icon: 'bi:exclamation-triangle', danger: true, confirmText: 'Evet, Sil' }
    );

    if (!confirmed) return;

    const pinConfirm = await Dialog.prompt(
        'Onaylamak için "SİL" yazın:',
        { title: 'Son Onay', icon: 'bi:shield-exclamation', placeholder: 'SİL' }
    );

    if (pinConfirm !== 'SİL') {
        Utils.showToast('İşlem iptal edildi', 'info');
        return;
    }

    try {
        if (typeof FirebaseSync !== 'undefined' && FirebaseSync.syncEnabled) {
            FirebaseSync.stopAutoSync();
            FirebaseSync.stopRealtimeSync();
            await FirebaseSync.clearCloudData({ silent: true });
        }

        await DBManager.clear('profiles');
        await DBManager.clear('transactions');
        await DBManager.clear('categories');
        await DBManager.clear('debts');
        await DBManager.clear('investments');
        await DBManager.clear('bills');
        await DBManager.clear('notes');
        await DBManager.clear('settings');

        localStorage.clear();

        Utils.showToast('Tüm veriler silindi. Sayfa yenileniyor...', 'success');

        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error('Clear data error:', error);
        Utils.showToast('Veri silme sırasında hata oluştu', 'error');
    }
}


// ============================================
// SETTINGS PAGE - Update render method
// ============================================
if (typeof SettingsPage !== 'undefined') {
    SettingsPage.render = function () {
        return `
            <div id="settingsPage" class="page-content">
                <div class="chart-container" style="margin-bottom: var(--spacing-lg);">
                    <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">${Utils.iconHTML('bi:palette')} Görünüm</h3>
                    <div class="form-group" style="margin-bottom: var(--spacing-md);">
                        <label class="form-label">Tema</label>
                        <select class="form-input" id="themeSelect" onchange="SettingsPage.setTheme(this.value)">
                            <option value="light">Açık</option>
                            <option value="dark">Koyu</option>
                        </select>
                    </div>
                </div>
                
                <div class="chart-container" style="margin-bottom: var(--spacing-lg);">
                    <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">${Utils.iconHTML('bi:database')} Veri Yönetimi</h3>
                    <div style="display: flex; flex-direction: column; gap: var(--spacing-md);">
                        <button class="btn btn-primary" onclick="exportData()" style="width: 100%; justify-content: center;">
                            ${Utils.iconHTML('bi:download')} Verileri Dışa Aktar (JSON)
                        </button>
                        <button class="btn btn-secondary" onclick="importData()" style="width: 100%; justify-content: center;">
                            ${Utils.iconHTML('bi:upload')} Verileri İçe Aktar
                        </button>
                        <button class="btn btn-expense" onclick="clearAllData()" style="width: 100%; justify-content: center;">
                            ${Utils.iconHTML('bi:trash3')} Tüm Verileri Sil
                        </button>
                    </div>
                    <div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--info-bg); border-radius: var(--radius-md); font-size: 0.85rem; color: var(--text-secondary);">
                        ${Utils.iconHTML('bi:info-circle')} Verilerinizi düzenli olarak yedekleyin. İçe aktarma işlemi mevcut verilerin üzerine yazacaktır.
                    </div>
                </div>
                
                <div class="chart-container">
                    <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--spacing-lg);">${Utils.iconHTML('bi:info-circle')} Hakkında</h3>
                    <div style="text-align: center; padding: var(--spacing-lg);">
                        <div style="font-size: 3rem; margin-bottom: var(--spacing-md);">${Utils.iconHTML('bi:wallet2')}</div>
                        <h4 style="font-size: 1.25rem; font-weight: 600; margin-bottom: var(--spacing-sm);">Hızlı Bütçe</h4>
                        <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">Versiyon 1.0.0</p>
                        <p style="color: var(--text-secondary); font-size: 0.9rem;">Kişisel finans yönetim uygulaması</p>
                    </div>
                </div>
            </div>
        `;
    };

    SettingsPage.init = function () {
        const theme = localStorage.getItem('theme') || 'light';
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            themeSelect.value = theme;
        }
    };

    SettingsPage.setTheme = function (theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            themeIcon.className = `bi ${theme === 'light' ? 'bi-sun-fill' : 'bi-moon-stars-fill'}`;
        }

        // Update charts
        if (typeof Dashboard !== 'undefined' && Dashboard.updateCharts) {
            Dashboard.updateCharts();
        }

        Utils.showToast('Tema değiştirildi', 'success');
    };
}

// ============================================
// FIX: Close Sidebar on Outside Click & Mobile Init
// ============================================

// Force close sidebar on mobile init to prevent "stuck open" state
document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth < 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            console.log('Mobile init: forcing sidebar close');
            sidebar.classList.remove('active');
            sidebar.classList.remove('open'); // Just in case
        }
    }
});

// Close sidebar when clicking outside
document.addEventListener('click', (event) => {
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.querySelector('.menu-toggle');

    // If sidebar is active
    if (sidebar && sidebar.classList.contains('active')) {
        // If click is NOT within sidebar AND NOT on the toggle button
        if (!sidebar.contains(event.target) && (!menuToggle || !menuToggle.contains(event.target))) {
            console.log('Outside click detected: closing sidebar');
            sidebar.classList.remove('active');
        }
    }
});
