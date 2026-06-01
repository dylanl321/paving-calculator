<script lang="ts">
	import { config } from '$lib/config';
	import JobSetupBar from '$lib/components/JobSetupBar.svelte';
	import SpreadRateCard from '$lib/components/SpreadRateCard.svelte';
	import FeetLeftCard from '$lib/components/FeetLeftCard.svelte';
	import TonnageCard from '$lib/components/TonnageCard.svelte';
	import TackCard from '$lib/components/TackCard.svelte';
	import StickCheckCard from '$lib/components/StickCheckCard.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import ProofButton from '$lib/components/ProofButton.svelte';
</script>

<svelte:head>
	<title>{config.app.name}</title>
</svelte:head>

<header class="topbar">
	<img src="/icons/icon-192.png" alt="Paverate" />
	<div class="topbar-content">
		<h1>{config.app.name}</h1>
		<p class="tagline">{config.app.tagline}</p>
	</div>
	<ThemeToggle />
</header>

<JobSetupBar />

<SpreadRateCard />
<FeetLeftCard />
<TonnageCard />
<TackCard />
<StickCheckCard />

<footer class="home-foot">
	<a class="ref-link" href="/reference">GDOT Reference Tables →</a>
	<p class="ref-note">
		Soil / Cement &amp; aggregate tools are on the build list. Values, formulas and spec sources all
		live in one config file.
	</p>
</footer>

<ProofButton />
