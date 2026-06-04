<script lang="ts">
	import HelpTip from './HelpTip.svelte';
	import { TruckIcon, Plus } from 'lucide-svelte';
	import type { DbLoad } from '$lib/server/db';
	import { fromMetricTonnes } from '$lib/utils/unitConvert';
	import TicketCapture from './TicketCapture.svelte';
	import { offlineStore } from '$lib/stores/offline.svelte';
	import { confirmStore } from '$lib/stores/confirm.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import LoadList from './loads/LoadList.svelte';
	import TicketScan from './loads/TicketScan.svelte';
	import LoadSummary from './loads/LoadSummary.svelte';

	interface Props {
		jobSiteId: string;
		isAuthenticated?: boolean;
		numLanes?: number | null;
		targetTonnage?: number | null;
	}

	let { jobSiteId, isAuthenticated = false, numLanes = null, targetTonnage = null }: Props = $props();

	interface LoadsResponse {
		loads: DbLoad[];
	}
	interface LoadResponse {
		load: DbLoad;
	}

	let loads = $state<DbLoad[]>([]);
	let showNewLoadForm = $state(false);
	let saving = $state(false);
	let loading = $state(true);

	const STORAGE_KEY = `loads_${jobSiteId}`;

	// Load data
	$effect(() => {
		loadData();
	});

	async function loadData() {
		loading = true;
		if (isAuthenticated) {
			try {
				const today = new Date().toISOString().split('T')[0];
				const res = await fetch(`/api/job-sites/${jobSiteId}/loads?start_date=${today}`, {
					credentials: 'include'
				});
				if (res.ok) {
					const data = (await res.json()) as LoadsResponse;
					loads = data.loads;
				}
			} catch {
				// Fall back to localStorage
				loadFromLocalStorage();
			}
		} else {
			loadFromLocalStorage();
		}
		loading = false;
	}

	function loadFromLocalStorage() {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				loads = JSON.parse(stored);
			} catch {
				loads = [];
			}
		}
	}

	function saveToLocalStorage() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(loads));
	}

	async function handleSaveLoad(ticketNumber: string, tonsInput: number, notes: string, laneNumber: number | null, passNumber: number | null) {
		if (!tonsInput || tonsInput <= 0) return;

		saving = true;
		const timestamp = Math.floor(Date.now() / 1000);
		const tons = unitsStore.system === 'metric' ? fromMetricTonnes(tonsInput) : tonsInput;

		const newLoad: Partial<DbLoad> = {
			ticket_number: ticketNumber || null,
			tons,
			timestamp,
			notes: notes || null,
			lane_number: laneNumber || null,
			pass_number: passNumber || null
		};

		if (isAuthenticated) {
			// Check if offline
			if (!offlineStore.isOnline) {
				// Queue the load for later sync
				offlineStore.queueLoad(jobSiteId, {
					ticket_number: newLoad.ticket_number || null,
					tons: newLoad.tons!,
					timestamp: newLoad.timestamp!,
					notes: newLoad.notes || null,
					lane_number: newLoad.lane_number || null,
					pass_number: newLoad.pass_number || null
				});

				// Add optimistically to local state
				const load: DbLoad = {
					id: crypto.randomUUID(),
					job_site_id: jobSiteId,
					user_id: 'local',
					...(newLoad as Required<Omit<typeof newLoad, 'id' | 'job_site_id' | 'user_id'>>),
					spread_rate: null,
					lane_number: newLoad.lane_number || null,
					pass_number: newLoad.pass_number || null,
					created_at: timestamp,
					rejected: 0,
					rejection_reason: null,
					rejection_notes: null,
					ticket_photo_id: null
				};
				loads = [load, ...loads];
				saveToLocalStorage();
			} else {
				try {
					const res = await fetch(`/api/job-sites/${jobSiteId}/loads`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(newLoad),
						credentials: 'include'
					});
					if (res.ok) {
						const data = (await res.json()) as LoadResponse;
						loads = [data.load, ...loads];
						offlineStore.updateLastSyncedAt();
						toastStore.success('Load added successfully');
					} else {
						toastStore.error('Failed to add load');
					}
				} catch {
					// Fall back to offline queue
					offlineStore.queueLoad(jobSiteId, {
						ticket_number: newLoad.ticket_number || null,
						tons: newLoad.tons!,
						timestamp: newLoad.timestamp!,
						notes: newLoad.notes || null,
						lane_number: newLoad.lane_number || null,
						pass_number: newLoad.pass_number || null
					});

					const load: DbLoad = {
						id: crypto.randomUUID(),
						job_site_id: jobSiteId,
						user_id: 'local',
						...(newLoad as Required<Omit<typeof newLoad, 'id' | 'job_site_id' | 'user_id'>>),
						spread_rate: null,
						lane_number: newLoad.lane_number || null,
						pass_number: newLoad.pass_number || null,
						created_at: timestamp,
						rejected: 0,
						rejection_reason: null,
						rejection_notes: null,
						ticket_photo_id: null
					};
					loads = [load, ...loads];
					saveToLocalStorage();
				}
			}
		} else {
			const load: DbLoad = {
				id: crypto.randomUUID(),
				job_site_id: jobSiteId,
				user_id: 'local',
				ticket_number: newLoad.ticket_number || null,
				tons: newLoad.tons!,
				timestamp: newLoad.timestamp!,
				spread_rate: null,
				notes: newLoad.notes || null,
				lane_number: newLoad.lane_number || null,
				pass_number: newLoad.pass_number || null,
				created_at: timestamp,
				rejected: 0,
				rejection_reason: null,
				rejection_notes: null,
				ticket_photo_id: null
			};
			loads = [load, ...loads];
			saveToLocalStorage();
		}

		showNewLoadForm = false;
		saving = false;
	}

	async function clearAll() {
		const confirmed = await confirmStore.ask({
			title: 'Clear All Loads',
			message: 'Clear all loads for today? This cannot be undone.',
			confirmLabel: 'Clear All',
			destructive: true
		});
		if (confirmed) {
			loads = [];
			if (!isAuthenticated) {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	}

	async function handleRejectLoad(loadId: string, reason: string, notes: string) {
		if (!reason) return;
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/loads/${loadId}/reject`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason, notes: notes || null }),
				credentials: 'include'
			});
			if (res.ok) {
				const data = (await res.json()) as LoadResponse;
				loads = loads.map(l => l.id === loadId ? data.load : l);
				toastStore.success('Load rejected');
			} else {
				toastStore.error('Failed to reject load');
			}
		} catch {
			// For unauthenticated: update locally
			loads = loads.map(l => l.id === loadId ? { ...l, rejected: 1, rejection_reason: reason, rejection_notes: notes || null } : l);
			toastStore.success('Load rejected');
		}
	}

	async function handleUnrejectLoad(loadId: string) {
		if (!isAuthenticated) {
			loads = loads.map(l => l.id === loadId ? { ...l, rejected: 0, rejection_reason: null, rejection_notes: null } : l);
			return;
		}
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/loads/${loadId}/reject`, {
				method: 'DELETE',
				credentials: 'include'
			});
			if (res.ok) {
				const data = (await res.json()) as LoadResponse;
				loads = loads.map(l => l.id === loadId ? data.load : l);
				toastStore.success('Load unreject succeeded');
			} else {
				toastStore.error('Failed to unreject load');
			}
		} catch {
			loads = loads.map(l => l.id === loadId ? { ...l, rejected: 0, rejection_reason: null, rejection_notes: null } : l);
			toastStore.error('Failed to unreject load');
		}
	}

</script>

<div class="load-tracker">
	<div class="tracker-header">
		<div class="header-title">
			<TruckIcon size={24} />
			<h3>Load Tracker</h3>
			<HelpTip text="Tracks how many truck loads have arrived. Each load's tonnage contributes to your running spread rate calculation." />
		</div>
		{#if !showNewLoadForm && isAuthenticated}
			<div class="header-actions">
				<TicketCapture
					{jobSiteId}
					onLogged={(load) => {
						loads = [load, ...loads];
					}}
					{numLanes}
					compact
				/>
				<button class="btn-new-load" onclick={() => { showNewLoadForm = true; }}>
					<Plus size={20} />
					New Load
				</button>
			</div>
		{:else if !showNewLoadForm}
			<button class="btn-new-load" onclick={() => { showNewLoadForm = true; }}>
				<Plus size={20} />
				New Load
			</button>
		{/if}
	</div>

	{#if showNewLoadForm}
		<TicketScan
			{jobSiteId}
			{numLanes}
			{loads}
			onSave={handleSaveLoad}
			onCancel={() => { showNewLoadForm = false; }}
		/>
	{/if}

	{#if loading}
		<div class="loading">Loading...</div>
	{:else if loads.length > 0}
		<LoadSummary
			{loads}
			{targetTonnage}
			{numLanes}
			{jobSiteId}
			{isAuthenticated}
		/>

		<LoadList
			{loads}
			{jobSiteId}
			{isAuthenticated}
			onReject={handleRejectLoad}
			onUnreject={handleUnrejectLoad}
			onClearAll={clearAll}
		/>
	{:else}
		<div class="empty-state">
			<TruckIcon size={48} strokeWidth={1.5} />
			<p>No loads logged yet today</p>
			<button class="btn-new-load-cta" onclick={() => { showNewLoadForm = true; }}>
				<Plus size={20} />
				Log First Load
			</button>
		</div>
	{/if}
</div>

<style>
	.load-tracker {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		margin-bottom: var(--sp-4);
	}

	.tracker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-4);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.header-title h3 {
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.btn-new-load,
	.btn-new-load-cta {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 56px;
		padding: var(--sp-3) var(--sp-5);
		background: var(--accent);
		color: var(--text);
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-new-load-cta {
		width: 100%;
		justify-content: center;
	}

	.btn-new-load:hover,
	.btn-new-load-cta:hover {
		background: color-mix(in srgb, var(--accent) 90%, white);
	}

	.btn-new-load:active,
	.btn-new-load-cta:active {
		transform: scale(0.98);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-6) var(--sp-4);
		text-align: center;
		color: var(--text-muted);
	}

	.empty-state p {
		margin: 0;
		font-size: var(--fs-md);
	}

	.loading {
		padding: var(--sp-4);
		text-align: center;
		color: var(--text-muted);
	}
</style>
