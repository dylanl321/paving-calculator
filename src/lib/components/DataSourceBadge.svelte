<script lang="ts">
	interface Props {
		source: 'route' | 'manual' | 'none';
	}
	let { source }: Props = $props();

	const label = $derived(
		source === 'route' ? 'GPS route' : source === 'manual' ? 'Manual' : null
	);
	const kind = $derived(source === 'route' ? 'route' : 'manual');
</script>

{#if label}
	<span class="data-source {kind}">{label}</span>
{/if}

<style>
	.data-source {
		display: inline-block;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		padding: 2px 8px;
		border-radius: 999px;
		margin-left: 6px;
	}
	.route {
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		color: var(--accent);
	}
	.manual {
		background: color-mix(in srgb, var(--text-muted) 18%, transparent);
		color: var(--text-muted);
	}
</style>
