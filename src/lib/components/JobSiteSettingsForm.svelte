<script lang="ts">
	import {
		jobSite,
		machines,
		tack,
		spreadTolerance,
		placementCheck,
		rainCheck,
		minAirTempForThickness
	} from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { formatRainTime, type GeoResult } from '$lib/services/weather';
	import WeatherForecast from './WeatherForecast.svelte';
	import HelpTip from './HelpTip.svelte';
	import { MapPin } from 'lucide-svelte';

	interface Props {
		/** panel = sticky sidebar; inline = mobile collapsible body */
		variant?: 'panel' | 'inline';
	}

	let { variant = 'panel' }: Props = $props();

	let query = $state('');
	let results = $state<GeoResult[]>([]);
	let searching = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	const tempEntry = $derived(minAirTempForThickness(job.thicknessIn));
	const placement = $derived(placementCheck(weather.effectiveTempF, job.thicknessIn));
	const rain = $derived(rainCheck(weather.rainNext24hIn));

	function onSearchInput() {
		clearTimeout(searchTimer);
		if (query.trim().length < 2) {
			results = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			searching = true;
			try {
				results = await weather.search(query);
			} catch {
				results = [];
			} finally {
				searching = false;
			}
		}, 300);
	}

	async function pickPlace(place: GeoResult) {
		query = '';
		results = [];
		await weather.setLocation(place);
	}
</script>

<div class="settings-form" class:panel={variant === 'panel'} class:inline={variant === 'inline'}>
	{#each jobSite.sections as section (section.id)}
		<section class="settings-section">
			<div class="section-head">
				<h3 class="section-title">{section.title}</h3>
				<p class="section-desc">{section.description}</p>
			</div>

			{#each section.fields as field (field.key)}
				{#if field.type === 'text'}
					<div class="field">
						<label for="js-{field.key}">{field.label}</label>
						<input
							id="js-{field.key}"
							type="text"
							bind:value={job.siteName}
							placeholder="Optional"
						/>
						{#if field.hint}<p class="field-hint">{field.hint}</p>{/if}
					</div>
				{:else if field.type === 'textarea'}
					<div class="field">
						<label for="js-{field.key}">{field.label}</label>
						<textarea
							id="js-{field.key}"
							bind:value={job.siteDescription}
							rows="3"
							placeholder="Optional notes…"
						></textarea>
						{#if field.hint}<p class="field-hint">{field.hint}</p>{/if}
					</div>
				{:else if field.type === 'location'}
					<div class="field">
						<span class="field-label">{field.label}</span>
						{#if field.hint}<p class="field-hint top">{field.hint}</p>{/if}
						<div class="search-row">
							<input
								type="search"
								placeholder="City or place…"
								bind:value={query}
								oninput={onSearchInput}
								autocomplete="off"
							/>
							<button
								class="gps-btn"
								type="button"
								onclick={() => weather.useGps()}
								disabled={weather.loading}
								title="Use my location"
							>
								<MapPin size={18} />
							</button>
						</div>
						{#if searching}
							<p class="mini-hint">Searching…</p>
						{:else if results.length > 0}
							<ul class="results">
								{#each results as place (place.latitude + place.longitude)}
									<li>
										<button type="button" onclick={() => pickPlace(place)}>
											{place.name}{#if place.admin1}, {place.admin1}{/if}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
						{#if weather.hasLocation}
							<p class="location-set">
								<b>{weather.locationLabel}</b>
								<button type="button" class="link" onclick={() => weather.clear()}>Clear</button>
							</p>
						{/if}
						{#if weather.error}
							<p class="field-error">{weather.error}</p>
						{/if}
					</div>
				{:else if field.type === 'weather'}
					<div class="weather-panel">
						{#if !weather.hasLocation}
							<p class="mini-hint">Set a location above to load live weather.</p>
						{:else}
							<div class="live-grid">
								<div class="live-stat">
									<span class="live-val"
										>{weather.effectiveTempF != null
											? `${weather.effectiveTempF}°F`
											: '—'}</span
									>
									<span class="live-lbl">Air temp</span>
								</div>
								<div class="live-stat">
									<span class="live-val">{weather.conditions || '—'}</span>
									<span class="live-lbl">Conditions</span>
								</div>
								<div class="live-stat">
									<span class="live-val">
										{weather.rainNext24hIn != null
											? `${weather.rainNext24hIn.toFixed(2)} in`
											: '—'}
									</span>
									<span class="live-lbl">Rain / 24 h</span>
								</div>
							</div>

							<p class="table4-ref">
								Table 4 min: <b>{tempEntry.minAirTempF}°F</b> for {job.thicknessIn}" lift
							</p>

							{#if placement}
								<div class="status-banner {placement.status}">{placement.message}</div>
							{/if}
							{#if rain}
								<div class="status-banner {rain.status}">{rain.message}</div>
							{/if}

							{#if weather.rainHours.length > 0}
								<div class="rain-block">
									<span class="rain-title">Rain next 24 h</span>
									<ul class="rain-list">
										{#each weather.rainHours.slice(0, 5) as hour (hour.time)}
											<li>
												<span>{formatRainTime(hour.time)}</span>
												<span>
													{#if hour.precipIn > 0}
														{hour.precipIn.toFixed(2)} in
													{:else}
														{hour.probability}%
													{/if}
												</span>
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							<WeatherForecast />

							<label class="check-row">
								<input type="checkbox" bind:checked={weather.useManualTemp} />
								Manual temp override
							</label>
							{#if weather.useManualTemp}
								<div class="field compact">
									<div class="with-unit">
										<input
											type="number"
											inputmode="decimal"
											bind:value={weather.manualTempF}
											placeholder="—"
										/>
										<span class="unit">°F</span>
									</div>
								</div>
							{/if}

							<button
								type="button"
								class="link refresh"
								onclick={() => weather.refresh(true)}
								disabled={weather.loading}
							>
								{weather.loading ? 'Refreshing…' : 'Refresh weather'}
							</button>
						{/if}
					</div>
				{:else if field.type === 'number'}
					<div class="field">
						<div class="label-row">
							<label for="js-{field.key}">{field.label}</label>
							{#if field.key === 'thicknessIn'}
								<HelpTip text="How thick this layer of asphalt is. Determines minimum paving temperature and target spread rate." />
							{/if}
						</div>
						<div class="with-unit">
							{#if field.key === 'widthFt'}
								<input
									id="js-{field.key}"
									type="number"
									inputmode="decimal"
									step={field.step ?? 1}
									bind:value={job.widthFt}
								/>
							{:else if field.key === 'thicknessIn'}
								<input
									id="js-{field.key}"
									type="number"
									inputmode="decimal"
									step={field.step ?? 1}
									bind:value={job.thicknessIn}
								/>
							{:else if field.key === 'truckLoadTons'}
								<input
									id="js-{field.key}"
									type="number"
									inputmode="decimal"
									step={field.step ?? 1}
									bind:value={job.truckLoadTons}
								/>
							{/if}
							{#if field.unit}<span class="unit">{field.unit}</span>{/if}
						</div>
						{#if field.hint}<p class="field-hint">{field.hint}</p>{/if}
					</div>
				{:else if field.type === 'machine'}
					<div class="field">
						<span class="field-label">{field.label}</span>
						<div class="chips">
							{#each machines as m (m.id)}
								<button
									type="button"
									class="chip"
									class:active={job.machineId === m.id}
									onclick={() => (job.machineId = m.id)}
								>
									{m.label}
								</button>
							{/each}
						</div>
						{#if field.hint}<p class="field-hint">{field.hint}</p>{/if}
					</div>
				{:else if field.type === 'boolean'}
					<label class="check-row">
						<input type="checkbox" bind:checked={job.firstPass} />
						<span>
							<b>{field.label}</b>
							{#if field.hint}<span class="check-hint">{field.hint}</span>{/if}
						</span>
					</label>
				{:else if field.type === 'tack'}
					<div class="field">
						<div class="label-row">
							<span class="field-label">{field.label}</span>
							<HelpTip text="Gallons of tack coat per square yard. Too little = layers won't bond. Too much = tracking." />
						</div>
						<div class="chips">
							{#each tack.field as t (t.id)}
								<button
									type="button"
									class="chip"
									class:active={job.tackApplication === t.id}
									onclick={() => (job.tackApplication = t.id)}
								>
									{t.label}
								</button>
							{/each}
						</div>
						{#if field.hint}<p class="field-hint">{field.hint}</p>{/if}
					</div>
				{:else if field.type === 'course'}
					<div class="field">
						<div class="label-row">
							<span class="field-label">{field.label}</span>
							<HelpTip text="Surface, intermediate, or base layer — each has different spec requirements and spread rate tolerances." />
						</div>
						<div class="chips">
							{#each spreadTolerance as c (c.id)}
								<button
									type="button"
									class="chip"
									class:active={job.courseType === c.id}
									onclick={() => (job.courseType = c.id)}
								>
									{c.label}
								</button>
							{/each}
						</div>
						{#if field.hint}<p class="field-hint">{field.hint}</p>{/if}
					</div>
				{:else if field.type === 'waste'}
					<div class="field">
						<span class="field-label">{field.label}</span>
						<div class="chips">
							{#each jobSite.wasteOptions as w}
								<button
									type="button"
									class="chip"
									class:active={job.wastePct === w}
									onclick={() => (job.wastePct = w)}
								>
									{w}%
								</button>
							{/each}
						</div>
						{#if field.hint}<p class="field-hint">{field.hint}</p>{/if}
					</div>
				{/if}
			{/each}
		</section>
	{/each}

	<button type="button" class="reset" onclick={() => job.reset()}>Reset job settings to defaults</button>
</div>

<style>
	.settings-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}

	.settings-section {
		padding-bottom: var(--sp-1);
		border-bottom: 1px solid var(--border);
	}

	.settings-section:last-of-type {
		border-bottom: 0;
	}

	.section-head {
		margin-bottom: var(--sp-4);
	}

	/* Inline variant (calculator Job Setup accordion): grouped cards in a grid */
	.settings-form.inline {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: var(--sp-3);
		align-items: start;
	}

	.settings-form.inline .settings-section {
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
	}

	.settings-form.inline .section-head {
		margin-bottom: var(--sp-3);
		padding-bottom: var(--sp-3);
		border-bottom: 1px solid var(--border);
	}

	.settings-form.inline .field:last-child,
	.settings-form.inline .weather-panel:last-child {
		margin-bottom: 0;
	}

	.settings-form.inline .reset {
		grid-column: 1 / -1;
	}

	.section-title {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-muted);
	}

	.section-desc {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.field {
		margin-bottom: var(--sp-4);
	}

	.field.compact {
		margin-bottom: var(--sp-2);
	}

	.field label,
	.field-label {
		display: block;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
	}

	.field input[type='text'],
	.field textarea,
	.search-row input {
		width: 100%;
		min-height: 44px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		padding: var(--sp-3);
		font-size: var(--fs-md);
		font-family: inherit;
	}

	.field textarea {
		min-height: 72px;
		resize: vertical;
	}

	.field input:focus,
	.field textarea:focus,
	.search-row input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.with-unit {
		display: flex;
		align-items: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.with-unit input {
		flex: 1;
		min-height: 44px;
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: 1.1rem;
		font-weight: 600;
		padding: 0 var(--sp-3);
		text-align: right;
	}

	.with-unit input:focus {
		outline: none;
	}

	.unit {
		padding: 0 var(--sp-3);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}

	.field-hint {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-xs);
		color: var(--text-muted);
		line-height: 1.35;
	}

	.field-hint.top {
		margin: 0 0 var(--sp-2);
	}

	.field-error {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-sm);
		color: var(--bad);
	}

	.search-row {
		display: flex;
		gap: var(--sp-2);
	}

	.gps-btn {
		min-width: 44px;
		min-height: 44px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-size: 1.1rem;
		cursor: pointer;
		flex-shrink: 0;
	}

	.results {
		list-style: none;
		margin: var(--sp-2) 0 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.results button {
		width: 100%;
		text-align: left;
		padding: var(--sp-3);
		background: var(--surface);
		border: 0;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		font-size: var(--fs-md);
		cursor: pointer;
		min-height: 44px;
	}

	.results li:last-child button {
		border-bottom: 0;
	}

	.location-set {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.location-set b {
		color: var(--text);
	}

	.link {
		background: none;
		border: 0;
		color: var(--accent);
		font-size: var(--fs-sm);
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
	}

	.mini-hint {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin: var(--sp-2) 0;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.chip {
		min-height: 40px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		cursor: pointer;
	}

	.chip.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--fw-bold);
	}

	.check-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		font-size: var(--fs-sm);
		color: var(--text);
		margin-bottom: var(--sp-1);
		cursor: pointer;
		min-height: 44px;
		padding: 0 var(--sp-1);
	}

	.check-row input {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
		flex-shrink: 0;
	}

	.check-hint {
		display: block;
		font-size: var(--fs-xs);
		color: var(--text-muted);
		font-weight: 400;
		margin-top: var(--sp-1);
		line-height: 1.35;
	}

	.weather-panel {
		margin-bottom: var(--sp-2);
	}

	.live-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}

	.live-stat {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-2) var(--sp-2);
		text-align: center;
	}

	.live-val {
		display: block;
		font-weight: var(--fw-heavy);
		font-size: var(--fs-sm);
		color: var(--accent);
		line-height: 1.2;
	}

	.live-lbl {
		font-size: var(--fs-2xs);
		color: var(--text-muted);
	}

	.table4-ref {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.status-banner {
		font-size: var(--fs-xs);
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		margin-bottom: var(--sp-2);
		line-height: 1.35;
	}

	.status-banner.pass {
		background: color-mix(in srgb, var(--good) 18%, transparent);
		color: var(--good);
	}

	.status-banner.warn {
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
	}

	.status-banner.fail {
		background: color-mix(in srgb, var(--bad) 18%, transparent);
		color: var(--bad);
	}

	.rain-block {
		margin: var(--sp-2) 0;
	}

	.rain-title {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
	}

	.rain-list {
		list-style: none;
		margin: var(--sp-2) 0 0;
		padding: 0;
	}

	.rain-list li {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-xs);
		padding: var(--sp-1) 0;
		border-bottom: 1px solid var(--border);
	}

	.refresh {
		margin-top: var(--sp-1);
	}

	.reset {
		background: none;
		border: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		text-decoration: underline;
		cursor: pointer;
		padding: var(--sp-2) 0;
		text-align: left;
		min-height: 44px;
	}

	/* Panel variant: tighter for sidebar */
	.settings-form.panel .section-desc {
		font-size: var(--fs-2xs);
		line-height: 1.35;
	}

	.settings-form.panel .field-hint {
		font-size: var(--fs-2xs);
	}

	.settings-form.panel .with-unit input {
		font-size: 1rem;
		min-height: 40px;
	}

	.settings-form.panel .chip {
		font-size: var(--fs-xs);
		padding: 0 var(--sp-3);
		min-height: 36px;
	}

	.label-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	@media (max-width: 360px) {
		.live-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
