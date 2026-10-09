const DB_NAME = 'HizliButceDB';
const DB_VERSION = 2;
const DBManager = {
    db: null,
    scope: 'guest',
    async open(scope = 'guest') {
        const name = scope === 'guest' ? DB_NAME : DB_NAME + ':user:' + encodeURIComponent(scope);
        return new Promise((resolve, reject) => {
            let blocked = false;
            const request = indexedDB.open(name, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onblocked = () => { blocked = true; reject(new Error('Diğer açık uygulama sekmelerini kapatıp tekrar deneyin.')); };
            request.onupgradeneeded = () => {
                const db = request.result;
                const indices = { profiles: ['name'], transactions: ['profileId', 'date', 'type', 'category'], categories: ['profileId', 'type'], debts: ['profileId', 'type'], investments: ['profileId', 'type'], bills: ['dueDate'], notes: ['profileId'] };
                for (const [name, fields] of Object.entries(indices)) {
                    const store = db.objectStoreNames.contains(name) ? request.transaction.objectStore(name) : db.createObjectStore(name, { keyPath: 'id' });
                    for (const field of fields) if (!store.indexNames.contains(field)) store.createIndex(field, field, { unique: false });
                }
                for (const name of ['settings', 'pendingSync', 'syncMeta']) {
                    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
                }
            };
            request.onsuccess = () => {
                if (blocked) { request.result.close(); return; }
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
        });
    },
    async init(scope = 'guest') {
        if (this.db && this.scope === scope) return this.db;
        const db = await this.open(scope);
        this.db?.close();
        this.db = db;
        this.scope = scope;
        return db;
    },
    key(name) { return `hizli-butce:${this.scope}:${name}`; },
    connection(db = this.db) {
        // A captured connection never switches accounts underneath an async task.
        return Object.assign(Object.create(this), { db });
    },
    transaction(stores, mode, work) {
        return new Promise((resolve, reject) => {
            let result, thrown;
            const tx = this.db.transaction(stores, mode);
            tx.oncomplete = () => resolve(result);
            tx.onabort = tx.onerror = () => reject(thrown || tx.error || new Error('Veritabanı işlemi iptal edildi.'));
            try { work(tx, value => { result = value; }); }
            catch (error) { thrown = error; tx.abort(); }
        });
    },
    get(store, key) {
        return this.transaction([store], 'readonly', (tx, done) => { const req = tx.objectStore(store).get(key); req.onsuccess = () => done(req.result); });
    },
    getAll(store) {
        return this.transaction([store], 'readonly', (tx, done) => { const req = tx.objectStore(store).getAll(); req.onsuccess = () => done(req.result); });
    },
    getAllByIndex(store, index, key) {
        return this.transaction([store], 'readonly', (tx, done) => { const req = tx.objectStore(store).index(index).getAll(key); req.onsuccess = () => done(req.result); });
    },
    snapshot(stores = DataSafety.stores) {
        return this.transaction(stores, 'readonly', (tx, done) => {
            const data = {};
            for (const store of stores) { const req = tx.objectStore(store).getAll(); req.onsuccess = () => { data[store] = req.result; }; }
            done(data);
        });
    },
    queue(tx, store, id, operation, data) {
        const key = `${store}:${id}`;
        const pending = tx.objectStore('pendingSync');
        const old = pending.get(key);
        const meta = tx.objectStore('syncMeta').get(key);
        meta.onsuccess = () => {
            pending.put({ id: key, store, recordId: id, operation, data: data || null,
                token: DataSafety.token(), base: old.result?.base ?? meta.result?.signature ?? DataSafety.remoteSignature(null, null),
                updatedAt: new Date().toISOString() });
        };
    },
    write(store, operation, input) {
        const tracked = DataSafety.stores.includes(store);
        const data = operation === 'delete' ? null : (tracked ? DataSafety.record(store, input) : input);
        if (tracked && data) data.updatedAt = new Date().toISOString();
        const id = operation === 'delete' ? input : data.id;
        return this.transaction(tracked ? [store, 'pendingSync', 'syncMeta'] : [store], 'readwrite', (tx, done) => {
            tx.objectStore(store)[operation](operation === 'delete' ? id : data);
            if (tracked) this.queue(tx, store, id, operation === 'delete' ? 'delete' : 'put', data);
            done(id);
        }).then(result => {
            if (data && tracked) Object.assign(input, data);
            if (tracked && typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleSync();
            return result;
        });
    },
    add(store, data) { return this.write(store, 'add', data); },
    put(store, data) { return this.write(store, 'put', data); },
    delete(store, id) { return this.write(store, 'delete', id); },
    async writeMany(operations) {
        const prepared = operations.map(op => ({ ...op, data: { ...DataSafety.record(op.store, op.data), updatedAt: new Date().toISOString() } }));
        await this.transaction([...new Set([...prepared.map(op => op.store), 'pendingSync', 'syncMeta'])], 'readwrite', tx => {
            for (const op of prepared) {
                tx.objectStore(op.store)[op.operation](op.data);
                this.queue(tx, op.store, op.data.id, 'put', op.data);
            }
        });
        if (typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleSync();
        return prepared.map(op => op.data);
    },
    async deleteProfile(profileId) {
        const stores = ['profiles', 'transactions', 'categories', 'investments', 'notes'];
        await this.transaction([...stores, 'pendingSync', 'syncMeta'], 'readwrite', tx => {
            tx.objectStore('profiles').delete(profileId);
            this.queue(tx, 'profiles', profileId, 'delete');
            for (const store of stores.slice(1)) {
                const req = tx.objectStore(store).index('profileId').getAll(profileId);
                req.onsuccess = () => {
                    for (const item of req.result) {
                        tx.objectStore(store).delete(item.id);
                        this.queue(tx, store, item.id, 'delete');
                    }
                };
            }
        });
        if (typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleSync();
    },
    clear(store) {
        if (DataSafety.stores.includes(store)) throw new Error('Toplu silme için atomik geri yükleme kullanılmalı.');
        return this.transaction([store], 'readwrite', tx => tx.objectStore(store).clear());
    },
    async replaceAll(raw, { remote = false } = {}) {
        const data = DataSafety.backup(raw); // Validate everything before opening a write transaction.
        const stores = [...DataSafety.stores, 'pendingSync', 'syncMeta', 'settings'];
        await this.transaction(stores, 'readwrite', tx => {
            if (remote) { tx.objectStore('pendingSync').clear(); tx.objectStore('syncMeta').clear(); }
            for (const store of DataSafety.stores) {
                const target = tx.objectStore(store);
                const old = target.getAll();
                old.onsuccess = () => {
                    const ids = new Set(data[store].map(item => item.id));
                    if (!remote) for (const item of old.result) if (!ids.has(item.id)) this.queue(tx, store, item.id, 'delete');
                    target.clear();
                    for (const item of data[store]) {
                        const saved = { ...item };
                        if (!remote) saved.updatedAt = new Date().toISOString();
                        target.put(saved);
                        if (remote) tx.objectStore('syncMeta').put({ id: `${store}:${item.id}`, signature: DataSafety.remoteSignature(item, null) });
                        else this.queue(tx, store, item.id, 'put', saved);
                    }
                };
            }
            if (data.settings) {
                // Only app settings; sync state is never imported from a backup.
                for (const item of data.settings) tx.objectStore('settings').put(item);
            }
        });
    },
    applyRemote(store, recordId, record, deletion) {
        if (!DataSafety.stores.includes(store) || !DataSafety.id(recordId)) return Promise.resolve(false);
        const clean = record ? DataSafety.record(store, { ...record, id: recordId }) : null;
        return this.transaction([store, 'pendingSync', 'syncMeta'], 'readwrite', (tx, done) => {
            const key = `${store}:${recordId}`;
            const pending = tx.objectStore('pendingSync').get(key);
            pending.onsuccess = () => {
                if (pending.result) { done(false); return; }
                if (deletion) tx.objectStore(store).delete(recordId);
                else if (clean) tx.objectStore(store).put(clean);
                else { done(false); return; } // Absence is never evidence of deletion.
                tx.objectStore('syncMeta').put({ id: key, signature: DataSafety.remoteSignature(record, deletion) });
                done(true);
            };
        });
    },
    acknowledge(entry, record, deletion) {
        const clean = record ? DataSafety.record(entry.store, { ...record, id: entry.recordId }) : null;
        return this.transaction([entry.store, 'pendingSync', 'syncMeta'], 'readwrite', tx => {
            const queue = tx.objectStore('pendingSync');
            const req = queue.get(entry.id);
            req.onsuccess = () => {
                const signature = DataSafety.remoteSignature(record, deletion);
                tx.objectStore('syncMeta').put({ id: entry.id, signature });
                if (req.result?.token === entry.token) {
                    queue.delete(entry.id);
                    if (clean) tx.objectStore(entry.store).put(clean);
                    else tx.objectStore(entry.store).delete(entry.recordId);
                } else if (req.result) {
                    // A local edit made during upload must remain queued against our acknowledged revision.
                    queue.put({ ...req.result, base: signature });
                }
            };
        });
    },
    markConflict(entry, remote) {
        return this.transaction(['pendingSync'], 'readwrite', tx => {
            const queue = tx.objectStore('pendingSync');
            const req = queue.get(entry.id);
            req.onsuccess = () => { if (req.result?.token === entry.token) queue.put({ ...req.result, conflict: remote }); };
        });
    }
};

const BackupService = {
    async exportAll() {
        const data = await DBManager.snapshot([...DataSafety.stores, 'settings']);
        data.settings = data.settings.filter(s => !s.key.startsWith('sync:') && s.key !== 'recoveryBackup' && !s.key.startsWith('conflictBackup:'));
        return { version: '2.0', exportDate: new Date().toISOString(), ...data };
    },
    async restore(raw) {
        const data = DataSafety.backup(raw);
        const restore = async () => {
            // A recoverable snapshot and the replacement are separate; replacement itself is atomic.
            const previous = await BackupService.exportAll();
            await DBManager.put('settings', { key: 'recoveryBackup', value: previous });
            await DBManager.replaceAll(data);
            if (typeof TransactionManager !== 'undefined') { TransactionManager.undoStack = []; TransactionManager.redoStack = []; }
        };
        if (typeof FirebaseSync !== 'undefined') await FirebaseSync.exclusiveLocal(restore);
        else await restore();
    }
};
