<script lang="ts">
	import SpreadRateCard from './SpreadRateCard.svelte';
	import BatchSpreadRateCheck from './BatchSpreadRateCheck.svelte';
	import StickCheckCard from './StickCheckCard.svelte';
	import FeetLeftCard from './FeetLeftCard.svelte';
</script>

<div class="screed-view">
	<header class="screed-header">
		<div class="screed-title-row">
			<span class="screed-icon" aria-hidden="true">🔧</span>
			<h1 class="screed-title">Screed Tools</h1>
			<span class="role-badge">Screed Man</span>
		</div>
		<p class="screed-subtitle">Field calculator view</p>
	</header>

	<div class="screed-cards">
		<section class="card-section" aria-label="Spread Rate">
			<SpreadRateCard />
		</section>

		<section class="card-section" aria-label="Batch Spread Rate Check">
			<BatchSpreadRateCheck />
		</section>

		<section class="card-section" aria-label="Stick Check">
			<StickCheckCard />
		</section>

		<section class="card-section" aria-label="Feet Left Today">
			<FeetLeftCard />
		</section>
	</div>
</div>

<style>
	.screed-view {
		padding: 16px;
		min-height: 100vh;
	}

	.screed-header {
		margin-bottom: 20px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--border);
	}

	.screed-title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}

	.screed-icon {
		font-size: 1.4rem;
		line-height: 1;
	}

	.screed-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text);
		margin: 0;
		flex: 1;
	}

	.role-badge {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--accent);
		color: var(--accent-text, #fff);
		padding: 3px 8px;
		border-radius: 4px;
		white-space: nowrap;
	}

	.screed-subtitle {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin: 0;
	}

	.screed-cards {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.card-section {
		/* Cards manage their own padding/border; this section just spaces them */
	}
</style>
