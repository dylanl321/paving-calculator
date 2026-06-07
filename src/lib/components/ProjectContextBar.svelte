<!--
	ProjectContextBar — a slim, persistent wayfinding strip shown on every project
	subpage (detail + daily log). Tells the user which project they're in and its
	state at a glance, beyond breadcrumbs:

		Name · Status · Customer · Contract value · Route/County · Today's Log · Setup

	Every field degrades to nothing when its data is absent, so the bar stays
	compact for thin projects and rich for fully-set-up ones. Token-only styling;
	wraps on tablet and horizontally scrolls on phones. Values are passed in from
	the already-loaded page data — this component fetches nothing.
-->
<script lang="ts">
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	let {
		name,
		status,
		href,
		customer = null,
		contractValue = null,
		routeDesignation = null,
		county = null,
		todayLogState = null,
		setupScore = null
	}: {
		name: string;
		status: string;
		/** Optional link back to the project detail page (used on subpages). */
		href?: string;
		customer?: string | null;
		contractValue?: number | null;
		routeDesignation?: string | null;
		county?: string | null;
		/** Today's daily-log state, e.g. "Logging", "Closed", "Not started". */
		todayLogState?: string | null;
		/** Project setup completeness as a 0–100 score. */
		setupScore?: number | null;
	} = $props();

	const contractDisplay = $derived(
		contractValue != null && contractValue > 0
			? '$' + contractValue.toLocaleString('en-US', { maximumFractionDigits: 0 })
			: null
	);

	const routeDisplay = $derived(
		routeDesignation && county
			? `${routeDesignation} · ${county}`
			: (routeDesignation ?? (county ? `${county} County` : null))
	);

	const setupTone = $derived(
		setupScore == null
			? 'flat'
			: setupScore >= 90
				? 'good'
				: setupScore >= 60
					? 'warn'
					: 'bad'
	);
</script>

<div class="ctx-bar" aria-label="Project context">
	<div class="ctx-bar__primary">
		{#if href}
			<a class="ctx-bar__name" {href}>{name}</a>
		{:else}
			<span class="ctx-bar__name">{name}</span>
		{/if}
		<StatusBadge {status} />
	</div>

	<div class="ctx-bar__fields">
		{#if customer}
			<span class="ctx-field">
				<span class="ctx-field__label">Customer</span>
				<span class="ctx-field__value">{customer}</span>
			</span>
		{/if}
		{#if contractDisplay}
			<span class="ctx-field">
				<span class="ctx-field__label">Contract</span>
				<span class="ctx-field__value">{contractDisplay}</span>
			</span>
		{/if}
		{#if routeDisplay}
			<span class="ctx-field">
				<span class="ctx-field__label">Route</span>
				<span class="ctx-field__value">{routeDisplay}</span>
			</span>
		{/if}
		{#if todayLogState}
			<span class="ctx-field">
				<span class="ctx-field__label">Today's Log</span>
				<span class="ctx-field__value">{todayLogState}</span>
			</span>
		{/if}
		{#if setupScore != null}
			<span class="ctx-field">
				<span class="ctx-field__label">Setup</span>
				<span class="ctx-field__value ctx-field__value--{setupTone}">{setupScore}%</span>
			</span>
		{/if}
	</div>
</div>

<style>
	.ctx-bar {
		display: flex;
		align-items: center;
		gap: var(--sp-3) var(--sp-5);
		flex-wrap: wrap;
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-4);
		min-width: 0;
	}

	.ctx-bar__primary {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
		flex-shrink: 0;
	}

	.ctx-bar__name {
		font-size: var(--fs-md);
		font-weight: var(--fw-bold);
		color: var(--text);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 40ch;
	}

	a.ctx-bar__name:hover {
		color: var(--accent);
	}

	.ctx-bar__fields {
		display: flex;
		align-items: center;
		gap: var(--sp-2) var(--sp-5);
		flex-wrap: wrap;
		min-width: 0;
	}

	.ctx-field {
		display: inline-flex;
		align-items: baseline;
		gap: var(--sp-2);
		min-width: 0;
		white-space: nowrap;
	}

	.ctx-field__label {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-muted);
	}

	.ctx-field__value {
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		color: var(--text);
		font-variant-numeric: tabular-nums;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 28ch;
	}

	.ctx-field__value--good {
		color: var(--good);
	}
	.ctx-field__value--warn {
		color: var(--warn);
	}
	.ctx-field__value--bad {
		color: var(--bad);
	}

	/* On phones, keep the secondary fields on one swipeable row instead of
	   stacking into a tall block. */
	@media (max-width: 640px) {
		.ctx-bar {
			flex-wrap: nowrap;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
		}

		.ctx-bar::-webkit-scrollbar {
			display: none;
		}

		.ctx-bar__fields {
			flex-wrap: nowrap;
		}
	}
</style>
