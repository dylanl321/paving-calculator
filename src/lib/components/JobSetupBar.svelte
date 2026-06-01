<script lang="ts">
	import { machines } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { spreadRateFromThickness } from '$lib/config/formulas';

	let open = $state(false);
	const rate = $derived(job.thicknessIn > 0 ? Math.round(spreadRateFromThickness(job.thicknessIn)) : 0);
	const machineLabel = $derived(machines.find((m) => m.id === job.machineId)?.label ?? 'None');
</script>

<div class="job-bar">
	<button class="job-summary" onclick={() => (open = !open)} aria-expanded={open}>
		<span class="job-icon">⚙</span>
		<span class="job-text">
			Job: <b>{job.widthFt} ft</b> wide · <b>{job.thicknessIn}"</b> ({rate} lbs/SY) ·
			<b>{machineLabel}</b>
		</span>
		<span class="chev">{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		<div class="job-fields">
			<p class="job-note">Set these once. Every calculator below uses them.</p>

			<label class="jf">
				<span>Mat width</span>
				<span class="jf-input">
					<input type="number" inputmode="decimal" bind:value={job.widthFt} /><i>ft</i>
				</span>
			</label>

			<label class="jf">
				<span>Target thickness</span>
				<span class="jf-input">
					<input type="number" inputmode="decimal" step="0.25" bind:value={job.thicknessIn} /><i>in</i>
				</span>
			</label>

			<label class="jf">
				<span>Truck load</span>
				<span class="jf-input">
					<input type="number" inputmode="decimal" bind:value={job.truckLoadTons} /><i>tons</i>
				</span>
			</label>

			<div class="jf">
				<span>Machine</span>
				<div class="chips">
					{#each machines as m (m.id)}
						<button
							class="chip"
							class:active={job.machineId === m.id}
							onclick={() => (job.machineId = m.id)}
						>
							{m.label}
						</button>
					{/each}
				</div>
			</div>

			<button class="reset" onclick={() => job.reset()}>Reset to defaults</button>
		</div>
	{/if}
</div>

<style>
	.job-bar {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 16px;
		overflow: hidden;
	}
	.job-summary {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		background: none;
		border: 0;
		color: var(--text);
		padding: 14px 14px;
		font-size: 0.88rem;
		text-align: left;
		cursor: pointer;
	}
	.job-icon {
		color: var(--accent);
		font-size: 1.1rem;
	}
	.job-text {
		flex: 1;
		color: var(--text-muted);
	}
	.job-text b {
		color: var(--text);
		font-weight: 700;
	}
	.chev {
		color: var(--text-muted);
	}
	.job-fields {
		padding: 4px 14px 16px;
		border-top: 1px solid var(--border);
	}
	.job-note {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin: 12px 0;
	}
	.jf {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}
	.jf > span:first-child {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.jf-input {
		display: inline-flex;
		align-items: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	.jf-input input {
		width: 90px;
		min-height: 48px;
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: 1.1rem;
		font-weight: 600;
		text-align: right;
		padding: 0 8px;
	}
	.jf-input input:focus {
		outline: none;
	}
	.jf-input i {
		padding: 0 12px;
		font-style: normal;
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	.jf .chips {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.reset {
		background: none;
		border: 0;
		color: var(--text-muted);
		font-size: 0.8rem;
		text-decoration: underline;
		padding: 4px 0;
		cursor: pointer;
	}
</style>
