<script lang="ts">
	import { config, machines, placementCheck, rainCheck } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { spreadRateFromThickness } from '$lib/config/formulas';
	import JobSiteSettingsForm from '$lib/components/JobSiteSettingsForm.svelte';

	interface Props {
		/** start expanded (used on mobile where it stacks above the tools) */
		startOpen?: boolean;
	}
	let { startOpen = false }: Props = $props();

	let open = $state(startOpen);

	const machineLabel = $derived(machines.find((m) => m.id === job.machineId)?.label ?? 'None');
	const targetRate = $derived(
		job.thicknessIn > 0 ? Math.round(spreadRateFromThickness(job.thicknessIn)) : null
	);

	const placement = $derived(placementCheck(weather.effectiveTempF, job.thicknessIn));
	const rain = $derived(rainCheck(weather.rainNext24hIn));

	const weatherStatus = $derived.by(() => {
		if (!weather.hasLocation) return { kind: 'none' as const, text: 'No location' };
		if (rain?.status === 'fail' || placement?.status === 'fail')
			return { kind: 'bad' as const, text: placement?.status === 'fail' ? 'Too cold' : 'Rain — hold' };
		if (rain?.status === 'warn' || placement?.status === 'warn')
			return { kind: 'warn' as const, text: 'Check surface' };
		return {
			kind: 'good' as const,
			text: weather.effectiveTempF != null ? `${weather.effectiveTempF}°F OK` : 'OK'
		};
	});

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
		} finally {
			exporting = false;
		}
	}
</script>

<div class="jobbar" class:open>
	<button
		class="summary"
		type="button"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<span class="site">
			<span class="site-name">{job.siteName || 'Untitled job'}</span>
			<span class="eyebrow">Job Setup</span>
		</span>

		<span class="facts">
			<span class="fact"><b>{job.widthFt}</b> ft wide</span>
			<span class="dot">·</span>
			<span class="fact"><b>{job.thicknessIn}"</b> lift</span>
			<span class="dot">·</span>
			<span class="fact">{machineLabel}</span>
			<span class="dot">·</span>
			<span class="fact"><b>{job.wastePct}%</b> waste</span>
		</span>

		<span class="live">
			<span class="rate"><b>{targetRate ?? '—'}</b> lbs/SY target</span>
			<span class="wstat {weatherStatus.kind}">{weatherStatus.text}</span>
		</span>

		<span class="chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
	</button>

	{#if open}
		<div class="expanded">
			<JobSiteSettingsForm variant="inline" />
			<div class="action-row">
				<p class="foot-note">{config.app.name} · all figures computed on-device</p>
				<button class="btn btn-primary proof" onclick={handleExport} disabled={exporting}>
					{exporting ? 'Generating…' : 'Generate Proof PDF'}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.jobbar {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.summary {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--sp-5);
		padding: var(--sp-3) var(--sp-4);
		background: transparent;
		border: 0;
		cursor: pointer;
		color: var(--text);
		text-align: left;
	}

	.site {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.site-name {
		font-size: var(--fs-md);
		font-weight: var(--fw-bold);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}

	.facts {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex: 1;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		flex-wrap: wrap;
	}
	.fact b {
		color: var(--text);
		font-weight: var(--fw-semibold);
	}
	.dot {
		color: var(--border);
	}

	.live {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-left: auto;
	}
	.rate {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.rate b {
		color: var(--accent);
		font-size: var(--fs-md);
		font-weight: var(--fw-heavy);
	}

	.wstat {
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
		padding: 4px 10px;
		border-radius: var(--radius-pill);
		white-space: nowrap;
	}
	.wstat.good {
		background: color-mix(in srgb, var(--good) 18%, transparent);
		color: var(--good);
	}
	.wstat.warn {
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.wstat.bad {
		background: color-mix(in srgb, var(--bad) 18%, transparent);
		color: var(--bad);
	}
	.wstat.none {
		background: var(--surface-hover);
		color: var(--text-muted);
	}

	.chevron {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.expanded {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: 0 var(--sp-4) var(--sp-4);
		border-top: 1px solid var(--border);
		padding-top: var(--sp-4);
	}

	.action-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
	}
	.proof {
		flex-shrink: 0;
	}
	.foot-note {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	@media (max-width: 600px) {
		.action-row {
			flex-direction: column;
			align-items: stretch;
		}
		.action-row .proof {
			width: 100%;
		}
		.foot-note {
			text-align: center;
		}
	}

	/* Compact the summary on small screens: hide the middle facts, keep name + status */
	@media (max-width: 720px) {
		.facts {
			display: none;
		}
		.summary {
			gap: var(--sp-3);
		}
	}

	@media (max-width: 480px) {
		.summary {
			flex-wrap: wrap;
			row-gap: var(--sp-2);
			padding: var(--sp-3);
		}
		.site {
			flex: 1 1 auto;
		}
		.site-name {
			max-width: none;
		}
		.live {
			flex: 1 1 100%;
			margin-left: 0;
			justify-content: space-between;
		}
		.chevron {
			order: 1;
			margin-left: auto;
		}
	}
</style>
