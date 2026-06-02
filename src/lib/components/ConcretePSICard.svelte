<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import { config } from '$lib/config';

	const psiData = config.concretePsi ?? [];
</script>

<CalcCard
	title="Concrete PSI Quick Reference"
	hideTitle
	purpose="Common concrete strength ratings and their typical applications."
>
	<div class="psi-table">
		{#each psiData as item}
			<div class="psi-row">
				<div class="psi-rating">{item.psi.toLocaleString()} PSI</div>
				<div class="psi-use">{item.label}</div>
				<div class="psi-details">
					<span>Slump: {item.slumpIn}"</span>
					<span>w/c: {item.wcRatio}</span>
				</div>
			</div>
		{/each}
	</div>

	<div class="note">
		<strong>Slump</strong> = measure of consistency (higher = more fluid).
		<strong>w/c ratio</strong> = water-to-cement ratio (lower = stronger).
	</div>
</CalcCard>

<style>
	.psi-table {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 12px 0;
	}
	.psi-row {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px 14px;
	}
	.psi-rating {
		font-size: 1.1rem;
		font-weight: 800;
		color: var(--accent);
		margin-bottom: 4px;
	}
	.psi-use {
		font-size: 0.9rem;
		color: var(--text);
		margin-bottom: 6px;
	}
	.psi-details {
		display: flex;
		gap: 16px;
		font-size: 0.78rem;
		color: var(--text-muted);
	}
	.note {
		margin-top: 12px;
		padding: 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.note strong {
		color: var(--text);
	}
</style>
