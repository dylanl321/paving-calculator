<!--
	StatTile — a compact, scannable stat readout (Stripe-dense). A small
	uppercase label, a large tabular-nums value with an optional unit, and an
	optional small trend indicator. Fixed height so a row of StatTiles aligns.

	Renders as a 48px-min link when `href` is given. Token-driven only.

	Usage:
		<StatTile label="Contract value" value="$1.2M" />
		<StatTile label="Placed" value={42} unit="tons" trend="up" trendLabel="+8%" />
		<StatTile label="Active jobs" value={6} accent href="/dashboard/projects" />
-->
<script lang="ts">
	let {
		label,
		value,
		unit,
		trend,
		trendLabel,
		accent = false,
		href
	}: {
		label: string;
		value: string | number;
		unit?: string;
		trend?: 'up' | 'down' | 'flat';
		trendLabel?: string;
		accent?: boolean;
		href?: string;
	} = $props();

	const trendTone = $derived(
		trend === 'up' ? 'good' : trend === 'down' ? 'bad' : 'flat'
	);
	const trendGlyph = $derived(trend === 'up' ? '▲' : trend === 'down' ? '▼' : '–');
	const hasTrend = $derived(Boolean(trend || trendLabel));
</script>

{#snippet body()}
	<span class="stat-tile__label">{label}</span>
	<span class="stat-tile__value">
		<span class="stat-tile__num">{value}</span>
		{#if unit}<span class="stat-tile__unit">{unit}</span>{/if}
	</span>
	{#if hasTrend}
		<span class="stat-tile__trend stat-tile__trend--{trendTone}">
			{#if trend}<span class="stat-tile__trend-glyph" aria-hidden="true">{trendGlyph}</span>{/if}
			{#if trendLabel}<span class="stat-tile__trend-label">{trendLabel}</span>{/if}
		</span>
	{/if}
{/snippet}

{#if href}
	<a {href} class="stat-tile stat-tile--link" class:stat-tile--accent={accent}>
		{@render body()}
	</a>
{:else}
	<div class="stat-tile" class:stat-tile--accent={accent}>
		{@render body()}
	</div>
{/if}

<style>
	.stat-tile {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--sp-1);
		min-height: 92px;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		min-width: 0;
	}

	.stat-tile--accent {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
	}

	.stat-tile--link {
		/* Link variant keeps a comfortable touch target. */
		min-height: max(92px, var(--touch));
		transition:
			border-color var(--dur) var(--ease),
			transform var(--dur) var(--ease),
			box-shadow var(--dur) var(--ease);
	}

	.stat-tile--link:hover {
		border-color: var(--accent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.stat-tile--link:hover {
			transform: translateY(-2px);
			box-shadow: var(--shadow-sm);
		}
	}

	.stat-tile__label {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.7px;
		color: var(--text-muted);
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.stat-tile__value {
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
		min-width: 0;
	}

	.stat-tile__num {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-bold);
		line-height: 1.05;
		font-variant-numeric: tabular-nums;
		font-feature-settings: 'tnum' 1;
		color: var(--text);
		overflow-wrap: anywhere;
	}

	.stat-tile--accent .stat-tile__num {
		color: var(--accent);
	}

	.stat-tile__unit {
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.stat-tile__trend {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}

	.stat-tile__trend--good {
		color: var(--good);
	}
	.stat-tile__trend--bad {
		color: var(--bad);
	}
	.stat-tile__trend--flat {
		color: var(--text-muted);
	}

	.stat-tile__trend-glyph {
		font-size: var(--fs-2xs);
		line-height: 1;
	}
</style>
