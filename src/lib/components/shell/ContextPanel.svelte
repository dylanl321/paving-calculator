<script lang="ts">
	import { config } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { spreadRateFromThickness, stickCheck } from '$lib/config/formulas';
	import JobSiteSettingsForm from '$lib/components/JobSiteSettingsForm.svelte';
	import SpreadRateChart from '$lib/components/charts/SpreadRateChart.svelte';

	const targetRate = $derived(
		job.thicknessIn > 0 ? Math.round(spreadRateFromThickness(job.thicknessIn)) : 0
	);
	const looseHeight = $derived(job.thicknessIn > 0 ? stickCheck(job.thicknessIn) : 0);

	let exporting = $state(false);

	async function handleExport() {
		exporting = true;
		try {
			const { generateProofPDF } = await import('$lib/utils/pdf-export');
			await generateProofPDF({
				widthFt: job.widthFt,
				thicknessIn: job.thicknessIn,
				machineId: job.machineId,
				firstPass: job.firstPass,
				truckLoadTons: job.truckLoadTons,
				tackApplication: job.tackApplication,
				wastePct: job.wastePct
			});
		} catch (error) {
			console.error('Failed to generate PDF:', error);
			alert('Failed to generate PDF. Please try again.');
		} finally {
			exporting = false;
		}
	}
</script>

<div class="context">
	<header class="panel-head">
		<h2 class="panel-title">Job Site</h2>
		<p class="panel-sub">All settings for this job — every calculator reads these values.</p>
	</header>

	<JobSiteSettingsForm variant="panel" />

	<section class="block rates">
		<h3 class="block-title">Live Rates</h3>
		<div class="stats">
			<div class="stat">
				<span class="stat-value">{targetRate}</span>
				<span class="stat-unit">lbs/SY</span>
				<span class="stat-label">Target spread</span>
			</div>
			<div class="stat">
				<span class="stat-value">{looseHeight.toFixed(2)}</span>
				<span class="stat-unit">in</span>
				<span class="stat-label">Loose behind screed</span>
			</div>
		</div>
	</section>

	<section class="block">
		<h3 class="block-title">Spread Rate vs Target</h3>
		<SpreadRateChart targetRate={targetRate} />
	</section>

	<button class="proof" onclick={handleExport} disabled={exporting}>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
			<polyline points="14 2 14 8 20 8"></polyline>
			<line x1="16" y1="13" x2="8" y2="13"></line>
			<line x1="16" y1="17" x2="8" y2="17"></line>
			<polyline points="10 9 9 9 8 9"></polyline>
		</svg>
		{exporting ? 'Generating…' : 'Generate Proof'}
	</button>

	<p class="foot-note">{config.app.name} · all figures computed on-device</p>
</div>

<style>
	.context {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.panel-head {
		margin-bottom: 4px;
	}

	.panel-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 800;
		letter-spacing: 0.2px;
	}

	.panel-sub {
		margin: 4px 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.block-title {
		margin: 0 0 10px;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-muted);
	}

	.rates {
		padding-top: 4px;
		border-top: 1px solid var(--border);
	}

	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.stat {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stat-value {
		font-size: 1.4rem;
		font-weight: 800;
		color: var(--accent);
		line-height: 1;
	}

	.stat-unit {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.stat-label {
		font-size: 0.72rem;
		color: var(--text-muted);
		margin-top: 2px;
	}

	.proof {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 50px;
		background: var(--accent);
		color: var(--accent-text);
		border: 0;
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.proof:hover:not(:disabled) {
		opacity: 0.9;
	}

	.proof:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.foot-note {
		margin: 0;
		font-size: 0.72rem;
		color: var(--text-muted);
		text-align: center;
		line-height: 1.4;
	}
</style>
