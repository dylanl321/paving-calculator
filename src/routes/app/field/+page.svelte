<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { config } from '$lib/config';
	import ViewSwitcher from '$lib/components/ViewSwitcher.svelte';

	interface JobSite {
		id: string;
		name: string;
		status: string;
	}

	interface DailyTotals {
		loads: number;
		totalTons: number;
		feetLogged: number;
	}

	let sites = $state<JobSite[]>([]);
	let selectedSite = $state<JobSite | null>(null);
	let loadingData = $state(true);
	let showLoadForm = $state(false);
	let showDistanceForm = $state(false);

	// Load form state
	let tons = $state(18.5);
	let ticketNumber = $state('');
	let submittingLoad = $state(false);

	// Distance form state
	let stationFrom = $state('');
	let stationTo = $state('');
	let submittingDistance = $state(false);

	// Daily totals
	let totals = $state<DailyTotals>({ loads: 0, totalTons: 0, feetLogged: 0 });

	onMount(async () => {
		await authStore.fetch();

		// Redirect non-field roles
		const fieldRoles = ['laborer', 'operator', 'screed_man', 'foreman'];
		if (!authStore.loading && authStore.isAuthenticated && !fieldRoles.includes(authStore.org?.role || '')) {
			goto('/dashboard');
			return;
		}

		await fetchSites();
	});

	async function fetchSites() {
		try {
			const res = await fetch('/api/job-sites', { credentials: 'include' });
			if (!res.ok) throw new Error('Failed to fetch job sites');

			const data = (await res.json()) as { job_sites?: JobSite[] } | JobSite[];
			sites = Array.isArray(data) ? data : ((data as { job_sites?: JobSite[]; sites?: JobSite[] }).job_sites || (data as { job_sites?: JobSite[]; sites?: JobSite[] }).sites || []);

			// Auto-select if only one site
			if (sites.length === 1) {
				selectedSite = sites[0];
				await fetchTodayTotals();
			}
		} catch (err) {
			console.error('Error fetching sites:', err);
			toastStore.error('Failed to load job sites');
		} finally {
			loadingData = false;
		}
	}

	async function fetchTodayTotals() {
		if (!selectedSite) return;

		try {
			// Fetch loads for today using date filter
			const today = new Date().toISOString().split('T')[0];
			const loadsRes = await fetch(
				`/api/job-sites/${selectedSite.id}/loads?start_date=${today}&end_date=${today}`,
				{ credentials: 'include' }
			);
			if (loadsRes.ok) {
				const loadsData = (await loadsRes.json()) as { loads?: { tons?: number }[] } | { tons?: number }[];
				const loads: { tons?: number }[] = Array.isArray(loadsData) ? loadsData : (loadsData as { loads?: { tons?: number }[] }).loads || [];

				// All loads returned are from today (date filtered by server)
				totals.loads = loads.length;
				totals.totalTons = loads.reduce((sum: number, load: { tons?: number }) => sum + (load.tons || 0), 0);
			}

			// Fetch distance calculations for today
			const todayStart = new Date();
			todayStart.setHours(0, 0, 0, 0);
			const todayStartUnix = Math.floor(todayStart.getTime() / 1000);

			const calcsRes = await fetch(
				`/api/calculations?job_site_id=${selectedSite.id}`,
				{ credentials: 'include' }
			);
			if (calcsRes.ok) {
				const calcsData = (await calcsRes.json()) as { calculations?: { created_at?: number; result?: { feet?: number } }[] } | { created_at?: number; result?: { feet?: number } }[];
				const calculations: { created_at?: number; result?: { feet?: number } }[] = Array.isArray(calcsData) ? calcsData : (calcsData as { calculations?: { created_at?: number; result?: { feet?: number } }[] }).calculations || [];

				// Sum feet from today's calculations
				totals.feetLogged = calculations
					.filter(calc => (calc.created_at || 0) >= todayStartUnix)
					.reduce((sum: number, calc: { result?: { feet?: number } }) => sum + (calc.result?.feet || 0), 0);
			}
		} catch (err) {
			console.error('Error fetching totals:', err);
		}
	}

	async function handleAddLoad() {
		if (!selectedSite) {
			toastStore.error('No job site selected');
			return;
		}

		submittingLoad = true;
		try {
			const payload: { tons: number; ticket_number?: string; timestamp: number } = {
				tons,
				timestamp: Math.floor(Date.now() / 1000)
			};
			if (ticketNumber.trim()) {
				payload.ticket_number = ticketNumber.trim();
			}

			const res = await fetch(`/api/job-sites/${selectedSite.id}/loads`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const errData = (await res.json()) as { error?: string };
				throw new Error(errData.error || 'Failed to add load');
			}

			toastStore.success(`Added ${tons} tons`);

			// Reset form
			tons = 18.5;
			ticketNumber = '';
			showLoadForm = false;

			// Refresh totals
			await fetchTodayTotals();
		} catch (err) {
			console.error('Error adding load:', err);
			toastStore.error(err instanceof Error ? err.message : 'Failed to add load');
		} finally {
			submittingLoad = false;
		}
	}

	async function handleLogDistance() {
		if (!selectedSite) {
			toastStore.error('No job site selected');
			return;
		}

		const from = parseFloat(stationFrom);
		const to = parseFloat(stationTo);

		if (isNaN(from) || isNaN(to)) {
			toastStore.error('Enter valid station numbers');
			return;
		}

		submittingDistance = true;
		try {
			const res = await fetch('/api/calculations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					calc_type: 'feet_left',
					job_site_id: selectedSite.id,
					inputs: { station_start: from, station_end: to },
					result: { feet: Math.abs(to - from) }
				})
			});

			if (!res.ok) {
				const errData = (await res.json()) as { error?: string };
				throw new Error(errData.error || 'Failed to log distance');
			}

			const feet = Math.abs(to - from);
			toastStore.success(`Logged ${feet.toFixed(0)} feet`);

			// Reset form
			stationFrom = '';
			stationTo = '';
			showDistanceForm = false;

			// Update totals
			totals.feetLogged += feet;
		} catch (err) {
			console.error('Error logging distance:', err);
			toastStore.error(err instanceof Error ? err.message : 'Failed to log distance');
		} finally {
			submittingDistance = false;
		}
	}
</script>

<svelte:head>
	<title>Field View — {config.app.name}</title>
</svelte:head>

<div class="field-view">
	{#if loadingData}
		<div class="loading">Loading...</div>
	{:else if selectedSite}
		<div class="site-header">
			<div class="site-info">
				<div class="site-name">{selectedSite.name}</div>
				<div class="site-status">{selectedSite.status}</div>
			</div>
		</div>

		<div class="field-content">
			<!-- Add Load Button -->
			<button
				class="action-button green"
				onclick={() => (showLoadForm = !showLoadForm)}
				disabled={submittingLoad}
			>
				Add Load
			</button>

			{#if showLoadForm}
				<div class="inline-form">
					<div class="form-group">
						<label for="tons">Tons</label>
						<input
							id="tons"
							type="number"
							step="0.1"
							bind:value={tons}
							disabled={submittingLoad}
						/>
					</div>
					<div class="form-group">
						<label for="ticket">Ticket Number (optional)</label>
						<input
							id="ticket"
							type="text"
							bind:value={ticketNumber}
							disabled={submittingLoad}
							placeholder="Optional"
						/>
					</div>
					<div class="form-actions">
						<button
							class="submit-button"
							onclick={handleAddLoad}
							disabled={submittingLoad}
						>
							{submittingLoad ? 'Submitting...' : 'Submit'}
						</button>
						<button
							class="cancel-button"
							onclick={() => {
								showLoadForm = false;
								tons = 18.5;
								ticketNumber = '';
							}}
							disabled={submittingLoad}
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			<!-- Log Distance Button -->
			<button
				class="action-button blue"
				onclick={() => (showDistanceForm = !showDistanceForm)}
				disabled={submittingDistance}
			>
				Log Distance
			</button>

			{#if showDistanceForm}
				<div class="inline-form">
					<div class="form-group">
						<label for="station-from">Station From (feet)</label>
						<input
							id="station-from"
							type="number"
							step="1"
							bind:value={stationFrom}
							disabled={submittingDistance}
							placeholder="e.g., 1000"
						/>
					</div>
					<div class="form-group">
						<label for="station-to">Station To (feet)</label>
						<input
							id="station-to"
							type="number"
							step="1"
							bind:value={stationTo}
							disabled={submittingDistance}
							placeholder="e.g., 1500"
						/>
					</div>
					<div class="form-actions">
						<button
							class="submit-button"
							onclick={handleLogDistance}
							disabled={submittingDistance}
						>
							{submittingDistance ? 'Submitting...' : 'Submit'}
						</button>
						<button
							class="cancel-button"
							onclick={() => {
								showDistanceForm = false;
								stationFrom = '';
								stationTo = '';
							}}
							disabled={submittingDistance}
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			<!-- Today's Totals -->
			<div class="totals-section">
				<h2>Today's Totals</h2>
				<div class="totals-grid">
					<div class="total-item">
						<div class="total-label">Loads</div>
						<div class="total-value">{totals.loads}</div>
					</div>
					<div class="total-item">
						<div class="total-label">Total Tons</div>
						<div class="total-value">{totals.totalTons.toFixed(1)}</div>
					</div>
					<div class="total-item">
						<div class="total-label">Feet Logged</div>
						<div class="total-value">{totals.feetLogged.toFixed(0)}</div>
					</div>
				</div>
			</div>
		</div>

		<!-- View switcher -->
		<ViewSwitcher currentView="field" />
	{:else if sites.length === 0}
		<div class="empty-state">
			<p>No job sites available</p>
			<a href="/app">Go to Full View</a>
		</div>
	{:else}
		<div class="site-selector">
			<h2>Select a Job Site</h2>
			{#each sites as site}
				<button
					class="site-option"
					onclick={() => {
						selectedSite = site;
						fetchTodayTotals();
					}}
				>
					<div class="site-option-name">{site.name}</div>
					<div class="site-option-status">{site.status}</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.field-view {
		min-height: 100vh;
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
		display: flex;
		flex-direction: column;
	}

	.loading,
	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 24px;
		text-align: center;
		color: var(--text-muted);
	}

	.empty-state a {
		color: var(--accent);
		text-decoration: none;
		font-weight: 600;
	}

	.site-header {
		padding: 20px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.site-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.site-name {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text);
	}

	.site-status {
		font-size: 0.9rem;
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.field-content {
		flex: 1;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.action-button {
		width: 100%;
		height: 64px;
		border: none;
		border-radius: var(--radius);
		font-size: 1.125rem;
		font-weight: 600;
		color: white;
		cursor: pointer;
		transition: transform 0.15s, box-shadow 0.15s;
		min-height: 48px;
	}

	.action-button.green {
		background: #22c55e;
		box-shadow: 0 2px 8px -2px rgba(34, 197, 94, 0.5);
	}

	.action-button.green:hover {
		background: #16a34a;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px -2px rgba(34, 197, 94, 0.6);
	}

	.action-button.blue {
		background: #3b82f6;
		box-shadow: 0 2px 8px -2px rgba(59, 130, 246, 0.5);
	}

	.action-button.blue:hover {
		background: #2563eb;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px -2px rgba(59, 130, 246, 0.6);
	}

	.action-button:active {
		transform: translateY(0);
	}

	.action-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.inline-form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: -8px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
	}

	.form-group input {
		width: 100%;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
		font-size: 1rem;
		min-height: 48px;
	}

	.form-group input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.form-actions {
		display: flex;
		gap: 12px;
		margin-top: 4px;
	}

	.submit-button,
	.cancel-button {
		flex: 1;
		height: 48px;
		border: none;
		border-radius: var(--radius);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		min-height: 48px;
	}

	.submit-button {
		background: var(--accent);
		color: var(--accent-text);
	}

	.submit-button:hover {
		opacity: 0.9;
	}

	.submit-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cancel-button {
		background: var(--border);
		color: var(--text);
	}

	.cancel-button:hover {
		background: var(--border-hover, var(--border));
	}

	.totals-section {
		margin-top: 24px;
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.totals-section h2 {
		margin: 0 0 16px;
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text);
	}

	.totals-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}

	.total-item {
		text-align: center;
	}

	.total-label {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 4px;
	}

	.total-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--accent);
	}

	.site-selector {
		flex: 1;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.site-selector h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text);
	}

	.site-option {
		width: 100%;
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-align: left;
		cursor: pointer;
		min-height: 48px;
	}

	.site-option:hover {
		background: var(--border);
	}

	.site-option-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text);
		margin-bottom: 4px;
	}

	.site-option-status {
		font-size: 0.9rem;
		color: var(--text-muted);
		text-transform: capitalize;
	}

	@media (max-width: 480px) {
		.totals-grid {
			grid-template-columns: 1fr;
			gap: 12px;
		}

		.total-item {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		.total-label {
			text-align: left;
			margin-bottom: 0;
		}

		.total-value {
			text-align: right;
		}
	}
</style>
