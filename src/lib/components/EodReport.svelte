<script lang="ts">
	import { today } from '$lib/stores/today.svelte';
	import { job } from '$lib/stores/job.svelte';

	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	const rollup = $derived(today.rollup);
	const yieldData = $derived(today.yieldVsTarget(job.widthFt, job.thicknessIn));

	function formatDistance(ft: number | null): string {
		if (ft == null || ft === 0) return '';
		if (ft >= 5280) {
			return `${(ft / 5280).toFixed(2)} mi`;
		}
		return `${Math.round(ft).toLocaleString()} ft`;
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatWeather(): string {
		const parts: string[] = [];
		if (today.weatherTempF != null) {
			parts.push(`${Math.round(today.weatherTempF)}°F`);
		}
		if (today.weatherConditions) {
			const label =
				today.weatherConditions === 'clear'
					? 'Clear'
					: today.weatherConditions === 'cloudy'
						? 'Cloudy'
						: today.weatherConditions === 'rain'
							? 'Rain'
							: today.weatherConditions === 'wind'
								? 'Windy'
								: 'Fog';
			parts.push(label);
		}
		return parts.join(' ');
	}

	const reportText = $derived.by(() => {
		const lines: string[] = [];
		lines.push(`📋 EOD Report - ${formatDate(today.date)}`);
		lines.push(`Job: ${today.siteName || 'Field job'}`);
		lines.push('');

		if (rollup.total_distance_ft > 0) {
			lines.push(`📏 Distance: ${formatDistance(rollup.total_distance_ft)}`);
		}
		if (rollup.total_tons > 0) {
			lines.push(`⚖️ Tonnage: ${rollup.total_tons.toFixed(1)} tons`);
		}

		// Calculate waste: tons ordered - tons placed
		if (rollup.total_tons > 0 && job.wastePct > 0) {
			const ordered = rollup.total_tons / (1 - job.wastePct / 100);
			const waste = ordered - rollup.total_tons;
			lines.push(`🗑️ Waste: ${waste.toFixed(1)} tons (${job.wastePct}% factor)`);
		}

		if (rollup.total_tack_gallons > 0) {
			lines.push(`💧 Tack: ${Math.round(rollup.total_tack_gallons)} gal`);
		}
		if (rollup.total_loads > 0) {
			lines.push(`🚛 Loads: ${rollup.total_loads}`);
		}
		if (rollup.hours_worked > 0) {
			lines.push(`⏱️ Hours: ${rollup.hours_worked.toFixed(1)} hrs`);
		}
		if (today.crewCount != null && today.crewCount > 0) {
			lines.push(`👷 Crew: ${today.crewCount} workers`);
		}

		const weather = formatWeather();
		if (weather) {
			lines.push(`🌡️ Weather: ${weather}`);
		}

		if (yieldData.actualRate != null && yieldData.targetRate != null) {
			lines.push('');
			lines.push(
				`📊 Yield: ${Math.round(yieldData.actualRate)} lbs/SY (target: ${Math.round(yieldData.targetRate)})`
			);
		}

		lines.push('');
		lines.push('— Sent via PaveRate');
		return lines.join('\n');
	});

	async function shareReport() {
		if (navigator.share) {
			try {
				await navigator.share({
					title: 'EOD Report',
					text: reportText
				});
			} catch (err) {
				if ((err as Error).name !== 'AbortError') {
					await fallbackCopy();
				}
			}
		} else {
			await fallbackCopy();
		}
	}

	async function fallbackCopy() {
		try {
			await navigator.clipboard.writeText(reportText);
			alert('Report copied to clipboard');
		} catch {
			alert('Unable to share. Please copy the text manually.');
		}
	}

	function close() {
		open = false;
	}
</script>

{#if open}
	<div class="overlay" role="button" tabindex="0" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label="End of Day Report">
		<header class="modal-head">
			<h2>End of Day Report</h2>
			<button class="btn-close" onclick={close} aria-label="Close">✕</button>
		</header>

		<div class="modal-body">
			<div class="stats-grid">
				{#if rollup.total_distance_ft > 0}
					<div class="stat">
						<span class="stat-icon">📏</span>
						<span class="stat-label">Distance</span>
						<span class="stat-value">{formatDistance(rollup.total_distance_ft)}</span>
					</div>
				{/if}
				{#if rollup.total_tons > 0}
					<div class="stat">
						<span class="stat-icon">⚖️</span>
						<span class="stat-label">Tonnage</span>
						<span class="stat-value">{rollup.total_tons.toFixed(1)} t</span>
					</div>
				{/if}
				{#if rollup.total_tons > 0 && job.wastePct > 0}
					<div class="stat">
						<span class="stat-icon">🗑️</span>
						<span class="stat-label">Waste</span>
						<span class="stat-value"
							>{((rollup.total_tons / (1 - job.wastePct / 100)) - rollup.total_tons).toFixed(1)} t</span
						>
					</div>
				{/if}
				{#if rollup.total_tack_gallons > 0}
					<div class="stat">
						<span class="stat-icon">💧</span>
						<span class="stat-label">Tack</span>
						<span class="stat-value">{Math.round(rollup.total_tack_gallons)} gal</span>
					</div>
				{/if}
				{#if rollup.total_loads > 0}
					<div class="stat">
						<span class="stat-icon">🚛</span>
						<span class="stat-label">Loads</span>
						<span class="stat-value">{rollup.total_loads}</span>
					</div>
				{/if}
				{#if rollup.hours_worked > 0}
					<div class="stat">
						<span class="stat-icon">⏱️</span>
						<span class="stat-label">Hours</span>
						<span class="stat-value">{rollup.hours_worked.toFixed(1)} hrs</span>
					</div>
				{/if}
				{#if today.crewCount != null && today.crewCount > 0}
					<div class="stat">
						<span class="stat-icon">👷</span>
						<span class="stat-label">Crew</span>
						<span class="stat-value">{today.crewCount} workers</span>
					</div>
				{/if}
				{#if formatWeather()}
					<div class="stat">
						<span class="stat-icon">🌡️</span>
						<span class="stat-label">Weather</span>
						<span class="stat-value">{formatWeather()}</span>
					</div>
				{/if}
				{#if yieldData.actualRate != null && yieldData.targetRate != null}
					<div class="stat stat-wide">
						<span class="stat-icon">📊</span>
						<span class="stat-label">Yield vs Target</span>
						<span class="stat-value"
							>{Math.round(yieldData.actualRate)} lbs/SY (target: {Math.round(yieldData.targetRate)})</span
						>
					</div>
				{/if}
			</div>

			<div class="preview">
				<h3>Share Preview</h3>
				<pre class="preview-text">{reportText}</pre>
			</div>
		</div>

		<footer class="modal-foot">
			<button class="btn btn-secondary" onclick={close}>Close</button>
			<button class="btn btn-share" onclick={shareReport}>Share Report</button>
		</footer>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: #000000cc;
		z-index: 50;
		cursor: pointer;
	}

	.modal {
		position: fixed;
		z-index: 51;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(640px, 100%);
		max-height: 90vh;
		overflow: auto;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		display: flex;
		flex-direction: column;
	}

	.modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-4);
		position: sticky;
		top: 0;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		z-index: 1;
	}

	.modal-head h2 {
		margin: 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-heavy);
		color: var(--accent);
	}

	.btn-close {
		min-width: 44px;
		min-height: 44px;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: var(--fs-xl);
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.btn-close:hover {
		color: var(--text);
	}

	.modal-body {
		padding: var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--sp-3);
	}

	.stat {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-wide {
		grid-column: 1 / -1;
	}

	.stat-icon {
		font-size: 24px;
		line-height: 1;
	}

	.stat-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		font-weight: var(--fw-medium);
	}

	.stat-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}

	.preview {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.preview h3 {
		margin: 0;
		font-size: var(--fs-base);
		font-weight: var(--fw-bold);
		color: var(--text-muted);
	}

	.preview-text {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-3);
		font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
		font-size: var(--fs-sm);
		line-height: 1.6;
		color: var(--text);
		white-space: pre-wrap;
		word-wrap: break-word;
		margin: 0;
	}

	.modal-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-4);
		position: sticky;
		bottom: 0;
		background: var(--surface);
		border-top: 1px solid var(--border);
		gap: var(--sp-3);
	}

	.btn {
		min-height: 48px;
		padding: 0 var(--sp-4);
		border-radius: var(--radius-md);
		font-size: var(--fs-base);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
	}

	.btn-secondary {
		background: var(--surface-alt);
		color: var(--text);
		border: 1px solid var(--border);
		flex: 1;
	}

	.btn-secondary:hover {
		background: var(--surface-hover);
	}

	.btn-share {
		background: #f59e0b;
		color: #1b2228;
		font-weight: 600;
		min-height: 56px;
		flex: 2;
		box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
	}

	.btn-share:hover {
		background: #d97706;
	}

	.btn-share:active {
		transform: scale(0.98);
	}

	@media (min-width: 768px) {
		.modal {
			bottom: auto;
			top: 50%;
			transform: translate(-50%, -50%);
			border-radius: var(--radius-lg);
		}
	}

	@media (max-width: 480px) {
		.stats-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
