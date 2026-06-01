<script lang="ts">
	import { config } from '$lib/config';
	import JobSiteSettings from '$lib/components/JobSiteSettings.svelte';
	import SpreadRateCard from '$lib/components/SpreadRateCard.svelte';
	import FeetLeftCard from '$lib/components/FeetLeftCard.svelte';
	import DistancePlannerCard from '$lib/components/DistancePlannerCard.svelte';
	import TonnageCard from '$lib/components/TonnageCard.svelte';
	import TackCard from '$lib/components/TackCard.svelte';
	import StickCheckCard from '$lib/components/StickCheckCard.svelte';
	import ProofButton from '$lib/components/ProofButton.svelte';
</script>

<svelte:head>
	<title>{config.app.name}</title>
</svelte:head>

<div class="page-head">
	<h1 class="page-title">Asphalt Calculators</h1>
	<p class="page-sub">{config.app.tagline}</p>
</div>

<JobSiteSettings />

<div class="card-grid">
	<SpreadRateCard />
	<FeetLeftCard />
	<DistancePlannerCard />
	<TonnageCard />
	<TackCard />
	<StickCheckCard />
</div>

<footer class="home-foot">
	<a class="ref-link" href="/calculators">Soil, Concrete & More →</a>
	<a class="ref-link" href="/reference">GDOT Reference Tables →</a>
</footer>

<div class="mobile-proof">
	<ProofButton />
</div>

<style>
	.page-head {
		margin-bottom: 18px;
	}

	.page-title {
		margin: 0;
		font-size: 1.6rem;
		letter-spacing: 0.3px;
	}

	.page-sub {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	/* Desktop: make title smaller since context is clear from sidebar */
	@media (min-width: 1100px) {
		.page-head {
			margin-bottom: 14px;
		}

		.page-title {
			font-size: 1.25rem;
			font-weight: 700;
		}

		.page-sub {
			font-size: 0.8rem;
		}
	}

	.home-foot {
		margin-top: 22px;
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	/* On wide screens the context panel hosts the proof action, so hide the FAB. */
	@media (min-width: 768px) {
		.mobile-proof {
			display: none;
		}
	}
</style>
