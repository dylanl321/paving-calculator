<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import SpecAlert from './SpecAlert.svelte';
	import { placementCheck, weatherConfig, temperature } from '$lib/config';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	// Shared inputs from calc context (manual override → job-site → job).
	const thicknessIn = $derived(calcContext.lift_thickness.value);
	const courseTypeCtx = $derived(calcContext.course_type.value);

	const check = $derived.by(() => {
		const temp = weather.effectiveTempF;
		const thickness = thicknessIn;
		if (temp == null || thickness <= 0) return null;
		return placementCheck(temp, thickness);
	});

	const ogfcCheck = $derived.by(() => {
		const temp = weather.effectiveTempF;
		const courseType = courseTypeCtx;
		if (temp == null || (courseType !== 'ogfc' && courseType !== 'pem')) return null;
		const minTemp = weatherConfig.ogfcMinAirTempF;
		if (temp >= minTemp) {
			return { status: 'pass' as const, message: `Air temp OK for ${courseType.toUpperCase()} (min ${minTemp}°F)` };
		}
		if (temp >= minTemp - weatherConfig.tempWarnMarginF) {
			return { status: 'warn' as const, message: `Borderline for ${courseType.toUpperCase()} — ${temp}°F is near ${minTemp}°F minimum` };
		}
		return { status: 'fail' as const, message: `Too cold for ${courseType.toUpperCase()} — ${temp}°F is below ${minTemp}°F minimum` };
	});

	const badge = $derived.by(() => {
		if (thicknessIn <= 0) return null;
		if (check == null) return null;
		if (check.status === 'pass') return { kind: 'good' as const, text: 'Safe to pave' };
		if (check.status === 'warn') return { kind: 'warn' as const, text: 'Borderline' };
		return { kind: 'bad' as const, text: 'Too cold' };
	});

	const minTempDisplay = $derived.by(() => {
		if (thicknessIn <= 0) return null;
		if (check == null) return null;
		return `${check.minTempF}°F`;
	});

	const matchedEntry = $derived.by(() => {
		if (thicknessIn <= 0) return null;
		const sorted = [...temperature].sort((a, b) => a.maxThicknessIn - b.maxThicknessIn);
		return sorted.find((t) => thicknessIn <= t.maxThicknessIn) ?? sorted[sorted.length - 1];
	});

	$effect(() => {
		if (check != null && thicknessIn > 0 && weather.effectiveTempF != null) {
			logDraft.set({
				toolId: 'paving-window',
				entryType: 'note',
				summary: `Paving window: ${check.minTempF}°F min for ${thicknessIn}" lift (current ${weather.effectiveTempF}°F)`,
				fields: {
					notes: check.message
				}
			});
		} else {
			logDraft.clearFor('paving-window');
		}
	});
	onDestroy(() => logDraft.clearFor('paving-window'));
</script>

<CalcCard
	title="Paving Window"
	hideTitle
	purpose="Minimum air temperature required for safe paving at your lift thickness (GDOT Table 4)."
>
	{#if weather.effectiveTempF == null}
		<div class="note-box">
			<p>Set location or enter manual temp in Job Setup to see paving window guidance.</p>
		</div>
	{:else}
		<div class="temp-display">
			<div class="current-temp">
				<span class="label">Current air temp</span>
				<span class="value">{weather.effectiveTempF}°F</span>
			</div>
			{#if thicknessIn > 0}
				<div class="lift-info">
					<span class="label">Lift thickness</span>
					<span class="value">{thicknessIn}"</span>
				</div>
			{/if}
		</div>

		<ResultStat
			value={minTempDisplay}
			unit="min. air temp for this lift"
			badge={badge}
		/>

		{#if check != null}
			<SpecAlert status={check.status} message={check.message} clause={check.clause} clauseTitle={check.clauseTitle} guidance={check.guidance} />
		{/if}

		{#if ogfcCheck != null}
			<div class="ogfc-check" class:pass={ogfcCheck.status === 'pass'} class:warn={ogfcCheck.status === 'warn'} class:fail={ogfcCheck.status === 'fail'}>
				<strong>{courseTypeCtx.toUpperCase()} check:</strong> {ogfcCheck.message}
			</div>
		{/if}
	{/if}

	<ShowWork>
		<p>
			This uses <strong>GDOT §400.3.05.E Table 4</strong> (p.382) to look up the minimum air
			temperature for the entered lift thickness. No arithmetic formula — it is a direct table lookup.
		</p>
		{#if matchedEntry}
			<div class="matched-row">
				<strong>Matched row:</strong> Lifts up to {matchedEntry.maxThicknessIn}" require {matchedEntry.minAirTempF}°F minimum
				<div class="src-row">
					<SourceBadge status={matchedEntry.status} tier={matchedEntry.tier} />
				</div>
			</div>
		{/if}

		<div class="table-reference">
			<h4>Full GDOT Table 4 Reference</h4>
			<table>
				<thead>
					<tr>
						<th>Max lift thickness</th>
						<th>Min air temp</th>
						<th>Source</th>
					</tr>
				</thead>
				<tbody>
					{#each temperature as row}
						<tr class:active={matchedEntry?.id === row.id}>
							<td>≤ {row.maxThicknessIn}"</td>
							<td>{row.minAirTempF}°F</td>
							<td><SourceBadge status={row.status} tier={row.tier} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</ShowWork>
</CalcCard>

<style>
	.note-box {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--sp-4);
		margin: var(--sp-3) 0;
	}
	.note-box p {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.temp-display {
		display: flex;
		gap: var(--sp-4);
		margin-bottom: var(--sp-4);
		padding: var(--sp-4);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.temp-display > div {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}
	.temp-display .label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.temp-display .value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}
	.status-message {
		margin-top: var(--sp-3);
		padding: var(--sp-3);
		border-radius: var(--radius-lg);
		font-size: var(--fs-sm);
		line-height: 1.4;
	}
	.status-message.pass {
		background: color-mix(in srgb, var(--good) 12%, transparent);
		color: var(--good);
	}
	.status-message.warn {
		background: color-mix(in srgb, var(--warn) 12%, transparent);
		color: var(--warn);
	}
	.status-message.fail {
		background: color-mix(in srgb, var(--bad) 12%, transparent);
		color: var(--bad);
	}
	.ogfc-check {
		margin-top: var(--sp-3);
		padding: var(--sp-3);
		border-radius: var(--radius-lg);
		font-size: var(--fs-sm);
		line-height: 1.4;
		border: 1px solid var(--border);
	}
	.ogfc-check.pass {
		background: color-mix(in srgb, var(--good) 8%, transparent);
		border-color: var(--good);
	}
	.ogfc-check.warn {
		background: color-mix(in srgb, var(--warn) 8%, transparent);
		border-color: var(--warn);
	}
	.ogfc-check.fail {
		background: color-mix(in srgb, var(--bad) 8%, transparent);
		border-color: var(--bad);
	}
	.matched-row {
		margin-top: var(--sp-3);
		padding: var(--sp-3);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		font-size: var(--fs-sm);
	}
	.table-reference {
		margin-top: var(--sp-4);
	}
	.table-reference h4 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-sm);
		font-weight: var(--fw-bold);
		color: var(--text);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-sm);
	}
	th {
		text-align: left;
		padding: var(--sp-2);
		border-bottom: 2px solid var(--border);
		color: var(--text-muted);
		font-weight: var(--fw-bold);
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	td {
		padding: var(--sp-2);
		border-bottom: 1px solid var(--border);
		color: var(--text);
	}
	tr.active {
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}
	tr.active td {
		color: var(--accent);
		font-weight: var(--fw-bold);
	}
</style>
