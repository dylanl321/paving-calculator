<script lang="ts">
	import { config } from '$lib/config';
	import { OVERRIDABLE_CONSTANTS, constantDefault } from '$lib/config/overrides';
	import type { RangeEntry } from '$lib/config';
	import SpecAlert from '$lib/components/SpecAlert.svelte';

	let {
		canEdit,
		roadWidthFt = $bindable(),
		truckLoadTons = $bindable(),
		machine = $bindable(),
		wastePct = $bindable(),
		tackApplication = $bindable(),
		courseType = $bindable(),
		liftThicknessIn = $bindable(),
		mixType = $bindable(),
		defaultPlant = $bindable(),
		defaultCrewSize = $bindable(),
		pavingWindowStart = $bindable(),
		pavingWindowEnd = $bindable(),
		minPavingTempF = $bindable(),
		maxPavingTempF = $bindable(),
		minMatTempF = $bindable(),
		defaultCompactionPasses = $bindable(),
		constants = $bindable(),
		tackField = $bindable(),
		tackSpec = $bindable(),
		spreadTolerances = $bindable()
	}: {
		canEdit: boolean;
		roadWidthFt: number;
		truckLoadTons: number;
		machine: string;
		wastePct: number;
		tackApplication: string;
		courseType: string;
		liftThicknessIn: number;
		mixType: string;
		defaultPlant: string;
		defaultCrewSize: number;
		pavingWindowStart: string;
		pavingWindowEnd: string;
		minPavingTempF: number;
		maxPavingTempF: number;
		minMatTempF: number;
		defaultCompactionPasses: number;
		constants: Record<string, number>;
		tackField: RangeEntry[];
		tackSpec: RangeEntry[];
		spreadTolerances: Record<string, number>;
	} = $props();

	const machines = config.machines;
	const tackApplications = config.tack.field;
	const courseTypes = config.spreadTolerance;
	const constantKeys = Object.keys(OVERRIDABLE_CONSTANTS);

	// GDOT spec constants for lift thickness validation
	const GDOT_MIN_LIFT_IN = 1.5;
	const GDOT_MAX_LIFT_IN = 4.0;
	const THICK_MULT = config.constants.THICK_MULT.value;

	// Derived validation values
	const liftThicknessWarn = $derived(liftThicknessIn < GDOT_MIN_LIFT_IN || liftThicknessIn > GDOT_MAX_LIFT_IN);
	const spreadRateTarget = $derived(liftThicknessIn * THICK_MULT);
	const spreadRateWarn = $derived(spreadRateTarget < 165 || spreadRateTarget > 440);

	function isConstOverridden(key: string): boolean {
		return constants[key] !== constantDefault(key);
	}
	function isDefaultOverridden(key: string, current: number | string): boolean {
		return current !== (config.defaults as Record<string, unknown>)[key];
	}

	function resetConstant(key: string) {
		constants[key] = constantDefault(key);
	}

	function isToleranceOverridden(courseId: string): boolean {
		const yamlDefault = courseTypes.find((c) => c.id === courseId)?.toleranceLbsSy ?? 0;
		return spreadTolerances[courseId] !== undefined && spreadTolerances[courseId] !== yamlDefault;
	}
</script>

<section class="card">
	<h3>Default job setup</h3>
	<p class="card-desc">
		New jobs start from these values. They override the app defaults for your org.
	</p>

	<div class="grid">
		<div class="field">
			<label for="liftThickness">Lift thickness (in) {#if isDefaultOverridden('liftThicknessIn', liftThicknessIn)}<span class="badge">Overridden</span>{/if}</label>
			<input id="liftThickness" type="number" step="0.5" min="0.5" max="10" bind:value={liftThicknessIn} disabled={!canEdit} />
		</div>
		<div class="field wide">
			{#if liftThicknessWarn}
				<SpecAlert
					status="warn"
					message="Lift thickness {liftThicknessIn.toFixed(1)} in is outside GDOT single-lift range ({GDOT_MIN_LIFT_IN}–{GDOT_MAX_LIFT_IN} in)"
					guidance="GDOT Table 5 limits single lifts to {GDOT_MIN_LIFT_IN}–{GDOT_MAX_LIFT_IN} in for standard HMA mixes."
					clause="GDOT Table 5"
				/>
			{/if}
			<div class="hint" style="margin-top: 8px;">
				Target spread rate: {Math.round(spreadRateTarget)} lbs/SY
				{#if spreadRateWarn}
					<span style="color: var(--warn); font-weight: 600;"> (outside typical 165–440 lbs/SY range)</span>
				{/if}
			</div>
		</div>
		<div class="field">
			<label for="mixType">Mix type {#if mixType.trim()}<span class="badge">Set</span>{/if}</label>
			<input id="mixType" type="text" bind:value={mixType} disabled={!canEdit} placeholder="e.g. 9.5mm Superpave" />
		</div>
		<div class="field">
			<label for="roadWidth">Road width (ft) {#if isDefaultOverridden('roadWidthFt', roadWidthFt)}<span class="badge">Overridden</span>{/if}</label>
			<input id="roadWidth" type="number" step="0.5" min="1" max="60" bind:value={roadWidthFt} disabled={!canEdit} />
		</div>
		<div class="field">
			<label for="truckLoad">Truck load (tons) {#if isDefaultOverridden('truckLoadTons', truckLoadTons)}<span class="badge">Overridden</span>{/if}</label>
			<input id="truckLoad" type="number" step="0.5" min="1" max="40" bind:value={truckLoadTons} disabled={!canEdit} />
		</div>
		<div class="field">
			<label for="machine">Default machine {#if isDefaultOverridden('machine', machine)}<span class="badge">Overridden</span>{/if}</label>
			<select id="machine" bind:value={machine} disabled={!canEdit}>
				{#each machines as m (m.id)}
					<option value={m.id}>{m.label}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="waste">Waste % {#if isDefaultOverridden('wastePct', wastePct)}<span class="badge">Overridden</span>{/if}</label>
			<input id="waste" type="number" step="1" min="0" max="50" bind:value={wastePct} disabled={!canEdit} />
		</div>
		<div class="field wide">
			<label for="tackApp">Default tack application {#if isDefaultOverridden('tackApplication', tackApplication)}<span class="badge">Overridden</span>{/if}</label>
			<select id="tackApp" bind:value={tackApplication} disabled={!canEdit}>
				{#each tackApplications as t (t.id)}
					<option value={t.id}>{t.label} ({t.min}–{t.max} {t.unit})</option>
				{/each}
			</select>
		</div>
		<div class="field wide">
			<label for="courseType">Default course type {#if isDefaultOverridden('courseType', courseType)}<span class="badge">Overridden</span>{/if}</label>
			<select id="courseType" bind:value={courseType} disabled={!canEdit}>
				{#each courseTypes as c (c.id)}
					<option value={c.id}>{c.label} (±{c.toleranceLbsSy} lbs/SY)</option>
				{/each}
			</select>
		</div>
	</div>
</section>

<!-- Operations -->
<section class="card">
	<h3>Operations</h3>
	<p class="card-desc">
		Operational parameters like plant, crew, paving window, and temperature constraints.
	</p>

	<div class="grid">
		<div class="field wide">
			<label for="defaultPlant">Default plant {#if defaultPlant.trim()}<span class="badge">Set</span>{/if}</label>
			<input id="defaultPlant" type="text" bind:value={defaultPlant} disabled={!canEdit} placeholder="e.g. Atlanta Paving Supply" />
		</div>
		<div class="field">
			<label for="defaultCrewSize">Default crew size {#if isDefaultOverridden('defaultCrewSize', defaultCrewSize)}<span class="badge">Overridden</span>{/if}</label>
			<input id="defaultCrewSize" type="number" step="1" min="1" max="50" bind:value={defaultCrewSize} disabled={!canEdit} />
		</div>
		<div class="field">
			<label for="pavingWindowStart">Paving window start (24h) {#if pavingWindowStart.trim() && pavingWindowStart !== '06:00'}<span class="badge">Set</span>{/if}</label>
			<input id="pavingWindowStart" type="time" bind:value={pavingWindowStart} disabled={!canEdit} />
		</div>
		<div class="field">
			<label for="pavingWindowEnd">Paving window end (24h) {#if pavingWindowEnd.trim() && pavingWindowEnd !== '18:00'}<span class="badge">Set</span>{/if}</label>
			<input id="pavingWindowEnd" type="time" bind:value={pavingWindowEnd} disabled={!canEdit} />
		</div>
		<div class="field">
			<label for="minPavingTempF">Min ambient temp for paving (°F) {#if isDefaultOverridden('minPavingTempF', minPavingTempF)}<span class="badge">Overridden</span>{/if}</label>
			<input id="minPavingTempF" type="number" step="1" min="20" max="80" bind:value={minPavingTempF} disabled={!canEdit} />
		</div>
		<div class="field">
			<label for="maxPavingTempF">Max ambient temp for paving (°F) {#if isDefaultOverridden('maxPavingTempF', maxPavingTempF)}<span class="badge">Overridden</span>{/if}</label>
			<input id="maxPavingTempF" type="number" step="1" min="80" max="150" bind:value={maxPavingTempF} disabled={!canEdit} />
		</div>
		<div class="field">
			<label for="minMatTempF">Min material temp at laydown (°F) {#if isDefaultOverridden('minMatTempF', minMatTempF)}<span class="badge">Overridden</span>{/if}</label>
			<input id="minMatTempF" type="number" step="1" min="200" max="350" bind:value={minMatTempF} disabled={!canEdit} />
		</div>
		<div class="field">
			<label for="defaultCompactionPasses">Default compaction passes {#if isDefaultOverridden('defaultCompactionPasses', defaultCompactionPasses)}<span class="badge">Overridden</span>{/if}</label>
			<input id="defaultCompactionPasses" type="number" step="1" min="1" max="20" bind:value={defaultCompactionPasses} disabled={!canEdit} />
		</div>
	</div>
</section>

<!-- Calculation constants -->
<section class="card">
	<h3>Calculation constants</h3>
	<p class="card-desc">
		Defaults are GDOT-derived. Only change these if your operation uses different values —
		they affect calculator results for everyone in your org.
	</p>

	<div class="grid">
		{#each constantKeys as key (key)}
			<div class="field">
				<label for={`const-${key}`}>
					{OVERRIDABLE_CONSTANTS[key].label}
					{#if isConstOverridden(key)}<span class="badge">Overridden</span>{/if}
				</label>
				<div class="const-row">
					<input
						id={`const-${key}`}
						type="number"
						step="0.05"
						min={OVERRIDABLE_CONSTANTS[key].min}
						max={OVERRIDABLE_CONSTANTS[key].max}
						bind:value={constants[key]}
						disabled={!canEdit}
					/>
					{#if canEdit && isConstOverridden(key)}
						<button type="button" class="reset-btn" onclick={() => resetConstant(key)}>Reset</button>
					{/if}
				</div>
				<span class="hint">Default {constantDefault(key)} · allowed {OVERRIDABLE_CONSTANTS[key].min}–{OVERRIDABLE_CONSTANTS[key].max}</span>
			</div>
		{/each}
	</div>
</section>

<!-- Spread rate tolerances -->
<section class="card">
	<h3>Spread rate tolerances</h3>
	<p class="card-desc">
		GDOT Table 12 spread rate tolerances (lbs/SY) for each course type. Override these to
		apply tighter or looser tolerances for your organization.
	</p>

	<div class="tolerance-grid">
		{#each courseTypes as c (c.id)}
			{@const current = spreadTolerances[c.id] ?? c.toleranceLbsSy}
			<div class="tolerance-row">
				<div class="tolerance-label">
					<span class="tolerance-name">{c.label}</span>
					{#if isToleranceOverridden(c.id)}
						<span class="badge">Overridden</span>
					{/if}
				</div>
				<div class="tolerance-inputs">
					<span class="tolerance-default">Default: ±{c.toleranceLbsSy} lbs/SY</span>
					<label class="tolerance-input-label">
						Override (lbs/SY)
						<input
							type="number"
							step="1"
							min="1"
							max="500"
							bind:value={spreadTolerances[c.id]}
							placeholder={String(c.toleranceLbsSy)}
							disabled={!canEdit}
						/>
					</label>
				</div>
			</div>
		{/each}
	</div>
</section>

<!-- Tack presets -->
<section class="card">
	<h3>Tack rate presets</h3>
	<p class="card-desc">Min/max shot-rate ranges (gal/SY) suggested in the tack calculator.</p>

	<div class="tack-group">
		<h4>Field ranges</h4>
		{#each tackField as t, i (t.id)}
			<div class="tack-row">
				<span class="tack-name">{t.label}</span>
				<label class="mini">min<input type="number" step="0.005" min="0" max="5" bind:value={tackField[i].min} disabled={!canEdit} /></label>
				<label class="mini">max<input type="number" step="0.005" min="0" max="5" bind:value={tackField[i].max} disabled={!canEdit} /></label>
			</div>
		{/each}
	</div>

	<div class="tack-group">
		<h4>Spec ranges</h4>
		{#each tackSpec as t, i (t.id)}
			<div class="tack-row">
				<span class="tack-name">{t.label}</span>
				<label class="mini">min<input type="number" step="0.005" min="0" max="5" bind:value={tackSpec[i].min} disabled={!canEdit} /></label>
				<label class="mini">max<input type="number" step="0.005" min="0" max="5" bind:value={tackSpec[i].max} disabled={!canEdit} /></label>
			</div>
		{/each}
	</div>
</section>

<style>
	.grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-md);
	}

	@media (min-width: 640px) {
		.grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 1024px) {
		.grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.field.wide {
		grid-column: 1 / -1;
	}

	.const-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.reset-btn {
		min-height: 48px;
		padding: 0 12px;
		background: transparent;
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.82rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.reset-btn:hover {
		color: var(--text);
		border-color: var(--accent);
	}

	.tack-group {
		margin-top: 14px;
	}

	.tack-group h4 {
		margin: 0 0 8px;
		font-size: 0.95rem;
		color: var(--text);
	}

	.tack-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-top: 1px solid var(--border);
	}

	.tack-name {
		flex: 1;
		min-width: 0;
		color: var(--text);
		font-size: 0.9rem;
	}

	.mini {
		flex-direction: row;
		align-items: center;
		gap: 6px;
		font-size: 0.78rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.mini input {
		width: 92px;
		min-height: 44px;
	}

	.tolerance-grid {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 12px;
	}

	.tolerance-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0;
		border-top: 1px solid var(--border);
	}

	.tolerance-label {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tolerance-name {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--text);
	}

	.tolerance-inputs {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.tolerance-default {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.tolerance-input-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.85rem;
		color: var(--text-muted);
		font-weight: 500;
	}

	.tolerance-input-label input {
		min-height: 48px;
		font-size: 1rem;
	}

	@media (min-width: 640px) {
		.tolerance-row {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}

		.tolerance-inputs {
			flex-direction: row;
			align-items: center;
			gap: 16px;
		}

		.tolerance-input-label {
			flex-direction: row;
			align-items: center;
			gap: 8px;
		}

		.tolerance-input-label input {
			width: 120px;
		}
	}
</style>
