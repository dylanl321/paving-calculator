<!--
	ProgressBar — a thin labeled progress meter for the dashboard home modules
	(placed vs target/awarded, job progress). Token-driven; tone shifts the fill
	color so "behind" reads as a warning. Value is clamped to 0–100.
-->
<script lang="ts">
	let {
		pct,
		tone = 'accent',
		height = '8px'
	}: {
		pct: number;
		tone?: 'accent' | 'good' | 'warn' | 'bad';
		height?: string;
	} = $props();

	const clamped = $derived(Math.max(0, Math.min(100, pct)));
</script>

<div
	class="bar"
	style="--bar-h:{height};"
	role="progressbar"
	aria-valuenow={Math.round(clamped)}
	aria-valuemin="0"
	aria-valuemax="100"
>
	<span class="bar__fill bar__fill--{tone}" style="width:{clamped}%"></span>
</div>

<style>
	.bar {
		width: 100%;
		height: var(--bar-h, 8px);
		background: var(--surface-hover);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.bar__fill {
		display: block;
		height: 100%;
		border-radius: var(--radius-pill);
		transition: width var(--dur) var(--ease);
	}

	.bar__fill--accent {
		background: var(--accent);
	}
	.bar__fill--good {
		background: var(--good);
	}
	.bar__fill--warn {
		background: var(--warn);
	}
	.bar__fill--bad {
		background: var(--bad);
	}
</style>
