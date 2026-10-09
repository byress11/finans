// Durable, account-scoped synchronization. Only explicit tombstones delete data.
const FirebaseSync = {
    db: null, auth: null, currentUser: null, syncEnabled: false,
    epoch: 0, chain: Promise.resolve(), authChain: Promise.resolve(),
    realtimeUnsubscribers: [], autoSyncTimer: null, syncTimer: null,
    lastSyncTime: null, appReady: false, paused: false, pauseDepth: 0, lastError: null,

    async init() {
        if (typeof firebase === 'undefined') return false;
        try {
            firebase.initializeApp(FirebaseConfig);
            this.db = firebase.firestore();
            this.auth = firebase.auth();
            await new Promise((resolve, reject) => {
                let first = true;
                this.auth.onAuthStateChanged(user => {
                    const epoch = ++this.epoch;
                    this.syncEnabled = false;
                    this.stopAutoSync(); this.stopRealtimeSync();
                    this.authChain = this.authChain.catch(() => {}).then(() => this.changeAccount(user, epoch));
                    this.authChain.then(() => { if (first) { first = false; resolve(); } }).catch(error => {
                        this.lastError = error.message;
                        if (first) { first = false; reject(error); }
                        else Utils.showToast('Hesap açılamadı: ' + error.message, 'error');
                    });
                }, reject);
            });
            return true;
        } catch (error) { this.lastError = error.message; console.warn('Firebase başlatılamadı:', error); return false; }
    },
    async changeAccount(user, epoch) {
        if (epoch !== this.epoch) return;
        document.body.inert = true;
        try {
            await this.chain.catch(() => {});
            if (epoch !== this.epoch) return;
            await DBManager.init(user ? user.uid : 'guest');
            this.currentUser = user;
            this.lastSyncTime = (await DBManager.get('settings', 'sync:lastTime'))?.value || null;
            if (typeof AppState !== 'undefined') {
                AppState.currentProfile = null;
                for (const name of DataSafety.stores) AppState[name] = [];
                AppState.notifications = [];
                TransactionManager.undoStack = []; TransactionManager.redoStack = [];
                NotesPage.editingNote = null;
                clearTimeout(NotesPage.autoSaveTimer);
                for (const modal of document.querySelectorAll('.modal.active')) modal.classList.remove('active');
            }
            this.syncEnabled = !!user;
            if (user) await this.runSyncCycle({ silent: true });
            if (this.appReady) {
                await ProfileManager.loadProfiles();
                await DataManager.loadProfileData();
                AppState.refreshAllPages();
                SyncPage.updateUI();
            }
            if (user) { this.startRealtimeSync(); this.startAutoSync(); }
        } finally { document.body.inert = false; }
    },
    async signIn(email, password) {
        try { await this.auth.signInWithEmailAndPassword(email, password); await this.authChain; }
        catch (error) { Utils.showToast('Giriş başarısız: ' + error.message, 'error'); }
    },
    async signUp(email, password) {
        try { await this.auth.createUserWithEmailAndPassword(email, password); await this.authChain; }
        catch (error) { Utils.showToast('Kayıt başarısız: ' + error.message, 'error'); }
    },
    async signOut() {
        try { await this.auth.signOut(); await this.authChain; }
        catch (error) { Utils.showToast('Çıkış başarısız: ' + error.message, 'error'); }
    },
    context() { return { uid: this.currentUser?.uid, epoch: this.epoch, local: DBManager.connection() }; },
    valid(ctx) { return this.syncEnabled && ctx.uid === this.currentUser?.uid && ctx.epoch === this.epoch && ctx.local.db === DBManager.db; },
    assert(ctx) { if (!this.valid(ctx)) throw new Error('Hesap değişti; önceki işlem durduruldu.'); },
    ref(ctx, store, id) { return this.db.collection('users').doc(ctx.uid).collection(store).doc(id); },
    serialize(task) {
        const result = this.chain.catch(() => {}).then(task);
        this.chain = result.catch(() => {});
        return result;
    },
    async push(ctx) {
        const entries = await ctx.local.getAll('pendingSync');
        for (const entry of entries) {
            this.assert(ctx);
            if (entry.conflict) continue;
            const ref = this.ref(ctx, entry.store, entry.recordId);
            const deletedRef = this.ref(ctx, 'deletions', entry.id);
            const outcome = await this.db.runTransaction(async tx => {
                this.assert(ctx);
                const recordSnap = await tx.get(ref);
                const deleteSnap = await tx.get(deletedRef);
                const record = recordSnap.exists ? recordSnap.data() : null;
                const deletion = deleteSnap.exists ? deleteSnap.data() : null;
                const remote = { record, deletion };
                // Retry after an uncertain network result is idempotent.
                if ((record?._syncToken || deletion?._syncToken) === entry.token) return remote;
                if (DataSafety.remoteSignature(record, deletion) !== entry.base) return { conflict: remote };
                this.assert(ctx);
                const version = Math.max(record?._syncVersion || 0, deletion?._syncVersion || 0) + 1;
                if (entry.operation === 'delete') {
                    const tombstone = { store: entry.store, id: entry.recordId, deletedAt: entry.updatedAt, _syncToken: entry.token, _syncVersion: version };
                    tx.delete(ref); tx.set(deletedRef, tombstone);
                    return { record: null, deletion: tombstone };
                }
                const saved = { ...entry.data, _syncToken: entry.token, _syncVersion: version };
                tx.set(ref, saved); tx.delete(deletedRef);
                return { record: saved, deletion: null };
            });
            this.assert(ctx);
            if (outcome.conflict) await ctx.local.markConflict(entry, outcome.conflict);
            else await ctx.local.acknowledge(entry, outcome.record, outcome.deletion);
        }
    },
    async fetchCloud(ctx) {
        this.assert(ctx);
        const names = [...DataSafety.stores, 'deletions'];
        const snapshots = await Promise.all(names.map(name => this.db.collection('users').doc(ctx.uid).collection(name).get({ source: 'server' })));
        this.assert(ctx);
        return Object.fromEntries(names.map((name, i) => [name, snapshots[i].docs.map(doc => ({ ...doc.data(), id: name === 'deletions' ? doc.data().id : doc.id }))]));
    },
    async pull(ctx) {
        const cloud = await this.fetchCloud(ctx);
        const deleted = new Map(cloud.deletions.filter(d => DataSafety.stores.includes(d.store) && DataSafety.id(d.id)).map(d => [`${d.store}:${d.id}`, d]));
        for (const store of DataSafety.stores) {
            for (const record of cloud[store]) {
                this.assert(ctx);
                const deletion = deleted.get(`${store}:${record.id}`);
                // Concurrent collection snapshots can contain both sides of a restore.
                if (!deletion || (record._syncVersion || 0) > (deletion._syncVersion || 0)) {
                    await ctx.local.applyRemote(store, record.id, record, null);
                    deleted.delete(`${store}:${record.id}`);
                }
            }
        }
        for (const deletion of deleted.values()) {
            this.assert(ctx);
            await ctx.local.applyRemote(deletion.store, deletion.id, null, deletion);
        }
    },
    async runSyncCycle({ silent = false } = {}) {
        if (!this.syncEnabled || this.paused) return false;
        const ctx = this.context();
        return this.serialize(async () => {
            if (!this.valid(ctx) || this.paused) return false;
            try {
                await this.push(ctx);
                await this.pull(ctx);
                this.assert(ctx);
                this.lastSyncTime = new Date().toISOString(); this.lastError = null;
                await ctx.local.put('settings', { key: 'sync:lastTime', value: this.lastSyncTime });
                if (this.appReady) await this.refreshFromDb();
                const pending = await ctx.local.getAll('pendingSync');
                if (!silent) Utils.showToast(pending.length ? 'Yerel kayıtlar korundu; bekleyen değişiklikleri kontrol edin.' : 'Senkronizasyon tamamlandı', pending.length ? 'warning' : 'success');
                return true;
            } catch (error) {
                if (this.valid(ctx)) { this.lastError = error.message; if (!silent) Utils.showToast('Veriler cihazda korundu. Senkronizasyon: ' + error.message, 'error'); }
                return false;
            } finally { if (this.valid(ctx) && this.appReady) this.updateStatus(); }
        });
    },
    syncNow() { return this.runSyncCycle(); },
    syncToCloud(options) { return this.runSyncCycle(options); },
    syncFromCloud(options) { return this.runSyncCycle(options); },
    queueDeletion() { this.scheduleSync(); }, // The DB write already queued the deletion atomically.
    clearPendingDeletion() { this.scheduleSync(); }, // Undo wrote a replacement queue entry.
    scheduleSync() {
        if (!this.syncEnabled || this.paused || this.syncTimer) return;
        this.syncTimer = setTimeout(() => { this.syncTimer = null; void this.runSyncCycle({ silent: true }); }, 1000);
    },
    startAutoSync() {
        this.stopAutoSync();
        this.autoSyncTimer = setInterval(() => this.scheduleSync(), 5 * 60 * 1000);
    },
    stopAutoSync() { clearInterval(this.autoSyncTimer); clearTimeout(this.syncTimer); this.autoSyncTimer = this.syncTimer = null; },
    startRealtimeSync() {
        this.stopRealtimeSync();
        const ctx = this.context();
        if (!this.valid(ctx)) return;
        for (const name of [...DataSafety.stores, 'deletions']) {
            this.realtimeUnsubscribers.push(this.db.collection('users').doc(ctx.uid).collection(name).onSnapshot(snapshot => {
                if (this.valid(ctx) && !snapshot.metadata?.hasPendingWrites) this.scheduleSync();
            }, error => { if (this.valid(ctx)) this.lastError = error.message; }));
        }
    },
    stopRealtimeSync() { for (const stop of this.realtimeUnsubscribers) stop(); this.realtimeUnsubscribers = []; },
    async exclusiveLocal(work) {
        const epoch = this.epoch;
        this.pauseDepth++;
        this.paused = true; this.stopAutoSync(); this.stopRealtimeSync();
        document.body.inert = true;
        try {
            return await this.serialize(async () => {
                if (epoch !== this.epoch) throw new Error('Hesap değişti. İşlemi yeniden başlatın.');
                return work();
            });
        } finally {
            this.paused = --this.pauseDepth > 0; document.body.inert = this.paused;
            if (!this.paused && this.syncEnabled && epoch === this.epoch) { this.startAutoSync(); this.startRealtimeSync(); this.scheduleSync(); }
        }
    },
    async refreshFromDb() {
        AppState.profiles = await DBManager.getAll('profiles');
        const selected = AppState.currentProfile?.id;
        AppState.currentProfile = AppState.profiles.find(p => p.id === selected) || null;
        if (!AppState.profiles.length) await ProfileManager.loadProfiles();
        else if (!AppState.currentProfile) AppState.currentProfile = AppState.profiles[0];
        TransactionManager.undoStack = TransactionManager.undoStack.filter(a => (a.transaction || a.oldTransaction)?.profileId === AppState.currentProfile.id);
        await DataManager.loadProfileData();
        ProfileManager.updateProfileUI();
        AppState.refreshAllPages();
    },
    async resolveConflict(key, choice) {
        if (!['local', 'cloud'].includes(choice)) return;
        await this.exclusiveLocal(async () => {
            const entry = await DBManager.get('pendingSync', key);
            if (!entry?.conflict) return;
            if (choice === 'local') {
                const { conflict, ...next } = entry;
                await DBManager.put('pendingSync', { ...next, token: DataSafety.token(), base: DataSafety.remoteSignature(conflict.record, conflict.deletion) });
            } else {
                const { record, deletion } = entry.conflict;
                // Keep the displaced local edit recoverable.
                await DBManager.put('settings', { key: 'conflictBackup:' + entry.token, value: entry });
                await DBManager.acknowledge(entry, record, deletion);
                await DBManager.applyRemote(entry.store, entry.recordId, record, deletion);
            }
        });
        await this.runSyncCycle();
    },
    async updateStatus() {
        const element = document.getElementById('syncPending');
        if (!element) return;
        const ctx = this.context();
        const pending = await ctx.local.getAll('pendingSync');
        if (ctx.epoch !== this.epoch) return;
        element.replaceChildren();
        const status = document.createElement('p');
        status.textContent = this.lastError ? `Cihazda kaydedildi. Buluta gönderilemedi: ${this.lastError}` : pending.length ? `${pending.length} değişiklik buluta gönderilmeyi bekliyor.` : 'Tüm değişiklikler eşitlendi.';
        element.append(status);
        for (const entry of pending.filter(e => e.conflict)) {
            const row = document.createElement('div');
            const text = document.createElement('p');
            const remote = entry.conflict.record;
            text.textContent = `${entry.data?.title || entry.data?.name || entry.data?.description || entry.recordId}: başka cihazda değiştirildi. Yerel: ${entry.data?.amount ?? entry.data?.title ?? entry.operation}. Bulut: ${remote?.amount ?? remote?.title ?? (remote ? 'değiştirildi' : 'silindi')}.`;
            row.append(text);
            for (const [choice, label] of [['local', 'Bu cihazdakini kullan'], ['cloud', 'Buluttakini kullan']]) {
                const button = document.createElement('button'); button.className = 'btn btn-secondary'; button.textContent = label;
                button.addEventListener('click', () => this.resolveConflict(entry.id, choice).catch(e => Utils.showToast(e.message, 'error')));
                row.append(button);
            }
            element.append(row);
        }
    },
    async importGuestData() {
        if (!this.currentUser) return;
        const approved = await Dialog.confirmAction('Bu cihazdaki oturumsuz/eski kayıtlar açık hesabınıza kopyalanacak. Bu kayıtların size ait olduğundan emin olun. Mevcut cihaz kopyası korunur.', { title: 'Cihaz verilerini hesaba kopyala', confirmText: 'Kopyala' });
        if (!approved) return;
        await this.exclusiveLocal(async () => {
            const guest = await DBManager.open('guest');
            try {
                const source = await DBManager.connection(guest).snapshot();
                const current = await DBManager.snapshot();
                const merged = { version: '2.0' };
                for (const store of DataSafety.stores) {
                    const map = new Map(current[store].map(item => [item.id, item]));
                    for (const item of source[store]) {
                        if (map.has(item.id) && DataSafety.signature(map.get(item.id)) !== DataSafety.signature(item)) throw new Error('Aynı kimlikte farklı kayıt var. Önce JSON yedeğini dışa aktarın.');
                        map.set(item.id, item);
                    }
                    merged[store] = [...map.values()];
                }
                await DBManager.replaceAll(merged);
            } finally { guest.close(); }
        });
        await this.runSyncCycle(); await this.refreshFromDb();
    },
    async forceReplaceFromCloud() {
        if (!this.currentUser) return false;
        try {
            await this.exclusiveLocal(async () => {
                const ctx = this.context(); const cloud = await this.fetchCloud(ctx);
                if (!cloud.profiles.length) throw new Error('Bulutta profil yok; cihaz verileri korundu.');
                const valid = DataSafety.backup({ ...cloud, version: '2.0' });
                const backup = await BackupService.exportAll();
                await ctx.local.put('settings', { key: 'recoveryBackup', value: backup });
                this.assert(ctx);
                await ctx.local.replaceAll(valid, { remote: true });
            });
            await this.refreshFromDb(); Utils.showToast('Bulut verileri yüklendi', 'success'); return true;
        } catch (error) { Utils.showToast(error.message, 'error'); return false; }
    },
    async forceUploadToCloud() {
        if (!this.syncEnabled) return false;
        // Queue local records without first clearing the cloud. Conflicts stay visible.
        try {
            await this.exclusiveLocal(async () => {
                const data = await BackupService.exportAll();
                await DBManager.replaceAll(data);
            });
            return await this.runSyncCycle();
        } catch (error) { Utils.showToast(error.message, 'error'); return false; }
    },
    async clearCloudData() {
        // Queue tombstones atomically; no cloud-wide destructive intermediate state.
        const empty = Object.fromEntries(DataSafety.stores.map(name => [name, []]));
        await DBManager.replaceAll({ ...empty, version: '2.0' });
    }
};
window.addEventListener('online', () => FirebaseSync.scheduleSync());
