<script lang="ts">
	import NumberField from './NumberField.svelte';
	import { TruckIcon, Plus, X } from 'lucide-svelte';
	import type { DbLoad } from '$lib/server/db';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { UNIT_LABELS, toMetricTonnes, fromMetricTonnes } from '$lib/utils/unitConvert';
	import SpreadRateHistogram from './charts/SpreadRateHistogram.svelte';
	import YieldEfficiencyGauge from './YieldEfficiencyGauge.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { spreadToleranceFor } from '$lib/config';
	import TicketCapture from './TicketCapture.svelte';
	import MaterialOrderForecast from './MaterialOrderForecast.svelte';
	import { offlineStore } from '$lib/stores/offline.svelte';
	import { formatTime } from '$lib/utils/format';

	interface Props {
		jobSiteId: string;
		isAuthenticated?: boolean;
		numLanes?: number | null;
		targetTonnage?: number | null;
	}

	let { jobSiteId, isAuthenticated = false, numLanes = null, targetTonnage = null }: Props = $props();

	let loads = $state<DbLoad[]>([]);
	let showNewLoadForm = $state(false);
	let saving = $state(false);
	let loading = $state(true);

	// Form state
	let ticketNumberInput = $state('');
	let tonsInput = $state<number | null>(null);
	let notesInput = $state('');
	let laneNumberInput = $state<number | null>(null);
	let passNumberInput = $state<number | null>(null);

	// Rejection state
	let rejectingLoadId = $state<string | null>(null);
	let rejectionReason = $state<string>('');
	let rejectionNotesInput = $state('');
	let rejecting = $state(false);

	const REJECTION_REASON_LABELS: Record<string, string> = {
		temp_too_low: 'Temp Too Low',
		temp_too_high: 'Temp Too High',
		wrong_mix: 'Wrong Mix',
		contaminated: 'Contaminated',
		overloaded: 'Overloaded',
		underweight: 'Underweight',
		damaged_in_transit: 'Damaged in Transit',
		other: 'Other'
	};

	const REJECTION_REASONS = Object.keys(REJECTION_REASON_LABELS);

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
					const data = await res.json();
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

	async function handleSaveLoad() {
		if (!tonsInput || tonsInput <= 0) return;

		saving = true;
		const timestamp = Math.floor(Date.now() / 1000);
		const tons = unitsStore.system === 'metric' ? fromMetricTonnes(tonsInput) : tonsInput;

		const newLoad: Partial<DbLoad> = {
			ticket_number: ticketNumberInput || null,
			tons,
			timestamp,
			notes: notesInput || null,
			lane_number: laneNumberInput || null,
			pass_number: passNumberInput || null
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
					...newLoad as Required<typeof newLoad>,
					spread_rate: null,
					lane_number: newLoad.lane_number || null,
					pass_number: newLoad.pass_number || null,
					created_at: timestamp,
					rejected: 0,
					rejection_reason: null,
					rejection_notes: null
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
						const data = await res.json();
						loads = [data.load, ...loads];
						offlineStore.updateLastSyncedAt();
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
						...newLoad as Required<typeof newLoad>,
						spread_rate: null,
						lane_number: newLoad.lane_number || null,
						pass_number: newLoad.pass_number || null,
						created_at: timestamp,
						rejected: 0,
						rejection_reason: null,
						rejection_notes: null
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
				rejection_notes: null
			};
			loads = [load, ...loads];
			saveToLocalStorage();
		}

		// Reset form
		ticketNumberInput = '';
		tonsInput = null;
		notesInput = '';
		laneNumberInput = null;
		passNumberInput = null;
		showNewLoadForm = false;
		saving = false;
	}

	function clearAll() {
		if (confirm('Clear all loads for today? This cannot be undone.')) {
			loads = [];
			if (!isAuthenticated) {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	}

	async function handleRejectLoad(loadId: string) {
		if (!rejectionReason) return;
		rejecting = true;
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/loads/${loadId}/reject`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason: rejectionReason, notes: rejectionNotesInput || null }),
				credentials: 'include'
			});
			if (res.ok) {
				const data = await res.json();
				loads = loads.map(l => l.id === loadId ? data.load : l);
			}
		} catch {
			// For unauthenticated: update locally
			loads = loads.map(l => l.id === loadId ? { ...l, rejected: 1, rejection_reason: rejectionReason, rejection_notes: rejectionNotesInput || null } : l);
		}
		rejectingLoadId = null;
		rejectionReason = '';
		rejectionNotesInput = '';
		rejecting = false;
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
				const data = await res.json();
				loads = loads.map(l => l.id === loadId ? data.load : l);
			}
		} catch {
			loads = loads.map(l => l.id === loadId ? { ...l, rejected: 0, rejection_reason: null, rejection_notes: null } : l);
		}
	}

	const totalTons = $derived(loads.filter(l => !l.rejected).reduce((sum, load) => sum + load.tons, 0));
	const loadCount = $derived(loads.filter(l => !l.rejected).length);
	const rejectedCount = $derived(loads.filter(l => l.rejected).length);
	const acceptedTons = $derived(loads.filter(l => !l.rejected).reduce((sum, l) => sum + l.tons, 0));
	const avgTonsPerLoad = $derived(loadCount > 0 ? totalTons / loadCount : 0);

	const tonsPerHour = $derived.by(() => {
		if (loads.length < 2) return 0;
		const sorted = [...loads].sort((a, b) => a.timestamp - b.timestamp);
		const firstTs = sorted[0].timestamp;
		const lastTs = sorted[sorted.length - 1].timestamp;
		const hoursDiff = (lastTs - firstTs) / 3600;
		return hoursDiff > 0 ? totalTons / hoursDiff : 0;
	});

	const displayTotalTons = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(totalTons) : totalTons
	);
	const displayAvgTons = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(avgTonsPerLoad) : avgTonsPerLoad
	);
	const displayTonsPerHour = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(tonsPerHour) : tonsPerHour
	);

	const completionPct = $derived(
		targetTonnage && targetTonnage > 0 && totalTons > 0
			? Math.min(100, (totalTons / targetTonnage) * 100)
			: null
	);
	const remainingTons = $derived(
		targetTonnage && targetTonnage > 0
			? Math.max(0, targetTonnage - totalTons)
			: null
	);
	const displayTargetTonnage = $derived(
		targetTonnage
			? (unitsStore.system === 'metric' ? toMetricTonnes(targetTonnage) : targetTonnage)
			: null
	);
	const displayRemainingTons = $derived(
		remainingTons != null
			? (unitsStore.system === 'metric' ? toMetricTonnes(remainingTons) : remainingTons)
			: null
	);

	function formatLoadTons(tons: number): number {
		return unitsStore.system === 'metric' ? toMetricTonnes(tons) : tons;
	}

	const tolerance = $derived(spreadToleranceFor(job.courseType));
	const targetRate = $derived(
		job.thicknessIn > 0 ? job.thicknessIn * 110 : null
	);

	const acceptedLoadsWithSpreadRate = $derived(
		loads.filter(l => !l.rejected && l.spread_rate != null && l.spread_rate > 0)
	);

	const avgSpreadRate = $derived.by(() => {
		if (acceptedLoadsWithSpreadRate.length === 0) return null;
		const sum = acceptedLoadsWithSpreadRate.reduce((acc, l) => acc + (l.spread_rate ?? 0), 0);
		return sum / acceptedLoadsWithSpreadRate.length;
	});

	const yieldEfficiency = $derived.by(() => {
		if (targetRate == null || avgSpreadRate == null) return null;
		return (avgSpreadRate / targetRate) * 100;
	});
</script>

<div class="load-tracker">
	<div class="tracker-header">
		<div class="header-title">
			<TruckIcon size={24} />
			<h3>Load Tracker</h3>
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
		<div class="new-load-form">
			<div class="form-header">
				<h4>Log New Load</h4>
				<button
					class="btn-close"
					onclick={() => {
						showNewLoadForm = false;
						ticketNumberInput = '';
						tonsInput = null;
						notesInput = '';
					}}
					aria-label="Close"
				>
					<X size={20} />
				</button>
			</div>

			<div class="form-fields">
				<div class="field">
					<label for="ticket-number">Ticket # (optional)</label>
					<input
						id="ticket-number"
						type="text"
						bind:value={ticketNumberInput}
						placeholder="e.g., 12345"
					/>
				</div>

				{#if (numLanes && numLanes > 1) || loads.some(l => l.lane_number)}
					<div class="field">
						<label for="lane-number">Lane</label>
						<div class="lane-btns">
							{#each Array.from({length: numLanes || 4}, (_, i) => i + 1) as lane}
								<button
									type="button"
									class="lane-btn"
									class:active={laneNumberInput === lane}
									onclick={() => { laneNumberInput = laneNumberInput === lane ? null : lane; }}
								>
									{lane}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="field">
					<label for="pass-number">Pass</label>
					<div class="lane-btns">
						{#each [1, 2, 3, 4] as pass}
							<button
								type="button"
								class="lane-btn"
								class:active={passNumberInput === pass}
								onclick={() => { passNumberInput = passNumberInput === pass ? null : pass; }}
							>
								{pass === 1 ? '1st' : pass === 2 ? '2nd' : pass === 3 ? '3rd' : `${pass}th`}
							</button>
						{/each}
					</div>
				</div>

				<NumberField
					label="Tons"
					unit={UNIT_LABELS.tons[unitsStore.system]}
					bind:value={tonsInput}
					hint="Weight from ticket"
				/>

				<div class="field">
					<label for="notes">Notes (optional)</label>
					<input
						id="notes"
						type="text"
						bind:value={notesInput}
						placeholder="e.g., Hot mix, on time"
					/>
				</div>
			</div>

			<div class="form-actions">
				<button
					class="btn-save"
					onclick={handleSaveLoad}
					disabled={!tonsInput || tonsInput <= 0 || saving}
				>
					{saving ? 'Saving...' : 'Save Load'}
				</button>
			</div>
		</div>
	{/if}

	{#if loading}
		<div class="loading">Loading...</div>
	{:else if loads.length > 0}
		<div class="tally-card">
			<div class="tally-grid">
				<div class="tally-item">
					<div class="tally-label">Total Tons</div>
					<div class="tally-value">{displayTotalTons.toFixed(1)}</div>
					<div class="tally-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
				</div>

				<div class="tally-item">
					<div class="tally-label">Load Count</div>
					<div class="tally-value">{loadCount}</div>
					<div class="tally-unit">loads</div>
				</div>

				<div class="tally-item">
					<div class="tally-label">Avg/Load</div>
					<div class="tally-value">{displayAvgTons.toFixed(1)}</div>
					<div class="tally-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
				</div>

				{#if tonsPerHour > 0}
					<div class="tally-item">
						<div class="tally-label">Tons/Hour</div>
						<div class="tally-value">{displayTonsPerHour.toFixed(1)}</div>
						<div class="tally-unit">{UNIT_LABELS.tons[unitsStore.system]}/hr</div>
					</div>
				{/if}

				{#if rejectedCount > 0}
					<div class="tally-item tally-item--rejected">
						<div class="tally-label">Rejected</div>
						<div class="tally-value tally-value--rejected">{rejectedCount}</div>
						<div class="tally-unit">loads</div>
					</div>
				{/if}

				{#if avgSpreadRate != null}
					<div class="tally-item">
						<div class="tally-label">Avg Rate</div>
						<div class="tally-value">{Math.round(avgSpreadRate)}</div>
						<div class="tally-unit">lbs/SY</div>
					</div>
				{/if}
			</div>

			{#if completionPct != null}
				<div class="completion-section">
					<div class="completion-header">
						<span class="completion-label">Job Completion</span>
						<span class="completion-pct" class:completion-done={completionPct >= 100}>
							{completionPct.toFixed(1)}%
						</span>
					</div>
					<div class="completion-bar-track">
						<div
							class="completion-bar-fill"
							class:completion-bar-fill--done={completionPct >= 100}
							style="width: {Math.min(100, completionPct).toFixed(1)}%"
						></div>
					</div>
					<div class="completion-sub">
						{displayTotalTons.toFixed(1)} / {displayTargetTonnage!.toFixed(1)} {UNIT_LABELS.tons[unitsStore.system]}
						{#if displayRemainingTons != null && displayRemainingTons > 0}
							<span class="completion-remaining">&nbsp;&mdash;&nbsp;{displayRemainingTons.toFixed(1)} {UNIT_LABELS.tons[unitsStore.system]} remaining</span>
						{:else if completionPct >= 100}
							<span class="completion-remaining completion-remaining--done">&nbsp;&mdash;&nbsp;Goal reached!</span>
						{/if}
					</div>
				</div>

				{#if completionPct < 100}
					<MaterialOrderForecast
						{remainingTons}
						{avgTonsPerLoad}
						{tonsPerHour}
						{targetTonnage}
						{totalTons}
					/>
				{/if}
			{/if}

			{#if targetRate != null}
				<div class="yield-efficiency-section">
					<YieldEfficiencyGauge yieldEfficiency={yieldEfficiency} targetRate={targetRate} />
				</div>
			{/if}
		</div>

		<div class="histogram-section">
			<h4>Spread Rate Distribution</h4>
			<SpreadRateHistogram
				loads={loads}
				targetRate={targetRate}
				toleranceLbsSy={tolerance.toleranceLbsSy}
			/>
		</div>

		{@const laneBreakdown = (() => {
			const map = new Map<number, {count: number, tons: number}>();
			for (const load of loads) {
				if (load.lane_number) {
					const existing = map.get(load.lane_number) || {count: 0, tons: 0};
					map.set(load.lane_number, {count: existing.count + 1, tons: existing.tons + load.tons});
				}
			}
			return [...map.entries()].sort((a, b) => a[0] - b[0]);
		})()}

		{@const passBreakdown = (() => {
			const map = new Map<number, {count: number, tons: number}>();
			for (const load of loads) {
				if (load.pass_number) {
					const existing = map.get(load.pass_number) || {count: 0, tons: 0};
					map.set(load.pass_number, {count: existing.count + 1, tons: existing.tons + load.tons});
				}
			}
			return [...map.entries()].sort((a, b) => a[0] - b[0]);
		})()}

		{#if laneBreakdown.length > 1}
			<div class="breakdown-section">
				<h4 class="breakdown-title">By Lane</h4>
				<div class="breakdown-grid">
					{#each laneBreakdown as [lane, stats]}
						<div class="breakdown-item">
							<div class="breakdown-label">Lane {lane}</div>
							<div class="breakdown-value">{(unitsStore.system === 'metric' ? toMetricTonnes(stats.tons) : stats.tons).toFixed(1)}</div>
							<div class="breakdown-sub">{stats.count} loads</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if passBreakdown.length > 1}
			<div class="breakdown-section">
				<h4 class="breakdown-title">By Pass</h4>
				<div class="breakdown-grid">
					{#each passBreakdown as [pass, stats]}
						<div class="breakdown-item">
							<div class="breakdown-label">Pass {pass}</div>
							<div class="breakdown-value">{(unitsStore.system === 'metric' ? toMetricTonnes(stats.tons) : stats.tons).toFixed(1)}</div>
							<div class="breakdown-sub">{stats.count} loads</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="load-history">
			<div class="history-header">
				<h4>Today's Loads</h4>
				<button class="btn-clear-all" onclick={clearAll}>Clear All</button>
			</div>

			<div class="load-list">
				{#each loads as load (load.id)}
					<div class="load-item {load.rejected ? 'load-item--rejected' : ''}">
						<div class="load-main">
							<div class="load-info">
								{#if load.ticket_number}
									<span class="load-ticket">#{load.ticket_number}</span>
								{/if}
								<span class="load-tons {load.rejected ? 'load-tons--rejected' : ''}">{formatLoadTons(load.tons).toFixed(1)} {UNIT_LABELS.tons[unitsStore.system]}</span>
								{#if load.rejected}
									<span class="rejection-badge">{REJECTION_REASON_LABELS[load.rejection_reason ?? ''] ?? load.rejection_reason}</span>
								{/if}
							</div>
							<div class="load-actions">
								<span class="load-time">{formatTime(load.timestamp)}</span>
								{#if isAuthenticated}
									{#if load.rejected}
										<button class="btn-unreject" onclick={() => handleUnrejectLoad(load.id)} aria-label="Mark as accepted">
											Undo
										</button>
									{:else}
										<button class="btn-reject" onclick={() => { rejectingLoadId = load.id; rejectionReason = ''; rejectionNotesInput = ''; }} aria-label="Reject load">
											Reject
										</button>
									{/if}
								{/if}
							</div>
						</div>
						{#if load.lane_number || load.pass_number}
							<div class="load-badges">
								{#if load.lane_number}
									<span class="badge badge-lane">L{load.lane_number}</span>
								{/if}
								{#if load.pass_number}
									<span class="badge badge-pass">P{load.pass_number}</span>
								{/if}
							</div>
						{/if}
						{#if load.notes}
							<div class="load-notes">{load.notes}</div>
						{/if}
						{#if load.rejection_notes}
							<div class="load-notes load-notes--rejection">Rejection notes: {load.rejection_notes}</div>
						{/if}
						{#if rejectingLoadId === load.id}
							<div class="reject-form">
								<div class="reject-form-header">Select rejection reason:</div>
								<div class="reason-grid">
									{#each REJECTION_REASONS as reason}
										<button
											class="reason-btn {rejectionReason === reason ? 'reason-btn--selected' : ''}"
											onclick={() => { rejectionReason = reason; }}
										>
											{REJECTION_REASON_LABELS[reason]}
										</button>
									{/each}
								</div>
								<div class="field" style="margin-top: var(--sp-3);">
									<label for="rejection-notes-{load.id}">Notes (optional)</label>
									<input id="rejection-notes-{load.id}" type="text" bind:value={rejectionNotesInput} placeholder="e.g., temp was 240F, spec requires 280F+" style="min-height:48px;padding:var(--sp-3);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:var(--fs-md);" />
								</div>
								<div class="reject-form-actions">
									<button class="btn-cancel-reject" onclick={() => { rejectingLoadId = null; rejectionReason = ''; rejectionNotesInput = ''; }}>
										Cancel
									</button>
									<button class="btn-confirm-reject" onclick={() => handleRejectLoad(load.id)} disabled={!rejectionReason || rejecting}>
										{rejecting ? 'Saving...' : 'Confirm Reject'}
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
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
		gap: var(--sp-3);
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

	.new-load-form {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.form-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-4);
	}

	.form-header h4 {
		margin: 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}

	.btn-close {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		min-width: 48px;
		padding: var(--sp-3);
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: all 0.15s ease;
	}

	.btn-close:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.form-fields {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.field label {
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		color: var(--text);
	}

	.field input[type='text'],
	.field input[type='number'] {
		min-height: 48px;
		padding: var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--fs-md);
	}

	.form-actions {
		margin-top: var(--sp-4);
	}

	.btn-save {
		width: 100%;
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

	.btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-save:not(:disabled):hover {
		background: color-mix(in srgb, var(--accent) 90%, white);
	}

	.btn-save:not(:disabled):active {
		transform: scale(0.98);
	}

	.tally-card {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.tally-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--sp-4);
	}

	.tally-item {
		text-align: center;
	}

	.tally-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--sp-1);
	}

	.tally-value {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-bold);
		color: var(--accent);
		line-height: 1.2;
	}

	.tally-unit {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: var(--sp-1);
	}

	.yield-efficiency-section {
		margin-top: var(--sp-4);
		padding-top: var(--sp-4);
		border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
	}

	.histogram-section {
		margin-top: var(--sp-4);
		padding: var(--sp-4);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.histogram-section h4 {
		margin: 0 0 var(--sp-3) 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}

	.load-history {
		margin-top: var(--sp-4);
	}

	.history-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-3);
	}

	.history-header h4 {
		margin: 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}

	.btn-clear-all {
		min-height: 48px;
		padding: var(--sp-2) var(--sp-4);
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-clear-all:hover {
		background: var(--surface-hover);
		border-color: var(--text-muted);
		color: var(--text);
	}

	.load-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.load-item {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-3);
	}

	.load-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.load-info {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.load-ticket {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-weight: var(--fw-medium);
	}

	.load-tons {
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.load-time {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.load-notes {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-top: var(--sp-2);
		padding-top: var(--sp-2);
		border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
	}

	.load-item--rejected {
		opacity: 0.7;
		border-color: color-mix(in srgb, var(--error, #ef4444) 40%, transparent);
		background: color-mix(in srgb, var(--error, #ef4444) 5%, var(--surface-alt));
	}

	.load-tons--rejected {
		text-decoration: line-through;
		color: var(--text-muted);
	}

	.rejection-badge {
		display: inline-block;
		background: color-mix(in srgb, var(--error, #ef4444) 15%, transparent);
		color: var(--error, #ef4444);
		border: 1px solid color-mix(in srgb, var(--error, #ef4444) 30%, transparent);
		border-radius: 9999px;
		padding: 2px 8px;
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		white-space: nowrap;
	}

	.load-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-shrink: 0;
	}

	.btn-reject {
		min-height: 36px;
		padding: var(--sp-1) var(--sp-3);
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--error, #ef4444) 40%, transparent);
		border-radius: var(--radius-sm);
		color: var(--error, #ef4444);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.btn-reject:hover {
		background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent);
	}

	.btn-unreject {
		min-height: 36px;
		padding: var(--sp-1) var(--sp-3);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.btn-unreject:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.tally-item--rejected .tally-value {
		color: var(--error, #ef4444);
	}

	.reject-form {
		margin-top: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
	}

	.reject-form-header {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
	}

	.reason-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--sp-2);
	}

	.reason-btn {
		min-height: 48px;
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: center;
	}

	.reason-btn:hover {
		background: var(--surface-hover);
		border-color: var(--text-muted);
	}

	.reason-btn--selected {
		background: color-mix(in srgb, var(--error, #ef4444) 15%, transparent);
		border-color: var(--error, #ef4444);
		color: var(--error, #ef4444);
	}

	.reject-form-actions {
		display: flex;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}

	.btn-cancel-reject {
		flex: 1;
		min-height: 48px;
		padding: var(--sp-3);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-cancel-reject:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.btn-confirm-reject {
		flex: 1;
		min-height: 48px;
		padding: var(--sp-3);
		background: var(--error, #ef4444);
		border: none;
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-confirm-reject:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-confirm-reject:not(:disabled):hover {
		background: color-mix(in srgb, var(--error, #ef4444) 85%, black);
	}

	.load-notes--rejection {
		color: var(--error, #ef4444);
		font-style: italic;
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

	.lane-btns {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.lane-btn {
		min-height: 48px;
		min-width: 56px;
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.lane-btn:hover {
		border-color: var(--accent);
		color: var(--text);
	}

	.lane-btn.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--text);
		font-weight: var(--fw-bold);
	}

	.breakdown-section {
		margin-top: var(--sp-4);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3) var(--sp-4);
	}

	.breakdown-title {
		margin: 0 0 var(--sp-3);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.breakdown-grid {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}

	.breakdown-item {
		text-align: center;
		min-width: 60px;
	}

	.breakdown-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-bottom: var(--sp-1);
	}

	.breakdown-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}

	.breakdown-sub {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: 2px;
	}

	.load-badges {
		display: flex;
		gap: var(--sp-1);
		margin-top: var(--sp-1);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
	}

	.badge-lane {
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
	}

	.badge-pass {
		background: color-mix(in srgb, var(--text-muted) 15%, transparent);
		color: var(--text-muted);
		border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
	}

	@media (max-width: 460px) {
		.tally-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.completion-section {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.completion-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.completion-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.completion-pct {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--accent);
	}

	.completion-pct.completion-done {
		color: #22c55e;
	}

	.completion-bar-track {
		width: 100%;
		height: 10px;
		background: var(--surface-2, rgba(255,255,255,0.08));
		border-radius: 5px;
		overflow: hidden;
		margin-bottom: 0.4rem;
	}

	.completion-bar-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 5px;
		transition: width 0.4s ease;
	}

	.completion-bar-fill--done {
		background: #22c55e;
	}

	.completion-sub {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.completion-remaining {
		opacity: 0.75;
	}

	.completion-remaining--done {
		color: #22c55e;
		opacity: 1;
	}
</style>
