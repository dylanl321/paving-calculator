<script lang="ts">
	import { statusLabel, type Status } from '$lib/config';

	interface Props {
		status: Status;
		tier?: number | null;
	}
	let { status, tier }: Props = $props();

	const kind = $derived(
		status === 'VERIFIED' ? 'good' : status === 'CONFLICT' ? 'bad' : status === 'NA' ? 'na' : 'warn'
	);
</script>

<span class="source {kind}" title={`Tier ${tier ?? '-'}`}>{statusLabel(status)}</span>

<style>
	.source {
		display: inline-block;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		padding: 2px 8px;
		border-radius: 999px;
	}
	.good {
		background: color-mix(in srgb, var(--good) 20%, transparent);
		color: var(--good);
	}
	.warn {
		background: color-mix(in srgb, var(--warn) 20%, transparent);
		color: var(--warn);
	}
	.bad {
		background: color-mix(in srgb, var(--bad) 20%, transparent);
		color: var(--bad);
	}
	.na {
		background: color-mix(in srgb, var(--text-muted) 18%, transparent);
		color: var(--text-muted);
	}
</style>
