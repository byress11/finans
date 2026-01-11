/**
 * Firebase Configuration & Sync Module
 */

const FirebaseConfig = {
    // Firebase yapılandırmanızı buraya ekleyin
    apiKey: "AIzaSyDDxGZwpV_8-RyMvgCdXIY_uHwvX0Tjeu4",
    authDomain: "geligider-5a407.firebaseapp.com",
    projectId: "geligider-5a407",
    storageBucket: "geligider-5a407.firebasestorage.app",
    messagingSenderId: "236783830924",
    appId: "1:236783830924:web:d76cf48d174effa89bf8a9",
    measurementId: "G-0E9ECLLXT8"
};


const FirebaseSync = {
    db: null,
    auth: null,
    currentUser: null,
    syncEnabled: false,
    lastSyncTime: null,
    autoSyncTimer: null,
    syncInProgress: false,
    realtimeUnsubscribers: [],
    realtimeRefreshTimer: null,

    async init() {
        try {
            if (typeof firebase === 'undefined') {
                console.warn('Firebase SDK not loaded');
                return false;
            }

            firebase.initializeApp(FirebaseConfig);
            this.db = firebase.firestore();
            this.auth = firebase.auth();

            // Auth state listener
            this.auth.onAuthStateChanged(async user => {
                this.currentUser = user;
                if (user) {
                    this.syncEnabled = true;
                    // Otomatik sync yerine sadece merge yap (local verileri korur)
                    await this.syncFromCloud({ silent: true });
                    this.startRealtimeSync();
                    this.startAutoSync();
                } else {
                    this.syncEnabled = false;
                    this.stopAutoSync();
                    this.stopRealtimeSync();
                }
            });

            return true;
        } catch (error) {
            console.error('Firebase init failed:', error);
            return false;
        }
    },

    async signIn(email, password) {
        try {
            const result = await this.auth.signInWithEmailAndPassword(email, password);
            Utils.showToast('Giriş başarılı', 'success');
            // Auth state listener zaten syncFromCloud çağıracak, duplicate çağrı yapmıyoruz
            return result.user;
        } catch (error) {
            Utils.showToast('Giriş başarısız: ' + error.message, 'error');
            throw error;
        }
    },

    async signUp(email, password) {
        try {
            const result = await this.auth.createUserWithEmailAndPassword(email, password);
            Utils.showToast('Hesap oluşturuldu', 'success');
            await this.syncToCloud();
            return result.user;
        } catch (error) {
            Utils.showToast('Kayıt başarısız: ' + error.message, 'error');
            throw error;
        }
    },

    async signOut() {
        try {
            await this.auth.signOut();
            this.syncEnabled = false;
            this.stopAutoSync();
            this.stopRealtimeSync();
            Utils.showToast('Çıkış yapıldı', 'success');
        } catch (error) {
            Utils.showToast('Çıkış başarısız', 'error');
        }
    },

    async syncNow() {
        await this.runSyncCycle();
    },

    // Firestore batch limit: 500 operasyon
    BATCH_LIMIT: 450,

    // Batch'leri bölerek commit et
    async commitInBatches(operations) {
        const batches = [];
        let currentBatch = this.db.batch();
        let operationCount = 0;

        for (const op of operations) {
            if (operationCount >= this.BATCH_LIMIT) {
                batches.push(currentBatch);
                currentBatch = this.db.batch();
                operationCount = 0;
            }
            op(currentBatch);
            operationCount++;
        }

        if (operationCount > 0) {
            batches.push(currentBatch);
        }

        // Tüm batch'leri commit et
        for (const batch of batches) {
            await batch.commit();
        }
    },

    async syncToCloud(options = {}) {
        const { silent = false } = options;
        if (!this.syncEnabled || !this.currentUser) return;

        try {
            await this.flushPendingDeletes({ silent });
            const userId = this.currentUser.uid;
            const operations = [];

            // Sync profiles
            const profilesRef = this.db.collection('users').doc(userId).collection('profiles');
            for (const profile of AppState.profiles) {
                operations.push(batch => batch.set(profilesRef.doc(profile.id), profile));
            }

            // Sync transactions
            const txRef = this.db.collection('users').doc(userId).collection('transactions');
            for (const tx of AppState.transactions) {
                operations.push(batch => batch.set(txRef.doc(tx.id), tx));
            }

            // Sync categories
            const catRef = this.db.collection('users').doc(userId).collection('categories');
            for (const cat of AppState.categories) {
                operations.push(batch => batch.set(catRef.doc(cat.id), cat));
            }

            // Sync debts
            const debtRef = this.db.collection('users').doc(userId).collection('debts');
            for (const debt of AppState.debts || []) {
                operations.push(batch => batch.set(debtRef.doc(debt.id), debt));
            }

            // Sync investments
            const invRef = this.db.collection('users').doc(userId).collection('investments');
            for (const inv of AppState.investments || []) {
                operations.push(batch => batch.set(invRef.doc(inv.id), inv));
            }

            // Sync bills
            const billRef = this.db.collection('users').doc(userId).collection('bills');
            for (const bill of AppState.bills || []) {
                operations.push(batch => batch.set(billRef.doc(bill.id), bill));
            }

            // Sync notes
            const noteRef = this.db.collection('users').doc(userId).collection('notes');
            for (const note of AppState.notes || []) {
                operations.push(batch => batch.set(noteRef.doc(note.id), note));
            }

            // Batch limit'e göre bölerek commit et
            await this.commitInBatches(operations);

            this.lastSyncTime = new Date().toISOString();
            localStorage.setItem('lastSyncTime', this.lastSyncTime);
            if (silent) return;

            Utils.showToast('Senkronizasyon tamamlandı', 'success');
        } catch (error) {
            console.error('Sync to cloud failed:', error);
            if (silent) return;
            Utils.showToast('Senkronizasyon başarısız', 'error');
        }
    },

    async syncFromCloud(options = {}) {
        const { silent = false } = options;
        if (!this.syncEnabled || !this.currentUser) return;

        // Capture last sync time before updates to detect implicit deletions (Zombie data)
        const lastSyncTimeStr = localStorage.getItem('lastSyncTime');

        try {
            const userId = this.currentUser.uid;

            // Fetch all collections in parallel for performance
            const [
                profilesSnap, txSnap, catSnap, debtSnap,
                invSnap, billSnap, noteSnap, deletionsSnap
            ] = await Promise.all([
                this.db.collection('users').doc(userId).collection('profiles').get(),
                this.db.collection('users').doc(userId).collection('transactions').get(),
                this.db.collection('users').doc(userId).collection('categories').get(),
                this.db.collection('users').doc(userId).collection('debts').get(),
                this.db.collection('users').doc(userId).collection('investments').get(),
                this.db.collection('users').doc(userId).collection('bills').get(),
                this.db.collection('users').doc(userId).collection('notes').get(),
                this.db.collection('users').doc(userId).collection('deletions').get()
            ]);

            const cloudData = {
                profiles: profilesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                transactions: txSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                categories: catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                debts: debtSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                investments: invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                bills: billSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                notes: noteSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            };

            const deletions = deletionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Merge with local data (Cloud items > Local items if newer)
            const dataChanged = await this.mergeData(cloudData);

            // Apply explicit deletions from cloud
            const deletionsChanged = await this.applyDeletions(deletions);

            // Handle implicit deletions (Items missing in cloud & older than last sync)
            const implicitChanged = await this.handleImplicitDeletions(cloudData, lastSyncTimeStr);

            if (dataChanged || deletionsChanged || implicitChanged) {
                await this.refreshFromDb();
            }

            this.lastSyncTime = new Date().toISOString();
            localStorage.setItem('lastSyncTime', this.lastSyncTime);
            if (silent) return;

            Utils.showToast('Veriler senkronize edildi', 'success');
        } catch (error) {
            console.error('Sync from cloud failed:', error);
            if (silent) return;
            Utils.showToast('Veri indirme başarısız', 'error');
        }
    },

    /**
     * Force replace all local data with cloud data (Cloud Wins Strategy)
     * Clears local stores and downloads fresh data from cloud
     */
    async forceReplaceFromCloud(options = {}) {
        const { silent = false, skipEmptyCheck = false } = options;
        if (!this.currentUser) {
            if (!silent) Utils.showToast('Oturum açmanız gerekiyor', 'error');
            return false;
        }

        try {
            if (!silent) Utils.showToast('Senkronizasyon başlatılıyor...', 'info');

            const userId = this.currentUser.uid;
            const stores = ['profiles', 'transactions', 'categories', 'debts', 'investments', 'bills', 'notes'];

            // Fetch all cloud data in parallel
            const snapshots = await Promise.all(
                stores.map(store =>
                    this.db.collection('users').doc(userId).collection(store).get()
                )
            );

            // Cloud'da toplam veri sayısını kontrol et
            const totalCloudItems = snapshots.reduce((sum, snap) => sum + snap.docs.length, 0);

            // Local'de veri var mı kontrol et
            let totalLocalItems = 0;
            for (const storeName of stores) {
                const localItems = await DBManager.getAll(storeName);
                totalLocalItems += localItems.length;
            }

            // KORUMA: Cloud boşsa ve local'de veri varsa, silme işlemi yapma
            if (!skipEmptyCheck && totalCloudItems === 0 && totalLocalItems > 0) {
                console.warn('Cloud boş ama local\'de veri var. Local veriler korunuyor.');
                if (!silent) Utils.showToast('Bulutta veri bulunamadı. Yerel veriler korundu.', 'info');
                return false;
            }

            // Clear all local stores first using clear() - more reliable than individual deletes
            for (const storeName of stores) {
                try {
                    await DBManager.clear(storeName);
                } catch (clearError) {
                    console.warn(`Failed to clear ${storeName}:`, clearError);
                }
            }

            // Clear pending deletions
            this.savePendingDeletes([]);
            localStorage.removeItem('lastSyncTime');

            // Save cloud data to local using put() - upsert behavior (add or update)
            for (let i = 0; i < stores.length; i++) {
                const storeName = stores[i];
                const docs = snapshots[i].docs;

                for (const doc of docs) {
                    const data = { id: doc.id, ...doc.data() };
                    try {
                        await DBManager.put(storeName, data);
                    } catch (putError) {
                        console.warn(`Failed to put ${storeName}/${data.id}:`, putError);
                    }
                }
            }

            // Update sync time
            this.lastSyncTime = new Date().toISOString();
            localStorage.setItem('lastSyncTime', this.lastSyncTime);

            // Refresh UI
            await this.refreshFromDb();

            if (!silent) Utils.showToast('Veriler buluttan senkronize edildi', 'success');
            return true;
        } catch (error) {
            console.error('Force sync from cloud failed:', error);
            if (!silent) Utils.showToast('Senkronizasyon başarısız: ' + error.message, 'error');
            return false;
        }
    },

    /**
     * Force upload all local data to cloud (Local Wins Strategy)
     * Clears cloud data and uploads fresh data from local
     */
    async forceUploadToCloud(options = {}) {
        const { silent = false } = options;
        if (!this.currentUser) {
            if (!silent) Utils.showToast('Oturum açmanız gerekiyor', 'error');
            return false;
        }

        try {
            if (!silent) Utils.showToast('Veriler buluta yükleniyor...', 'info');

            // ÖNCE realtime sync'i durdur - böylece boş cloud verileri local'i silmez
            this.stopRealtimeSync();

            const userId = this.currentUser.uid;
            const stores = ['profiles', 'transactions', 'categories', 'debts', 'investments', 'bills', 'notes'];

            // Önce local verileri belleğe al (cloud temizlenmeden önce)
            const localDataBackup = {};
            for (const storeName of stores) {
                localDataBackup[storeName] = await DBManager.getAll(storeName);
            }

            // Cloud'u temizle
            await this.clearCloudData({ silent: true });

            // Local verilerden cloud'a yükle (backup'tan) - batch limit'e uygun
            const operations = [];

            for (const storeName of stores) {
                const localItems = localDataBackup[storeName];
                const collectionRef = this.db.collection('users').doc(userId).collection(storeName);

                for (const item of localItems) {
                    operations.push(batch => batch.set(collectionRef.doc(item.id), item));
                }
            }

            await this.commitInBatches(operations);

            // Update sync time
            this.lastSyncTime = new Date().toISOString();
            localStorage.setItem('lastSyncTime', this.lastSyncTime);

            // Clear pending deletions since we just synced everything
            this.savePendingDeletes([]);

            // Realtime sync'i tekrar başlat
            this.startRealtimeSync();

            if (!silent) Utils.showToast('Tüm veriler buluta yüklendi', 'success');
            return true;
        } catch (error) {
            console.error('Force upload to cloud failed:', error);
            // Hata durumunda da realtime sync'i başlat
            this.startRealtimeSync();
            if (!silent) Utils.showToast('Yükleme başarısız: ' + error.message, 'error');
            return false;
        }
    },

    /**
     * Detects and removes items that exist locally but are missing from cloud,
     * implying they were deleted on another device.
     * Only applies to items older than the last sync time to protect offline-created items.
     */
    async handleImplicitDeletions(cloudData, lastSyncTimeStr) {
        if (!lastSyncTimeStr) return false;

        const lastSyncTime = new Date(lastSyncTimeStr).getTime();
        if (Number.isNaN(lastSyncTime)) return false;

        // Safety check: if last sync was way in future (clock error), don't delete
        if (lastSyncTime > Date.now() + 86400000) return false;

        // KORUMA: Cloud tamamen boşsa implicit deletion yapma
        const totalCloudItems = Object.values(cloudData).reduce((sum, items) =>
            sum + (Array.isArray(items) ? items.length : 0), 0);
        if (totalCloudItems === 0) {
            console.warn('Cloud boş, implicit deletion atlanıyor.');
            return false;
        }

        let changed = false;
        const stores = ['profiles', 'transactions', 'categories', 'debts', 'investments', 'bills', 'notes'];

        for (const storeName of stores) {
            const cloudItems = cloudData[storeName];
            if (!Array.isArray(cloudItems)) continue;

            const cloudIdSet = new Set(cloudItems.map(i => i.id));
            const localItems = await DBManager.getAll(storeName);

            for (const item of localItems) {
                // If item exists locally but NOT in cloud
                if (!cloudIdSet.has(item.id)) {
                    // Check if it's an old item (synced before)
                    const itemTime = this.getItemTimestamp(item);

                    // Logic:
                    // If item.updatedAt <= lastSyncTime: 
                    // It means this item existed during the last sync cycle.
                    // Since it is NOT in the cloud now, it MUST have been deleted remotely.
                    // Action: Delete local copy.
                    //
                    // If item.updatedAt > lastSyncTime:
                    // It was created/updated locally AFTER the last sync (e.g. while offline).
                    // Action: Keep local copy (it will be uploaded by syncToCloud).

                    // Adding 1 min tolerance to lastSyncTime to be safe against minor clock skews
                    if (itemTime <= lastSyncTime + 60000) {
                        try {
                            await DBManager.delete(storeName, item.id);
                            // Also clear from pending deletions if it's there (to be clean)
                            this.clearPendingDeletion(storeName, item.id);
                            changed = true;
                            console.log(`[Sync] Implicitly deleted ${storeName}/${item.id} (Missing in cloud)`);
                        } catch (e) {
                            console.warn(`[Sync] Failed to implicitly delete ${storeName}/${item.id}`, e);
                        }
                    }
                }
            }
        }
        return changed;
    },

    async mergeData(cloudData) {
        const profileMap = new Map((await DBManager.getAll('profiles')).map(item => [item.id, item]));
        const transactionMap = new Map((await DBManager.getAll('transactions')).map(item => [item.id, item]));
        const categoryMap = new Map((await DBManager.getAll('categories')).map(item => [item.id, item]));
        const debtMap = new Map((await DBManager.getAll('debts')).map(item => [item.id, item]));
        const investmentMap = new Map((await DBManager.getAll('investments')).map(item => [item.id, item]));
        const billMap = new Map((await DBManager.getAll('bills')).map(item => [item.id, item]));
        const noteMap = new Map((await DBManager.getAll('notes')).map(item => [item.id, item]));

        const profilesChanged = await this.mergeStore('profiles', cloudData.profiles, profileMap);
        const transactionsChanged = await this.mergeStore('transactions', cloudData.transactions, transactionMap);
        const categoriesChanged = await this.mergeStore('categories', cloudData.categories, categoryMap);
        const debtsChanged = await this.mergeStore('debts', cloudData.debts, debtMap);
        const investmentsChanged = await this.mergeStore('investments', cloudData.investments, investmentMap);
        const billsChanged = await this.mergeStore('bills', cloudData.bills, billMap);
        const notesChanged = await this.mergeStore('notes', cloudData.notes, noteMap);
        return transactionsChanged || categoriesChanged || debtsChanged || investmentsChanged || billsChanged || notesChanged || profilesChanged;
    },

    getItemTimestamp(item) {
        if (!item) return 0;
        const value = item.updatedAt || item.createdAt || 0;
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    },

    async mergeStore(storeName, items, localMap) {
        if (!Array.isArray(items)) return false;
        let changed = false;

        for (const item of items) {
            const local = localMap.get(item.id);
            if (!local) {
                await DBManager.add(storeName, item);
                localMap.set(item.id, item);
                changed = true;
                continue;
            }

            if (this.getItemTimestamp(item) > this.getItemTimestamp(local)) {
                await DBManager.put(storeName, item);
                localMap.set(item.id, item);
                changed = true;
            }
        }

        return changed;
    },

    async clearCloudData(options = {}) {
        const { silent = false } = options;
        if (!this.syncEnabled || !this.currentUser || !this.db) return;

        try {
            const userId = this.currentUser.uid;
            const userRef = this.db.collection('users').doc(userId);
            const collections = [
                'profiles',
                'transactions',
                'categories',
                'debts',
                'investments',
                'bills',
                'notes',
                'deletions'
            ];

            for (const name of collections) {
                await this.deleteCollectionDocs(userRef.collection(name));
            }

            this.savePendingDeletes([]);
        } catch (error) {
            console.error('Clear cloud data failed:', error);
            if (!silent) {
                Utils.showToast('Bulut verileri silinemedi', 'error');
            }
            throw error;
        }
    },

    async deleteCollectionDocs(collectionRef) {
        const batchSize = 400;
        while (true) {
            const snapshot = await collectionRef.limit(batchSize).get();
            if (snapshot.empty) break;

            const batch = this.db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
    },

    getPendingDeletes() {
        try {
            const raw = localStorage.getItem('pendingDeletes');
            return raw ? JSON.parse(raw) : [];
        } catch (error) {
            return [];
        }
    },

    savePendingDeletes(pending) {
        localStorage.setItem('pendingDeletes', JSON.stringify(pending || []));
    },

    queueDeletion(storeName, id) {
        if (!storeName || !id) return;
        const pending = this.getPendingDeletes();
        const key = `${storeName}:${id}`;
        if (!pending.some(item => item.key === key)) {
            pending.push({
                key,
                store: storeName,
                id,
                deletedAt: new Date().toISOString()
            });
            this.savePendingDeletes(pending);
        }

        if (this.syncEnabled) {
            void this.flushPendingDeletes({ silent: true });
        }
    },

    clearPendingDeletion(storeName, id) {
        if (!storeName || !id) return;
        const key = `${storeName}:${id}`;
        const pending = this.getPendingDeletes();
        const next = pending.filter(item => item.key !== key);
        if (next.length !== pending.length) {
            this.savePendingDeletes(next);
        }
    },

    async flushPendingDeletes(options = {}) {
        const { silent = false } = options;
        if (!this.syncEnabled || !this.currentUser) return;

        const pending = this.getPendingDeletes();
        if (pending.length === 0) return;

        try {
            const userId = this.currentUser.uid;
            const batch = this.db.batch();
            const deletionsRef = this.db.collection('users').doc(userId).collection('deletions');

            for (const item of pending) {
                if (!item || !item.store || !item.id) continue;
                const docId = item.key || `${item.store}:${item.id}`;
                batch.set(deletionsRef.doc(docId), {
                    store: item.store,
                    id: item.id,
                    deletedAt: item.deletedAt || new Date().toISOString()
                });
                batch.delete(this.db.collection('users').doc(userId).collection(item.store).doc(item.id));
            }

            await batch.commit();
            this.savePendingDeletes([]);
        } catch (error) {
            console.error('Flush deletes failed:', error);
            if (!silent) {
                Utils.showToast('Silme senkronizasyonu baYarŽñsŽñz', 'error');
            }
        }
    },

    async applyDeletions(deletions) {
        if (!Array.isArray(deletions) || deletions.length === 0) return false;
        let changed = false;

        for (const item of deletions) {
            if (!item || !item.store || !item.id) continue;
            await DBManager.delete(item.store, item.id);
            this.clearPendingDeletion(item.store, item.id);
            changed = true;
        }

        return changed;
    },

    async refreshFromDb() {
        if (typeof AppState === 'undefined') return;

        AppState.profiles = await DBManager.getAll('profiles');

        if (AppState.profiles.length > 0) {
            const currentProfileId = AppState.currentProfile?.id || localStorage.getItem('activeProfileId');
            AppState.currentProfile = AppState.profiles.find(p => p.id === currentProfileId) || AppState.profiles[0];
            if (AppState.currentProfile) {
                localStorage.setItem('activeProfileId', AppState.currentProfile.id);
            }
        } else {
            AppState.currentProfile = null;
            localStorage.removeItem('activeProfileId');
        }

        if (typeof ProfileManager !== 'undefined') {
            if (document.getElementById('profileAvatar')) {
                ProfileManager.updateProfileUI();
            }
            if (document.getElementById('profileList')) {
                ProfileManager.renderProfileList();
            }
        }

        if (typeof DataManager !== 'undefined' && AppState.currentProfile) {
            await DataManager.loadProfileData();
        }

        if (AppState.currentProfile) {
            AppState.refreshAllPages();
        }
    },

    startRealtimeSync() {
        this.stopRealtimeSync();
        if (!this.currentUser || !this.db) return;

        const userId = this.currentUser.uid;
        const stores = ['profiles', 'transactions', 'categories', 'debts', 'investments', 'bills', 'notes'];

        stores.forEach(storeName => {
            const unsubscribe = this.db
                .collection('users')
                .doc(userId)
                .collection(storeName)
                .onSnapshot(
                    snapshot => {
                        this.handleRealtimeSnapshot(storeName, snapshot);
                    },
                    error => console.warn('Realtime sync failed:', error)
                );
            this.realtimeUnsubscribers.push(unsubscribe);
        });

        const deleteUnsub = this.db
            .collection('users')
            .doc(userId)
            .collection('deletions')
            .onSnapshot(
                snapshot => {
                    this.handleDeletionSnapshot(snapshot);
                },
                error => console.warn('Realtime deletes failed:', error)
            );
        this.realtimeUnsubscribers.push(deleteUnsub);
    },

    stopRealtimeSync() {
        if (this.realtimeRefreshTimer) {
            clearTimeout(this.realtimeRefreshTimer);
            this.realtimeRefreshTimer = null;
        }
        if (this.realtimeUnsubscribers.length > 0) {
            this.realtimeUnsubscribers.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            });
            this.realtimeUnsubscribers = [];
        }
    },

    async handleRealtimeSnapshot(storeName, snapshot) {
        if (!snapshot) return;
        let changed = false;

        for (const change of snapshot.docChanges()) {
            const data = change.doc.data() || {};
            const id = data.id || change.doc.id;
            if (!id) continue;

            if (change.type === 'removed') {
                await DBManager.delete(storeName, id);
                changed = true;
            } else {
                const item = { ...data, id };
                await DBManager.put(storeName, item);
                changed = true;
            }
        }

        if (changed) {
            this.scheduleRealtimeRefresh();
        }
    },

    async handleDeletionSnapshot(snapshot) {
        if (!snapshot) return;
        let changed = false;

        for (const change of snapshot.docChanges()) {
            if (change.type === 'removed') continue;
            const data = change.doc.data() || {};
            if (!data.store || !data.id) continue;

            await DBManager.delete(data.store, data.id);
            this.clearPendingDeletion(data.store, data.id);
            changed = true;
        }

        if (changed) {
            this.scheduleRealtimeRefresh();
        }
    },

    scheduleRealtimeRefresh() {
        if (this.realtimeRefreshTimer) return;
        this.realtimeRefreshTimer = setTimeout(async () => {
            this.realtimeRefreshTimer = null;
            try {
                await this.refreshFromDb();
            } catch (error) {
                console.warn('Realtime refresh failed:', error);
            }
        }, 250);
    },

    async runSyncCycle(options = {}) {
        if (this.syncInProgress) return;
        this.syncInProgress = true;
        try {
            await this.syncFromCloud(options);
            await this.syncToCloud(options);
        } finally {
            this.syncInProgress = false;
        }
    },

    startAutoSync() {
        this.stopAutoSync();
        // Auto sync every 5 minutes
        this.autoSyncTimer = setInterval(() => {
            if (this.syncEnabled) {
                this.runSyncCycle({ silent: true });
            }
        }, 5 * 60 * 1000);
    },

    stopAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
        }
    }
};

// Auto-sync on data changes - will be initialized after app loads
window.addEventListener('load', () => {
    if (typeof TransactionManager !== 'undefined') {
        const originalAdd = TransactionManager.add;
        TransactionManager.add = async function (data) {
            const result = await originalAdd.call(this, data);
            if (FirebaseSync.syncEnabled) {
                setTimeout(() => FirebaseSync.syncToCloud(), 1000);
            }
            return result;
        };
    }
});
