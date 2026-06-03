// Offline sync store - manages connectivity state, offline queue, and background sync
interface QueuedLoad {
	id: string;
	jobSiteId: string;
	timestamp: number;
	ticket_number: string | null;
	tons: number;
	notes: string | null;
	lane_number: number | null;
	pass_number: number | null;
}

function createOfflineStore() {
	let isOnline = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
	let pendingCount = $state(0);
	let lastSyncedAt = $state<Date | null>(null);
	let isSyncing = $state(false);

	function countPendingLoads(): number {
		if (typeof localStorage === 'undefined') return 0;
		let count = 0;
		try {
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key?.startsWith('offline_queue_')) {
					const data = localStorage.getItem(key);
					if (data) {
						const queue = JSON.parse(data);
						count += Array.isArray(queue) ? queue.length : 0;
					}
				}
			}
		} catch {
			// ignore
		}
		return count;
	}

	async function flushAllQueues() {
		if (typeof localStorage === 'undefined') return;
		const queueKeys: string[] = [];
		try {
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key?.startsWith('offline_queue_')) {
					queueKeys.push(key);
				}
			}
		} catch {
			return;
		}
		for (const key of queueKeys) {
			const jobSiteId = key.replace('offline_queue_', '');
			await flushQueue(jobSiteId);
		}
	}

	// Initialize browser event listeners — call from a +layout.svelte onMount
	function init() {
		if (typeof window === 'undefined') return;

		isOnline = navigator.onLine;
		pendingCount = countPendingLoads();

		const handleOnline = () => {
			isOnline = true;
			flushAllQueues();
		};

		const handleOffline = () => {
			isOnline = false;
		};

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		// Register Background Sync if available
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.ready.then((registration: ServiceWorkerRegistration) => {
				if ('sync' in registration) {
					(registration as any).sync.register('sync-loads').catch(() => {
						// Fallback handled by online event listener
					});
				}
			});
		}

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}

	function queueLoad(jobSiteId: string, loadData: Omit<QueuedLoad, 'id' | 'jobSiteId'>) {
		if (typeof localStorage === 'undefined') return;

		const queueKey = `offline_queue_${jobSiteId}`;
		const load: QueuedLoad = {
			id: crypto.randomUUID(),
			jobSiteId,
			...loadData
		};

		try {
			const existing = localStorage.getItem(queueKey);
			const queue: QueuedLoad[] = existing ? JSON.parse(existing) : [];
			queue.push(load);
			localStorage.setItem(queueKey, JSON.stringify(queue));
			pendingCount = countPendingLoads();
		} catch {
			// ignore quota errors
		}
	}

	async function flushQueue(jobSiteId: string): Promise<boolean> {
		if (typeof localStorage === 'undefined') return false;

		const queueKey = `offline_queue_${jobSiteId}`;
		const data = localStorage.getItem(queueKey);
		if (!data) return true;

		try {
			const queue: QueuedLoad[] = JSON.parse(data);
			if (queue.length === 0) {
				localStorage.removeItem(queueKey);
				pendingCount = countPendingLoads();
				return true;
			}

			isSyncing = true;

			// Send all loads in sequence (append-only, conflict-safe)
			for (const load of queue) {
				const res = await fetch(`/api/job-sites/${jobSiteId}/loads`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						ticket_number: load.ticket_number,
						tons: load.tons,
						timestamp: load.timestamp,
						notes: load.notes,
						lane_number: load.lane_number,
						pass_number: load.pass_number
					}),
					credentials: 'include'
				});

				if (!res.ok) {
					isSyncing = false;
					return false;
				}
			}

			// Clear queue on success
			localStorage.removeItem(queueKey);
			lastSyncedAt = new Date();
			pendingCount = countPendingLoads();
			isSyncing = false;
			return true;
		} catch {
			isSyncing = false;
			return false;
		}
	}

	function updateLastSyncedAt() {
		lastSyncedAt = new Date();
	}

	return {
		get isOnline() { return isOnline; },
		get pendingCount() { return pendingCount; },
		get lastSyncedAt() { return lastSyncedAt; },
		get isSyncing() { return isSyncing; },
		init,
		queueLoad,
		flushQueue,
		updateLastSyncedAt
	};
}

export const offlineStore = createOfflineStore();
