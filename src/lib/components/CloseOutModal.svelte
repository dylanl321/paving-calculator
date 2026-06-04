<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import TimeInput from './TimeInput.svelte';
	import { formatFeet } from '$lib/utils/format';
	import { actualSpreadRate } from '$lib/config/formulas';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		jobSiteId: string;
		logId: string;
		currentLog: any;
		entries: any[];
		entrySummary: any;
		siteConfig: any;
		siteName: string;
		onClose: () => void;
		onComplete: () => void;
	}

	let {
		jobSiteId,
		logId,
		currentLog,
		entries,
		entrySummary,
		siteConfig,
		siteName,
		onClose,
		onComplete
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let endTime = $state(currentLog.end_time || '');
	// svelte-ignore state_referenced_locally
	let crewCount = $state(currentLog.crew_count || null);
	let foremanName = $state('');
	// svelte-ignore state_referenced_locally
	let notes = $state(currentLog.notes || '');
	let isSubmitting = $state(false);
	let showSuccess = $state(false);

	const hoursWorked = $derived.by(() => {
		if (!currentLog.start_time || !endTime) return 0;
		const [startH, startM] = currentLog.start_time.split(':').map(Number);
		const [endH, endM] = endTime.split(':').map(Number);
		return Math.max(0, (endH * 60 + endM - (startH * 60 + startM)) / 60);
	});

	async function closeOutWithoutPDF() {
		await closeOut(false);
	}

	async function closeOutWithPDF() {
		await closeOut(true);
	}

	async function closeOut(withPDF: boolean) {
		if (!foremanName.trim()) {
			alert('Foreman name is required');
			return;
		}

		isSubmitting = true;

		try {
			// Update log with final details
			const updateRes = await fetch(`/api/job-sites/${jobSiteId}/logs/${logId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					end_time: endTime,
					crew_count: crewCount,
					notes: notes
				})
			});

			if (!updateRes.ok) {
				toastStore.error('Failed to update log');
				throw new Error('Failed to update log');
			}

			// Close out the log
			const closeRes = await fetch(`/api/job-sites/${jobSiteId}/logs/${logId}/close`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ foreman_name: foremanName.trim() })
			});

			if (!closeRes.ok) {
				toastStore.error('Failed to close out log');
				throw new Error('Failed to close out log');
			}
			toastStore.success('Day closed successfully');

			// Generate PDF if requested
			if (withPDF) {
				const { generateDailyReportPDF } = await import('$lib/utils/pdf-export');

				let loads: any[] = [];
				try {
					const currentDate = currentLog.log_date;
					const loadsRes = await fetch(`/api/job-sites/${jobSiteId}/loads?start_date=${currentDate}`);
					if (loadsRes.ok) {
						const loadData = (await loadsRes.json()) as { loads?: any[] };
						loads = loadData.loads || [];
					}
				} catch {
					// Non-fatal - continue without loads
				}

				const actualRate =
					entrySummary.total_distance_ft > 0 && entrySummary.total_tons > 0
						? actualSpreadRate({
								tons: entrySummary.total_tons,
								distanceFt: entrySummary.total_distance_ft,
								widthFt: 1
							})
						: null;
				const targetRate = siteConfig?.config?.target_spread_rate || null;
				const diffPct =
					actualRate && targetRate ? ((actualRate - targetRate) / targetRate) * 100 : null;

				await generateDailyReportPDF(
					{
						widthFt: siteConfig?.config?.lane_width_ft || 12,
						thicknessIn: siteConfig?.config?.target_thickness_in || 2,
						courseType: siteConfig?.config?.course_type || 'surface',
						machineId: 'none',
						firstPass: false,
						truckLoadTons: 22,
						tackApplication: 'new-to-new',
						wastePct: 5,
						siteName: siteName,
						siteDescription: ''
					},
					{
						date: currentLog.log_date,
						siteName: siteName,
						weatherTempF: currentLog.weather_temp_f,
						weatherConditions: currentLog.weather_conditions,
						windSpeedMph: currentLog.wind_speed_mph,
						crewCount: crewCount,
						startTime: currentLog.start_time,
						endTime: endTime,
						notes: notes,
						entries: entries.map((e) => ({
							entry_type: e.entry_type,
							timestamp: e.timestamp,
							station_start: e.station_start,
							station_end: e.station_end,
							distance_ft: e.distance_ft,
							tons_placed: e.tons_placed,
							loads_count: e.loads_count,
							truck_tickets: null,
							spread_rate_actual: e.spread_rate_actual,
							tack_gallons: e.tack_gallons,
							lane: e.lane,
							notes: e.notes
						})),
						totals: {
							totalTons: entrySummary.total_tons,
							totalDistanceFt: entrySummary.total_distance_ft,
							totalLoads: entrySummary.total_loads,
							totalTackGallons: 0,
							hoursWorked
						},
						yield: {
							actualRate,
							targetRate,
							diffPct
						},
						loads: loads.map((l) => ({
							id: l.id,
							ticket_number: l.ticket_number,
							tons: l.tons,
							timestamp: l.timestamp,
							spread_rate: l.spread_rate,
							notes: l.notes
						}))
					}
				);
			}

			if (typeof window !== 'undefined') {
				localStorage.setItem('paverate_last_closeout_date', new Date().toISOString());
			}

			showSuccess = true;
			await invalidateAll();

			setTimeout(() => {
				onComplete();
				onClose();
			}, 1500);
		} catch (err) {
			console.error('Close-out error:', err);
			alert('Failed to close out day. Please try again.');
			isSubmitting = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && !isSubmitting) {
			onClose();
		}
	}
</script>

<div
	class="modal-overlay"
	role="button"
	tabindex="-1"
	aria-label="Close dialog"
	onclick={handleBackdropClick}
	onkeydown={(e) => { if (e.key === 'Escape' && !isSubmitting) onClose(); }}
>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h3>Close Out Day</h3>
			<button class="btn-close" onclick={onClose} disabled={isSubmitting}>✕</button>
		</div>

		{#if showSuccess}
			<div class="success-message">
				<div class="success-icon">✓</div>
				<h4>Day Closed Successfully</h4>
				<p>Signed by {foremanName}</p>
			</div>
		{:else}
			<div class="modal-body">
				<section class="summary-section">
					<h4>Today's Summary</h4>
					<div class="summary-grid">
						<div class="summary-item">
							<span class="summary-label">Distance</span>
							<span class="summary-value"
								>{formatFeet(entrySummary.total_distance_ft || 0)}</span
							>
						</div>
						<div class="summary-item">
							<span class="summary-label">Tons</span>
							<span class="summary-value">{(entrySummary.total_tons || 0).toFixed(1)}</span>
						</div>
						<div class="summary-item">
							<span class="summary-label">Loads</span>
							<span class="summary-value">{entrySummary.total_loads || 0}</span>
						</div>
						<div class="summary-item">
							<span class="summary-label">Hours</span>
							<span class="summary-value">{hoursWorked.toFixed(1)}</span>
						</div>
					</div>
				</section>

				<section class="details-section">
					<h4>Final Details</h4>
					<div class="field-group">
						<div class="field">
							<label for="end-time">End Time</label>
							<TimeInput bind:value={endTime} id="end-time" disabled={isSubmitting} />
						</div>
						<div class="field">
							<label for="crew-count">Crew Count</label>
							<input
								type="number"
								id="crew-count"
								bind:value={crewCount}
								min="1"
								disabled={isSubmitting}
							/>
						</div>
					</div>

					<div class="field">
						<label for="foreman-name">Foreman Signature *</label>
						<input
							type="text"
							id="foreman-name"
							class="foreman-signature"
							bind:value={foremanName}
							placeholder="Full Name"
							required
							disabled={isSubmitting}
						/>
					</div>

					<div class="field">
						<label for="final-notes">Final Notes</label>
						<textarea
							id="final-notes"
							bind:value={notes}
							rows="3"
							placeholder="Any additional notes..."
							disabled={isSubmitting}
						></textarea>
					</div>
				</section>
			</div>

			<div class="modal-footer">
				<button class="btn-secondary" onclick={onClose} disabled={isSubmitting}> Cancel </button>
				<button class="btn-secondary" onclick={closeOutWithoutPDF} disabled={isSubmitting}>
					Close Without PDF
				</button>
				<button class="btn-primary" onclick={closeOutWithPDF} disabled={isSubmitting}>
					Generate & Save PDF
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: flex-end;
		z-index: 1000;
		padding: 0;
	}

	.modal {
		width: 100%;
		max-width: var(--maxw, 640px);
		margin: 0 auto;
		background: var(--bg-1, #1a1a1a);
		border-radius: 16px 16px 0 0;
		max-height: 90vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid var(--border, #333);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.4rem;
		color: var(--text-1, #fff);
	}

	.btn-close {
		background: none;
		border: none;
		color: var(--text-muted, #888);
		font-size: 1.5rem;
		cursor: pointer;
		padding: 4px 8px;
		min-height: 48px;
		min-width: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.btn-close:hover {
		color: var(--accent, #f59e0b);
	}

	.btn-close:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.modal-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.summary-section h4,
	.details-section h4 {
		margin: 0 0 12px;
		font-size: 1rem;
		color: var(--text-muted, #888);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px;
		background: var(--bg-2, #2a2a2a);
		border-radius: 8px;
		border: 1px solid var(--border, #333);
	}

	.summary-label {
		font-size: 0.75rem;
		color: var(--text-muted, #888);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.summary-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--accent, #f59e0b);
	}

	.details-section {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.field-group {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field label {
		font-size: 0.85rem;
		color: var(--text-muted, #888);
		font-weight: 500;
	}

	.field input,
	.field textarea {
		min-height: 48px;
		padding: 0 14px;
		font-size: 1rem;
		background: var(--bg-2, #2a2a2a);
		border: 1px solid var(--border, #333);
		border-radius: 8px;
		color: var(--text-1, #fff);
		transition: border-color 0.2s;
	}

	.field input:focus,
	.field textarea:focus {
		outline: none;
		border-color: var(--accent, #f59e0b);
	}

	.field input:disabled,
	.field textarea:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.field textarea {
		padding: 12px 14px;
		resize: vertical;
		font-family: inherit;
	}

	.foreman-signature {
		font-family: 'Brush Script MT', cursive, serif;
		font-size: 1.5rem !important;
		font-style: italic;
		text-align: center;
		letter-spacing: 1px;
	}

	.modal-footer {
		display: flex;
		gap: 8px;
		padding: 20px;
		border-top: 1px solid var(--border, #333);
		flex-wrap: wrap;
	}

	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 20px;
		border-radius: 8px;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
		border: none;
		flex: 1;
	}

	.btn-primary {
		background: var(--accent, #f59e0b);
		color: var(--accent-text, #000);
	}

	.btn-secondary {
		background: var(--bg-2, #2a2a2a);
		color: var(--text-1, #fff);
		border: 1px solid var(--border, #333);
	}

	.btn-primary:hover,
	.btn-secondary:hover {
		opacity: 0.9;
	}

	.btn-primary:disabled,
	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.success-message {
		padding: 60px 20px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;
	}

	.success-icon {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: var(--good, #10b981);
		color: white;
		font-size: 3rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
	}

	.success-message h4 {
		margin: 0;
		font-size: 1.5rem;
		color: var(--text-1, #fff);
	}

	.success-message p {
		margin: 0;
		font-size: 1rem;
		color: var(--text-muted, #888);
	}

	@media (min-width: 768px) {
		.modal-overlay {
			align-items: center;
		}

		.modal {
			border-radius: 16px;
			max-height: 80vh;
		}

		.summary-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
</style>
