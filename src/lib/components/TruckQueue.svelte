<script lang="ts">
	import { TruckIcon, Plus, X, Clock, CheckCircle2 } from 'lucide-svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { UNIT_LABELS, toMetricTonnes, fromMetricTonnes } from '$lib/utils/unitConvert';

	interface Truck {
		id: string;
		job_site_id: string;
		truck_number: string;
		estimated_tons: number | null;
		departure_time: number;
		travel_time_minutes: number;
		status: 'en_route' | 'arrived' | 'dismissed';
		arrived_at: number | null;
		created_by: string;
		created_at: number;
		updated_at: number;
	}

	interface Props {
		jobSiteId: string;
		isAuthenticated?: boolean;
	}

	let { jobSiteId, isAuthenticated = false }: Props = $props();

	let trucks = $state<Truck[]>([]);
	let showAddTruckForm = $state(false);
	let saving = $state(false);
	let loading = $state(true);

	// Form state
	let truckNumberInput = $state('');
	let estimatedTonsInput = $state<number | null>(null);
	let departureTimeInput = $state('');
	let travelTimeInput = $state(30);

	const STORAGE_KEY = `trucks_${jobSiteId}`;

	// Auto-refresh every 30 seconds
	let refreshInterval: ReturnType<typeof setInterval>;

	$effect(() => {
		loadData();
		refreshInterval = setInterval(() => {
			loadData();
		}, 30000);
		return () => clearInterval(refreshInterval);
	});

	async function loadData() {
		if (isAuthenticated) {
			try {
				const res = await fetch(`/api/job-sites/${jobSiteId}/trucks?status=en_route`, {
					credentials: 'include'
				});
				if (res.ok) {
					const data = (await res.json()) as { trucks: Truck[] };
					trucks = data.trucks;
				}
			} catch {
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
				trucks = JSON.parse(stored);
			} catch {
				trucks = [];
			}
		}
	}

	function saveToLocalStorage() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(trucks));
	}

	function getDefaultDepartureTime(): string {
		const now = new Date();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}

	async function handleAddTruck() {
		if (!truckNumberInput || !departureTimeInput || travelTimeInput <= 0) return;

		saving = true;

		// Parse departure time
		const [hours, minutes] = departureTimeInput.split(':').map(Number);
		const departureDate = new Date();
		departureDate.setHours(hours, minutes, 0, 0);
		const departureTime = Math.floor(departureDate.getTime() / 1000);

		const tons = estimatedTonsInput
			? unitsStore.system === 'metric'
				? fromMetricTonnes(estimatedTonsInput)
				: estimatedTonsInput
			: null;

		const newTruck: Partial<Truck> = {
			truck_number: truckNumberInput,
			estimated_tons: tons,
			departure_time: departureTime,
			travel_time_minutes: travelTimeInput
		};

		if (isAuthenticated) {
			try {
				const res = await fetch(`/api/job-sites/${jobSiteId}/trucks`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(newTruck),
					credentials: 'include'
				});
				if (res.ok) {
					const data = (await res.json()) as { truck: Truck };
					trucks = [...trucks, data.truck];
				}
			} catch {
				const truck: Truck = {
					id: crypto.randomUUID(),
					job_site_id: jobSiteId,
					truck_number: truckNumberInput,
					estimated_tons: tons,
					departure_time: departureTime,
					travel_time_minutes: travelTimeInput,
					status: 'en_route',
					arrived_at: null,
					created_by: 'local',
					created_at: Math.floor(Date.now() / 1000),
					updated_at: Math.floor(Date.now() / 1000)
				};
				trucks = [...trucks, truck];
				saveToLocalStorage();
			}
		} else {
			const truck: Truck = {
				id: crypto.randomUUID(),
				job_site_id: jobSiteId,
				truck_number: truckNumberInput,
				estimated_tons: tons,
				departure_time: departureTime,
				travel_time_minutes: travelTimeInput,
				status: 'en_route',
				arrived_at: null,
				created_by: 'local',
				created_at: Math.floor(Date.now() / 1000),
				updated_at: Math.floor(Date.now() / 1000)
			};
			trucks = [...trucks, truck];
			saveToLocalStorage();
		}

		// Reset form
		truckNumberInput = '';
		estimatedTonsInput = null;
		departureTimeInput = '';
		travelTimeInput = 30;
		showAddTruckForm = false;
		saving = false;
	}

	async function markArrived(truckId: string) {
		if (isAuthenticated) {
			try {
				await fetch(`/api/job-sites/${jobSiteId}/trucks/${truckId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status: 'arrived' }),
					credentials: 'include'
				});
			} catch {
				// Fall through to local
			}
		}
		trucks = trucks.filter((t) => t.id !== truckId);
		if (!isAuthenticated) {
			saveToLocalStorage();
		}
	}

	async function dismissTruck(truckId: string) {
		if (isAuthenticated) {
			try {
				await fetch(`/api/job-sites/${jobSiteId}/trucks/${truckId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status: 'dismissed' }),
					credentials: 'include'
				});
			} catch {
				// Fall through to local
			}
		}
		trucks = trucks.filter((t) => t.id !== truckId);
		if (!isAuthenticated) {
			saveToLocalStorage();
		}
	}

	function calculateETA(truck: Truck): number {
		return truck.departure_time + truck.travel_time_minutes * 60;
	}

	function getTimeRemaining(etaTimestamp: number): number {
		const now = Math.floor(Date.now() / 1000);
		return etaTimestamp - now;
	}

	function formatETA(etaTimestamp: number): string {
		const date = new Date(etaTimestamp * 1000);
		return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function formatCountdown(secondsRemaining: number): string {
		if (secondsRemaining < 0) {
			const mins = Math.floor(Math.abs(secondsRemaining) / 60);
			return `${mins} min overdue`;
		}
		const mins = Math.floor(secondsRemaining / 60);
		if (mins === 0) return 'arriving now';
		return `in ${mins} min`;
	}

	function getETAClass(secondsRemaining: number): string {
		if (secondsRemaining < 0) return 'eta-overdue';
		if (secondsRemaining < 300) return 'eta-urgent'; // < 5 min
		if (secondsRemaining < 600) return 'eta-soon'; // < 10 min
		return 'eta-safe'; // > 10 min
	}

	const activeTrucks = $derived(trucks.filter((t) => t.status === 'en_route'));

	function formatTons(tons: number | null): string {
		if (!tons) return '';
		const displayTons = unitsStore.system === 'metric' ? toMetricTonnes(tons) : tons;
		return `${displayTons.toFixed(1)} ${UNIT_LABELS.tons[unitsStore.system]}`;
	}
</script>

<div class="truck-queue">
	<div class="tracker-header">
		<div class="header-title">
			<TruckIcon size={24} />
			<h3>Truck Queue</h3>
		</div>
		{#if !showAddTruckForm}
			<button
				class="btn-new-truck"
				onclick={() => {
					showAddTruckForm = true;
					departureTimeInput = getDefaultDepartureTime();
				}}
			>
				<Plus size={20} />
				Add Truck
			</button>
		{/if}
	</div>

	{#if showAddTruckForm}
		<div class="new-truck-form">
			<div class="form-header">
				<h4>Add Truck to Queue</h4>
				<button
					class="btn-close"
					onclick={() => {
						showAddTruckForm = false;
						truckNumberInput = '';
						estimatedTonsInput = null;
						departureTimeInput = '';
						travelTimeInput = 30;
					}}
					aria-label="Close"
				>
					<X size={20} />
				</button>
			</div>

			<div class="form-fields">
				<div class="field">
					<label for="truck-number">Truck Number</label>
					<input
						id="truck-number"
						type="text"
						bind:value={truckNumberInput}
						placeholder="e.g., T-42"
					/>
				</div>

				<div class="field">
					<label for="estimated-tons">Estimated Tons (optional)</label>
					<input
						id="estimated-tons"
						type="number"
						bind:value={estimatedTonsInput}
						placeholder="e.g., 20"
						min="0"
						step="0.5"
					/>
					<span class="field-hint">{UNIT_LABELS.tons[unitsStore.system]}</span>
				</div>

				<div class="field">
					<label for="departure-time">Departure Time</label>
					<input id="departure-time" type="time" bind:value={departureTimeInput} />
				</div>

				<div class="field">
					<label for="travel-time">Travel Time (minutes)</label>
					<input
						id="travel-time"
						type="number"
						bind:value={travelTimeInput}
						min="1"
						placeholder="e.g., 30"
					/>
				</div>
			</div>

			<div class="form-actions">
				<button
					class="btn-save"
					onclick={handleAddTruck}
					disabled={!truckNumberInput || !departureTimeInput || travelTimeInput <= 0 || saving}
				>
					{saving ? 'Adding...' : 'Add Truck'}
				</button>
			</div>
		</div>
	{/if}

	{#if loading}
		<div class="loading">Loading...</div>
	{:else if activeTrucks.length > 0}
		<div class="truck-list">
			{#each activeTrucks as truck, index (truck.id)}
				{@const eta = calculateETA(truck)}
				{@const remaining = getTimeRemaining(eta)}
				<div class="truck-card {getETAClass(remaining)}">
					<div class="truck-header">
						<div class="truck-position">#{index + 1}</div>
						<div class="truck-info">
							<div class="truck-number">{truck.truck_number}</div>
							{#if truck.estimated_tons}
								<div class="truck-tons">{formatTons(truck.estimated_tons)}</div>
							{/if}
						</div>
					</div>

					<div class="truck-eta">
						<div class="eta-time">
							<Clock size={16} />
							<span>{formatETA(eta)}</span>
						</div>
						<div class="eta-countdown">{formatCountdown(remaining)}</div>
					</div>

					<div class="truck-actions">
						<button class="btn-arrived" onclick={() => markArrived(truck.id)}>
							<CheckCircle2 size={18} />
							Arrived
						</button>
						<button
							class="btn-dismiss"
							onclick={() => dismissTruck(truck.id)}
							aria-label="Dismiss truck"
						>
							<X size={18} />
						</button>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty-state">
			<Truck size={48} strokeWidth={1.5} />
			<p>No trucks in queue</p>
			<button
				class="btn-new-truck-cta"
				onclick={() => {
					showAddTruckForm = true;
					departureTimeInput = getDefaultDepartureTime();
				}}
			>
				<Plus size={20} />
				Add First Truck
			</button>
		</div>
	{/if}
</div>

<style>
	.truck-queue {
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

	.btn-new-truck,
	.btn-new-truck-cta {
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

	.btn-new-truck-cta {
		width: 100%;
		justify-content: center;
	}

	.btn-new-truck:hover,
	.btn-new-truck-cta:hover {
		background: color-mix(in srgb, var(--accent) 90%, white);
	}

	.btn-new-truck:active,
	.btn-new-truck-cta:active {
		transform: scale(0.98);
	}

	.new-truck-form {
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
	.field input[type='number'],
	.field input[type='time'] {
		min-height: 48px;
		padding: var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--fs-md);
	}

	.field-hint {
		font-size: var(--fs-xs);
		color: var(--text-muted);
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

	.truck-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.truck-card {
		background: var(--surface-alt);
		border: 2px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		transition: all 0.15s ease;
	}

	.truck-card.eta-safe {
		border-color: color-mix(in srgb, var(--good) 30%, transparent);
		background: color-mix(in srgb, var(--good) 8%, var(--surface-alt));
	}

	.truck-card.eta-soon {
		border-color: color-mix(in srgb, #f59e0b 30%, transparent);
		background: color-mix(in srgb, #f59e0b 8%, var(--surface-alt));
	}

	.truck-card.eta-urgent {
		border-color: color-mix(in srgb, var(--warn) 30%, transparent);
		background: color-mix(in srgb, var(--warn) 8%, var(--surface-alt));
	}

	.truck-card.eta-overdue {
		border-color: color-mix(in srgb, var(--warn) 50%, transparent);
		background: color-mix(in srgb, var(--warn) 12%, var(--surface-alt));
	}

	.truck-header {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.truck-position {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent);
		color: var(--text);
		border-radius: 50%;
		font-size: var(--fs-md);
		font-weight: var(--fw-bold);
	}

	.truck-info {
		flex: 1;
	}

	.truck-number {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
		line-height: 1.2;
	}

	.truck-tons {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-top: 2px;
	}

	.truck-eta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-3);
		background: var(--surface);
		border-radius: var(--radius-sm);
		margin-bottom: var(--sp-3);
	}

	.eta-time {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.eta-countdown {
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		color: var(--text-muted);
	}

	.truck-card.eta-overdue .eta-countdown,
	.truck-card.eta-urgent .eta-countdown {
		color: var(--warn);
		font-weight: var(--fw-bold);
	}

	.truck-actions {
		display: flex;
		gap: var(--sp-2);
	}

	.btn-arrived {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		min-height: 48px;
		padding: var(--sp-3) var(--sp-4);
		background: var(--good);
		color: var(--text);
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-arrived:hover {
		background: color-mix(in srgb, var(--good) 90%, white);
	}

	.btn-dismiss {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		min-width: 48px;
		padding: var(--sp-3);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-dismiss:hover {
		background: var(--warn);
		border-color: var(--warn);
		color: white;
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

	@media (max-width: 460px) {
		.truck-eta {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--sp-2);
		}
	}
</style>
