<script lang="ts">
	import { Atom, Plus, X, Trash2 } from 'lucide-svelte';
	import NumberField from './NumberField.svelte';
	import type { DbDensityReading } from '$lib/server/db-logs';

	interface Props {
		logId: string;
		jobSiteId: string;
		targetDensityPcf?: number | null;
		targetThicknessIn?: number | null;
	}

	let { logId, jobSiteId, targetDensityPcf = null, targetThicknessIn = null }: Props = $props();

	let readings = $state<DbDensityReading[]>([]);
	let showForm = $state(false);
	let loading = $state(true);
	let saving = $state(false);

	// Form state
	let stationInput = $state('');
	let laneInput = $state('left');
	let readingNumberInput = $state(1);
	let wetDensityInput = $state<number | null>(null);
	let moistureInput = $state<number | null>(null);
	let targetDensityInput = $state<number | null>(targetDensityPcf);
	let depthInput = $state<number | null>(targetThicknessIn);
	let notesInput = $state('');

	// Load readings on mount
	$effect(() => {
		loadReadings();
	});

	async function loadReadings() {
		loading = true;
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/logs/${logId}/density`, {
				credentials: 'include'
			});
			if (res.ok) {
				const data = await res.json();
				readings = data.readings;
			}
		} catch (err) {
			console.error('Failed to load density readings:', err);
		}
		loading = false;
	}

	function parseStation(s: string): number | null {
		// accepts "10+50" or "1050" or "10.50"
		const plusMatch = s.match(/^(\d+)\+(\d{2})$/);
		if (plusMatch) return parseInt(plusMatch[1]) * 100 + parseInt(plusMatch[2]);
		const num = parseFloat(s);
		return isNaN(num) ? null : Math.round(num);
	}

	function formatStation(feet: number): string {
		const hundreds = Math.floor(feet / 100);
		const remainder = feet % 100;
		return `${hundreds}+${String(remainder).padStart(2, '0')}`;
	}

	// Real-time compaction calculation
	const calculatedCompactionPct = $derived.by(() => {
		if (
			wetDensityInput &&
			wetDensityInput > 0 &&
			moistureInput != null &&
			targetDensityInput &&
			targetDensityInput > 0
		) {
			const dryDensity = wetDensityInput / (1 + moistureInput / 100);
			return (dryDensity / targetDensityInput) * 100;
		}
		return null;
	});

	function getCompactionStatus(compactionPct: number | null): {
		label: string;
		color: string;
	} {
		if (compactionPct == null) return { label: 'N/A', color: 'gray' };
		if (compactionPct >= 95) return { label: 'Pass', color: 'var(--good)' };
		if (compactionPct >= 92) return { label: 'Marginal', color: 'var(--warn)' };
		return { label: 'Fail', color: 'var(--bad)' };
	}

	async function handleSaveReading() {
		const stationNumber = parseStation(stationInput);
		if (
			!stationNumber ||
			!wetDensityInput ||
			wetDensityInput <= 0 ||
			moistureInput == null ||
			!targetDensityInput ||
			targetDensityInput <= 0
		) {
			return;
		}

		saving = true;
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/logs/${logId}/density`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					station_number: stationNumber,
					lane: laneInput || null,
					reading_number: readingNumberInput,
					wet_density_pcf: wetDensityInput,
					moisture_pct: moistureInput,
					target_density_pcf: targetDensityInput,
					depth_in: depthInput,
					notes: notesInput || null
				}),
				credentials: 'include'
			});

			if (res.ok) {
				const data = await res.json();
				readings = [...readings, data.reading];
				resetForm();
				showForm = false;
			}
		} catch (err) {
			console.error('Failed to save reading:', err);
		}
		saving = false;
	}

	async function handleDeleteReading(readingId: string) {
		if (!confirm('Delete this density reading?')) return;

		try {
			const res = await fetch(
				`/api/job-sites/${jobSiteId}/logs/${logId}/density/${readingId}`,
				{
					method: 'DELETE',
					credentials: 'include'
				}
			);

			if (res.ok) {
				readings = readings.filter((r) => r.id !== readingId);
			}
		} catch (err) {
			console.error('Failed to delete reading:', err);
		}
	}

	function resetForm() {
		stationInput = '';
		laneInput = 'left';
		readingNumberInput = 1;
		wetDensityInput = null;
		moistureInput = null;
		targetDensityInput = targetDensityPcf;
		depthInput = targetThicknessIn;
		notesInput = '';
	}

	// Summary stats
	const totalReadings = $derived(readings.length);
	const passingReadings = $derived(
		readings.filter((r) => r.compaction_pct != null && r.compaction_pct >= 95).length
	);
	const passingPct = $derived(
		totalReadings > 0 ? ((passingReadings / totalReadings) * 100).toFixed(1) : '0.0'
	);
	const avgCompaction = $derived.by(() => {
		const validReadings = readings.filter((r) => r.compaction_pct != null);
		if (validReadings.length === 0) return null;
		const sum = validReadings.reduce((acc, r) => acc + r.compaction_pct!, 0);
		return sum / validReadings.length;
	});
	const minCompaction = $derived.by(() => {
		const validReadings = readings.filter((r) => r.compaction_pct != null);
		if (validReadings.length === 0) return null;
		return Math.min(...validReadings.map((r) => r.compaction_pct!));
	});
</script>

<div class="nuclear-gauge-log">
	<div class="header">
		<div class="header-title">
			<Atom size={24} />
			<h3>Nuclear Gauge Log</h3>
		</div>
		{#if !showForm}
			<button
				class="btn-new"
				onclick={() => {
					resetForm();
					showForm = true;
				}}
			>
				<Plus size={20} />
				Log Reading
			</button>
		{/if}
	</div>

	{#if showForm}
		<div class="reading-form">
			<div class="form-header">
				<h4>New Density Reading</h4>
				<button
					class="btn-close"
					onclick={() => {
						showForm = false;
						resetForm();
					}}
					aria-label="Close"
				>
					<X size={20} />
				</button>
			</div>

			<div class="form-fields">
				<div class="field">
					<label for="station">Station</label>
					<input
						id="station"
						type="text"
						bind:value={stationInput}
						placeholder="e.g., 10+50 or 1050"
					/>
					<div class="field-hint">Format: HH+FF (e.g., 10+50 for station 10+50)</div>
				</div>

				<div class="field">
					<label for="lane">Lane</label>
					<select id="lane" bind:value={laneInput}>
						<option value="left">Left</option>
						<option value="right">Right</option>
						<option value="center">Center</option>
						<option value="shoulder">Shoulder</option>
					</select>
				</div>

				<div class="field">
					<label for="reading-number">Reading #</label>
					<select id="reading-number" bind:value={readingNumberInput}>
						<option value={1}>1st</option>
						<option value={2}>2nd</option>
						<option value={3}>3rd</option>
					</select>
				</div>

				<NumberField
					label="Wet Density"
					unit="pcf"
					bind:value={wetDensityInput}
					hint="Nuclear gauge reading"
				/>

				<NumberField label="Moisture" unit="%" bind:value={moistureInput} hint="Nuclear gauge reading" />

				<NumberField
					label="Target Density"
					unit="pcf"
					bind:value={targetDensityInput}
					hint="From proctor test"
				/>

				<NumberField label="Depth" unit="in" bind:value={depthInput} hint="Lift thickness" />

				{#if calculatedCompactionPct != null}
					<div class="calculated-compaction">
						<div class="compaction-label">Calculated Compaction:</div>
						<div
							class="compaction-value"
							style="color: {getCompactionStatus(calculatedCompactionPct).color}"
						>
							{calculatedCompactionPct.toFixed(1)}%
						</div>
						<div
							class="compaction-badge"
							style="background: {getCompactionStatus(calculatedCompactionPct).color}"
						>
							{getCompactionStatus(calculatedCompactionPct).label}
						</div>
					</div>
				{/if}

				<div class="field">
					<label for="notes">Notes (optional)</label>
					<input id="notes" type="text" bind:value={notesInput} placeholder="Additional notes" />
				</div>
			</div>

			<div class="form-actions">
				<button
					class="btn-save"
					onclick={handleSaveReading}
					disabled={!stationInput ||
						!wetDensityInput ||
						wetDensityInput <= 0 ||
						moistureInput == null ||
						!targetDensityInput ||
						targetDensityInput <= 0 ||
						saving}
				>
					{saving ? 'Saving...' : 'Log Reading'}
				</button>
			</div>
		</div>
	{/if}

	{#if loading}
		<div class="loading">Loading readings...</div>
	{:else if readings.length > 0}
		<div class="summary-section">
			<h4>Summary</h4>
			<div class="summary-grid">
				<div class="summary-item">
					<div class="summary-label">Total Readings</div>
					<div class="summary-value">{totalReadings}</div>
				</div>
				<div class="summary-item">
					<div class="summary-label">Passing (≥95%)</div>
					<div class="summary-value">{passingPct}%</div>
				</div>
				{#if avgCompaction != null}
					<div class="summary-item">
						<div class="summary-label">Avg Compaction</div>
						<div class="summary-value">{avgCompaction.toFixed(1)}%</div>
					</div>
				{/if}
				{#if minCompaction != null}
					<div class="summary-item">
						<div class="summary-label">Min Compaction</div>
						<div class="summary-value" style="color: {getCompactionStatus(minCompaction).color}">
							{minCompaction.toFixed(1)}%
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="readings-list">
			<h4>Readings</h4>
			<div class="readings-table">
				{#each readings as reading (reading.id)}
					<div class="reading-card">
						<div class="reading-header">
							<div class="reading-station">
								<span class="station-label">Station</span>
								<span class="station-value">{formatStation(reading.station_number)}</span>
								{#if reading.lane}
									<span class="lane-badge">{reading.lane}</span>
								{/if}
								{#if reading.reading_number > 1}
									<span class="reading-badge">#{reading.reading_number}</span>
								{/if}
							</div>
							<button
								class="btn-delete"
								onclick={() => handleDeleteReading(reading.id)}
								aria-label="Delete reading"
							>
								<Trash2 size={18} />
							</button>
						</div>

						<div class="reading-data">
							<div class="data-row">
								<span class="data-label">Wet Density:</span>
								<span class="data-value">{reading.wet_density_pcf.toFixed(1)} pcf</span>
							</div>
							<div class="data-row">
								<span class="data-label">Moisture:</span>
								<span class="data-value">{reading.moisture_pct.toFixed(1)}%</span>
							</div>
							{#if reading.dry_density_pcf != null}
								<div class="data-row">
									<span class="data-label">Dry Density:</span>
									<span class="data-value">{reading.dry_density_pcf.toFixed(1)} pcf</span>
								</div>
							{/if}
							{#if reading.compaction_pct != null}
								<div class="data-row compaction-row">
									<span class="data-label">Compaction:</span>
									<div class="compaction-result">
										<span class="data-value">{reading.compaction_pct.toFixed(1)}%</span>
										<span
											class="status-badge"
											style="background: {getCompactionStatus(reading.compaction_pct).color}"
										>
											{getCompactionStatus(reading.compaction_pct).label}
										</span>
									</div>
								</div>
							{/if}
						</div>

						{#if reading.notes}
							<div class="reading-notes">{reading.notes}</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="empty-state">
			<Atom size={48} strokeWidth={1.5} />
			<p>No density readings logged yet</p>
			<button
				class="btn-new-cta"
				onclick={() => {
					resetForm();
					showForm = true;
				}}
			>
				<Plus size={20} />
				Log First Reading
			</button>
		</div>
	{/if}
</div>

<style>
	.nuclear-gauge-log {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		margin-bottom: var(--sp-4);
	}

	.header {
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

	.btn-new,
	.btn-new-cta {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 48px;
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

	.btn-new-cta {
		width: 100%;
		justify-content: center;
	}

	.btn-new:hover,
	.btn-new-cta:hover {
		background: color-mix(in srgb, var(--accent) 90%, white);
	}

	.btn-new:active,
	.btn-new-cta:active {
		transform: scale(0.98);
	}

	.reading-form {
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
	.field select {
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

	.calculated-compaction {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
		border-radius: var(--radius-sm);
	}

	.compaction-label {
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		color: var(--text-muted);
	}

	.compaction-value {
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
	}

	.compaction-badge {
		padding: var(--sp-1) var(--sp-3);
		border-radius: var(--radius-sm);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		color: white;
	}

	.form-actions {
		margin-top: var(--sp-4);
	}

	.btn-save {
		width: 100%;
		min-height: 48px;
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

	.summary-section {
		margin-bottom: var(--sp-4);
		padding: var(--sp-4);
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		border-radius: var(--radius-md);
	}

	.summary-section h4 {
		margin: 0 0 var(--sp-3) 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--sp-4);
	}

	.summary-item {
		text-align: center;
	}

	.summary-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--sp-1);
	}

	.summary-value {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-bold);
		color: var(--accent);
		line-height: 1.2;
	}

	.readings-list {
		margin-top: var(--sp-4);
	}

	.readings-list h4 {
		margin: 0 0 var(--sp-3) 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}

	.readings-table {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.reading-card {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-3);
	}

	.reading-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-3);
	}

	.reading-station {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.station-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
	}

	.station-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}

	.lane-badge,
	.reading-badge {
		padding: var(--sp-1) var(--sp-2);
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		border-radius: var(--radius-sm);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		color: var(--accent);
	}

	.btn-delete {
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

	.btn-delete:hover {
		background: var(--bad);
		border-color: var(--bad);
		color: white;
	}

	.reading-data {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.data-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--sp-2) 0;
	}

	.compaction-row {
		border-top: 1px solid var(--border);
		padding-top: var(--sp-3);
		margin-top: var(--sp-2);
	}

	.data-label {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.data-value {
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.compaction-result {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.status-badge {
		padding: var(--sp-1) var(--sp-3);
		border-radius: var(--radius-sm);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		color: white;
	}

	.reading-notes {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-top: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
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
		.summary-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
