<script lang="ts">
	import { config } from '$lib/config';
	import { OVERRIDABLE_CONSTANTS, constantDefault } from '$lib/config/overrides';
	import type { RangeEntry } from '$lib/config';

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
		constants = $bindable(),
		tackField = $bindable(),
		tackSpec = $bindable()
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
		constants: Record<string, number>;
		tackField: RangeEntry[];
		tackSpec: RangeEntry[];
	} = $props();

	const machines = config.machines;
	const tackApplications = config.tack.field;
	const courseTypes = config.spreadTolerance;
	const constantKeys = Object.keys(OVERRIDABLE_CONSTANTS);

	function isConstOverridden(key: string): boolean {
		return constants[key] !== constantDefault(key);
	}
	function isDefaultOverridden(key: string, current: number | string): boolean {
		return current !== (config.defaults as Record<string, unknown>)[key];
	}

	function resetConstant(key: string) {
		constants[key] = constantDefault(key);
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
</style>
