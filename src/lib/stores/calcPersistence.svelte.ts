// calcPersistence.svelte.ts
// Saves every calc result to IndexedDB for offline-first persistence.
// Batch-syncs unsynced records to /api/calculations when online.
// Syncs within 30s of coming online; also polls every 30s while online.

const DB_NAME = 'paverate-calc-history';
const DB_VERSION = 1;
const STORE_NAME = 'calculations';
const SYNC_INTERVAL_MS = 30_000;
const MAX_LOCAL_ENTRIES = 200;

export interface PersistedCalc {
	id: string;
	timestamp: number;
	tool_id: string;
	tool_label: string;
	// camelCase aliases kept for CalcHistoryLog backward-compat
	toolId: string;
	toolLabel: string;
	// Human-readable summary fields (for CalcHistoryLog display)
	result: string;
	summary: string;
	// Structured data for D1 sync
	inputs: Record<string, unknown>;
	outputs: Record<string, unknown>;
	// Sync state
	synced: boolean;
	job_site_id: string | null;
}

// ── IndexedDB helpers ────────────────────────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
	if (_dbPromise) return _dbPromise;
	_dbPromise = new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB not available'));
			return;
		}
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (ev) => {
			const db = (ev.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
				store.createIndex('by_timestamp', 'timestamp', { unique: false });
				store.createIndex('by_synced', 'synced', { unique: false });
			}
		};
		req.onsuccess = (ev) => resolve((ev.target as IDBOpenDBRequest).result);
		req.onerror = () => reject(req.error);
	});
	return _dbPromise;
}

async function idbPut(entry: PersistedCalc): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).put(entry);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function idbGetAll(): Promise<PersistedCalc[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('by_timestamp');
		const req = index.openCursor(null, 'prev'); // newest first
		const results: PersistedCalc[] = [];
		req.onsuccess = (ev) => {
			const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
			if (cursor) {
				results.push(cursor.value as PersistedCalc);
				cursor.continue();
			} else {
				resolve(results);
			}
		};
		req.onerror = () => reject(req.error);
	});
}

async function idbGetUnsynced(): Promise<PersistedCalc[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('by_synced');
		const req = index.getAll(IDBKeyRange.only(0)); // false stored as 0
		req.onsuccess = () => resolve(req.result as PersistedCalc[]);
		req.onerror = () => reject(req.error);
	});
}

async function idbMarkSynced(id: string): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const getReq = store.get(id);
		getReq.onsuccess = () => {
			const entry = getReq.result as PersistedCalc | undefined;
			if (entry) {
				entry.synced = true;
				store.put(entry);
			}
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		};
		getReq.onerror = () => reject(getReq.error);
	});
}

async function idbCount(): Promise<number> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const req = tx.objectStore(STORE_NAME).count();
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function idbDeleteOldest(keepCount: number): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('by_timestamp');
		const req = index.openCursor(null, 'next'); // oldest first
		let deleted = 0;
		req.onsuccess = async (ev) => {
			const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
			if (cursor && deleted < keepCount) {
				cursor.delete();
				deleted++;
				cursor.continue();
			} else {
				resolve();
			}
		};
		req.onerror = () => reject(req.error);
	});
}

async function idbClear(): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).clear();
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

// ── Sync to D1 ───────────────────────────────────────────────────────────────

async function syncToServer(): Promise<void> {
	if (typeof navigator === 'undefined' || !navigator.onLine) return;

	let unsynced: PersistedCalc[];
	try {
		unsynced = await idbGetUnsynced();
	} catch {
		return;
	}

	if (unsynced.length === 0) return;

	// Only sync entries that have a job_site_id (required by the API)
	const syncable = unsynced.filter((e) => e.job_site_id != null);

	for (const entry of syncable) {
		try {
			const validCalcTypes: Record<string, string> = {
				'spread-rate': 'spread_rate',
				tonnage: 'tonnage',
				'feet-left': 'feet_left',
				tack: 'tack_rate',
				'stick-check': 'stick_check'
			};
			const calc_type = validCalcTypes[entry.tool_id];
			if (!calc_type) continue;

			const res = await fetch('/api/calculations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					job_site_id: entry.job_site_id,
					calc_type,
					inputs: { ...entry.inputs, _display_summary: entry.summary },
					result: { ...entry.outputs, _display_result: entry.result },
					notes: null
				})
			});

			if (res.ok) {
				await idbMarkSynced(entry.id);
			}
			// On 4xx (bad job_site_id, not found, etc.) mark synced anyway to
			// avoid retrying indefinitely for stale job contexts.
			if (res.status >= 400 && res.status < 500) {
				await idbMarkSynced(entry.id);
			}
		} catch {
			// Network error — leave unsynced, retry next interval
		}
	}
}

// ── Persistence store (Svelte 5 runes class) ─────────────────────────────────

class CalcPersistenceStore {
	#entries = $state<PersistedCalc[]>([]);
	#syncTimer: ReturnType<typeof setInterval> | null = null;
	#initialized = false;

	get entries(): PersistedCalc[] {
		return this.#entries;
	}

	get isSyncing(): boolean {
		return false; // future: expose sync state if needed
	}

	get pendingSync(): number {
		return this.#entries.filter((e) => !e.synced).length;
	}

	async init(): Promise<void> {
		if (this.#initialized || typeof window === 'undefined') return;
		this.#initialized = true;

		// Load initial entries from IndexedDB
		try {
			const loaded = await idbGetAll();
			this.#entries = loaded;
		} catch {
			this.#entries = [];
		}

		// Sync on online event
		const handleOnline = () => {
			syncToServer().then(() => this.#reload());
		};
		window.addEventListener('online', handleOnline);

		// Poll sync every 30s while online
		this.#syncTimer = setInterval(async () => {
			if (navigator.onLine) {
				await syncToServer();
				await this.#reload();
			}
		}, SYNC_INTERVAL_MS);

		// Initial sync if online
		if (navigator.onLine) {
			await syncToServer();
		}
	}

	async add(
		entry: Omit<PersistedCalc, 'id' | 'timestamp' | 'synced'>
	): Promise<void> {
		const newEntry: PersistedCalc = {
			...entry,
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			timestamp: Date.now(),
			synced: false
		};

		// Prepend locally for instant reactivity
		this.#entries = [newEntry, ...this.#entries];

		try {
			await idbPut(newEntry);

			// Trim if over cap
			const count = await idbCount();
			if (count > MAX_LOCAL_ENTRIES) {
				await idbDeleteOldest(count - MAX_LOCAL_ENTRIES);
			}
		} catch {
			// IndexedDB unavailable — at least the in-memory entry is there
		}

		// Best-effort immediate sync
		if (typeof navigator !== 'undefined' && navigator.onLine) {
			syncToServer().then(() => this.#reload()).catch(() => {});
		}
	}

	async clear(): Promise<void> {
		this.#entries = [];
		try {
			await idbClear();
		} catch {
			// ignore
		}
	}

	async #reload(): Promise<void> {
		try {
			this.#entries = await idbGetAll();
		} catch {
			// keep existing
		}
	}
}

export const calcPersistence = new CalcPersistenceStore();
