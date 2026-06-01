<script lang="ts">
	import { config } from '$lib/config';
	import JobSiteSettings from '$lib/components/JobSiteSettings.svelte';
	import SpreadRateCard from '$lib/components/SpreadRateCard.svelte';
	import FeetLeftCard from '$lib/components/FeetLeftCard.svelte';
	import DistancePlannerCard from '$lib/components/DistancePlannerCard.svelte';
	import TonnageCard from '$lib/components/TonnageCard.svelte';
	import TackCard from '$lib/components/TackCard.svelte';
	import StickCheckCard from '$lib/components/StickCheckCard.svelte';
	import SoilCompactionCard from '$lib/components/SoilCompactionCard.svelte';
	import SubgradeCalcCard from '$lib/components/SubgradeCalcCard.svelte';
	import ConcreteVolumeCard from '$lib/components/ConcreteVolumeCard.svelte';
	import ConcretePSICard from '$lib/components/ConcretePSICard.svelte';
	import SlopeGradeCard from '$lib/components/SlopeGradeCard.svelte';
	import ProofButton from '$lib/components/ProofButton.svelte';

	let asphaltOpen = $state(true);
	let soilOpen = $state(true);
	let concreteOpen = $state(true);
	let gradingOpen = $state(true);
</script>

<svelte:head>
	<title>All Calculators - {config.app.name}</title>
</svelte:head>

<div class="page-head">
	<h1 class="page-title">All Calculators</h1>
	<p class="page-sub">Asphalt, soil, concrete and grading tools</p>
</div>

<JobSiteSettings />

<div class="section">
	<button class="section-toggle" onclick={() => (asphaltOpen = !asphaltOpen)}>
		<span class="toggle-icon">{asphaltOpen ? '▾' : '▸'}</span>
		<h2>Asphalt</h2>
	</button>
	{#if asphaltOpen}
		<div class="card-grid section-content">
			<SpreadRateCard />
			<FeetLeftCard />
			<DistancePlannerCard />
			<TonnageCard />
			<TackCard />
			<StickCheckCard />
		</div>
	{/if}
</div>

<div class="section">
	<button class="section-toggle" onclick={() => (soilOpen = !soilOpen)}>
		<span class="toggle-icon">{soilOpen ? '▾' : '▸'}</span>
		<h2>Soil & Subgrade</h2>
	</button>
	{#if soilOpen}
		<div class="card-grid section-content">
			<SoilCompactionCard />
			<SubgradeCalcCard />
		</div>
	{/if}
</div>

<div class="section">
	<button class="section-toggle" onclick={() => (concreteOpen = !concreteOpen)}>
		<span class="toggle-icon">{concreteOpen ? '▾' : '▸'}</span>
		<h2>Concrete</h2>
	</button>
	{#if concreteOpen}
		<div class="card-grid section-content">
			<ConcreteVolumeCard />
			<ConcretePSICard />
		</div>
	{/if}
</div>

<div class="section">
	<button class="section-toggle" onclick={() => (gradingOpen = !gradingOpen)}>
		<span class="toggle-icon">{gradingOpen ? '▾' : '▸'}</span>
		<h2>Grading</h2>
	</button>
	{#if gradingOpen}
		<div class="card-grid section-content">
			<SlopeGradeCard />
		</div>
	{/if}
</div>

<footer class="home-foot">
	<a class="ref-link" href="/">← Back to Home</a>
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
	.section {
		margin-bottom: 24px;
	}
	.section-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 14px 16px;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s;
	}
	.section-toggle:hover {
		background: var(--surface-alt);
	}
	.toggle-icon {
		font-size: 1rem;
		color: var(--accent);
	}
	.section-toggle h2 {
		margin: 0;
		font-size: 1.4rem;
		color: var(--text);
	}
	.section-content {
		margin-top: 14px;
	}
	.home-foot {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		justify-content: center;
		margin: 24px 0 40px;
	}
	.ref-link {
		font-size: 0.95rem;
		color: var(--accent);
		text-decoration: none;
	}
	@media (min-width: 768px) {
		.mobile-proof {
			display: none;
		}
	}
</style>
