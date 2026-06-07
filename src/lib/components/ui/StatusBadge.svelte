<!--
	StatusBadge — project status pill. Maps each status to the existing
	dashboard status colors (.status-active/.status-logging/.status-completed/
	.status-archived/.status-inactive) so it stays consistent with the current
	project cards/table.

	Usage:
		<StatusBadge status={site.status} />
		<StatusBadge status="logging" label="Logging today" />

	`status` is case-insensitive; unknown values fall back to the neutral
	(inactive) treatment. `label` overrides the displayed text (default = status).
-->
<script lang="ts">
	type Status = 'active' | 'completed' | 'archived' | 'logging' | 'inactive';

	let {
		status,
		label
	}: {
		status: string;
		label?: string;
	} = $props();

	const known: Status[] = ['active', 'completed', 'archived', 'logging', 'inactive'];
	const normalized = $derived(status?.toLowerCase() ?? '');
	const tone = $derived(
		(known.includes(normalized as Status) ? normalized : 'inactive') as Status
	);
	const text = $derived(label ?? status ?? '');
</script>

<span class="status-badge status-badge--{tone}">{text}</span>

<style>
	.status-badge {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		border-radius: var(--radius-pill);
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		line-height: 1.2;
		white-space: nowrap;
	}

	.status-badge--active {
		background: var(--good);
		color: var(--accent-text);
	}

	.status-badge--logging {
		background: var(--accent);
		color: var(--accent-text);
	}

	.status-badge--completed {
		background: color-mix(in srgb, var(--good) 22%, transparent);
		color: var(--good);
	}

	.status-badge--archived {
		background: var(--surface-hover);
		color: var(--text-muted);
	}

	.status-badge--inactive {
		background: var(--text-muted);
		color: var(--bg);
	}
</style>
