<script lang="ts">
	let { title }: { title: string } = $props();
</script>

<a class="back" href="/">&larr; Home</a>
<section class="screen">
	<h2>{title}</h2>
	<div class="result">
		<div class="label">This calculator is coming soon.</div>
	</div>
	<p class="note">
		Spread Rate and Feet Left Today are live. The remaining calculators are next on the build list
		and already have their formulas and spec values defined in the shared config.
	</p>
</section>
