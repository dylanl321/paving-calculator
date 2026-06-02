<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import DotTable from './DotTable.svelte';
	import { tack, tackMid, rainCheck, weatherConfig } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { tackGallons } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	let lengthFt = $state<number | null>(null);

	function clearInputs() {
		lengthFt = null;
		logDraft.clearFor('tack');
	}

	const selected = $derived(
		tack.field.find((t) => t.id === job.tackApplication) ?? tack.field[0]
	);

	const area = $derived(lengthFt && job.widthFt ? (lengthFt * job.widthFt) / 9 : null);

	const gallons = $derived.by(() => {
		if (!area) return null;
		return {
			min: tackGallons(lengthFt!, job.widthFt, selected.min),
			mid: tackGallons(lengthFt!, job.widthFt, tackMid(selected)),
			max: tackGallons(lengthFt!, job.widthFt, selected.max)
		};
	});

	const rain = $derived(rainCheck(weather.rainNext24hIn));
	const tackBlocked = $derived(
		weatherConfig.wetSurfaceBlocked &&
			(rain?.status === 'fail' || weather.isRaining)
	);

	$effect(() => {
		if (gallons != null && !tackBlocked && lengthFt) {
			const mid = Math.round(gallons.mid);
			logDraft.set({
				toolId: 'tack',
				entryType: 'tack',
				summary: `${mid} gal over ${lengthFt} ft (${selected.label})`,
				fields: {
					tack_gallons: mid,
					distance_ft: lengthFt,
					notes: `${selected.label} tack`
				}
			});
		} else {
			logDraft.clearFor('tack');
		}
	});
	onDestroy(() => logDraft.clearFor('tack'));</script>

<CalcCard
	title="Tack Rate"
	hideTitle
	purpose="Gallons of tack to shoot for an area. Shows the safe min–max window for the chosen application, with the mid-rate as the suggested amount."
>
	<NumberField label="Length to shoot" unit="ft" bind:value={lengthFt} />

	<div class="width-note">Using job width: <strong>{job.widthFt} ft</strong></div>

	{#if tackBlocked}
		<div class="weather-warn fail">
			{#if weather.isRaining}
				Raining now — do not tack on a wet surface.
			{:else if rain}
				{rain.message}
			{/if}
		</div>
	{:else if rain?.status === 'warn'}
		<div class="weather-warn warn">{rain.message}</div>
	{/if}

	<div class="apps">
		<span class="apps-label">Application</span>
		<div class="chips">
			{#each tack.field as t (t.id)}
				<button
					class="chip"
					class:active={job.tackApplication === t.id}
					onclick={() => (job.tackApplication = t.id)}
				>
					{t.label}
				</button>
			{/each}
		</div>
		<div class="rate-display">
			{selected.label}: <strong>{selected.min}–{selected.max} gal/SY</strong>
		</div>
	</div>

	{#if job.widthFt}
		<div class="width-confirm">Using <strong>{job.widthFt} ft</strong> width</div>
	{:else}
		<div class="width-warn">Set road width in job settings to calculate tack gallons.</div>
	{/if}

	<ResultStat
		value={gallons != null && !tackBlocked ? Math.round(gallons.mid).toLocaleString() : null}
		unit="gal (suggested mid-rate)"
		secondary={gallons != null && !tackBlocked
			? `Range: ${Math.round(gallons.min)}–${Math.round(gallons.max)} gal`
			: tackBlocked
				? 'Blocked — dry surface required'
				: null}
		badge={tackBlocked ? { kind: 'bad', text: 'Wet surface — no tack' } : null}
	/>

	<ShowWork>
		<p>Using job width: <strong>{job.widthFt} ft</strong></p>
		<code>gallons = (length × width ÷ 9) × shot rate (gal/SY)</code>
		<p>Width in use: <strong>{job.widthFt} ft</strong> (from job settings).</p>
		<p>{selected.label}: {selected.min}–{selected.max} gal/SY.</p>
		<div class="src-row">Tack range source: <SourceBadge status={selected.status} tier={selected.tier} /></div>
		<DotTable tableId="table-2" />
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.btn-clear {
		width: 100%;
		min-height: 3rem;
		padding: 0.75rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-clear:hover {
		background: var(--surface-alt);
		color: var(--text);
	}


	.apps {
		margin-bottom: 16px;
	}
	.apps-label {
		display: block;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 8px;
	}
	.apps .chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.rate-display {
		margin-top: 10px;
		padding: 10px 12px;
		background: var(--surface-alt);
		border-radius: 8px;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.rate-display strong {
		color: var(--accent);
		font-weight: 700;
	}
	.width-note {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 12px;
	}
	.width-note strong {
		color: var(--text);
	}
	.weather-warn {
		font-size: 0.85rem;
		padding: 10px 12px;
		border-radius: 10px;
		margin-bottom: 12px;
		line-height: 1.35;
	}
	.weather-warn.warn {
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.weather-warn.fail {
		background: color-mix(in srgb, var(--bad) 18%, transparent);
		color: var(--bad);
		font-weight: 600;
	}
	.width-confirm {
		font-size: 0.85rem;
		padding: 8px 12px;
		background: var(--surface-alt);
		border-radius: 8px;
		color: var(--text-muted);
		margin-bottom: 12px;
	}
	.width-confirm strong {
		color: var(--accent);
		font-weight: 700;
	}
	.width-warn {
		font-size: 0.85rem;
		padding: 8px 12px;
		border-radius: 8px;
		margin-bottom: 12px;
		background: color-mix(in srgb, var(--warn) 14%, transparent);
		color: var(--warn);
	}
</style>
