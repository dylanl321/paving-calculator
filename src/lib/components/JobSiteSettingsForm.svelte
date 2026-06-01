<script lang="ts">
	import {
		jobSite,
		machines,
		tack,
		placementCheck,
		rainCheck,
		minAirTempForThickness
	} from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { formatRainTime, type GeoResult } from '$lib/services/weather';

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
			<h3 class="section-title">{section.title}</h3>
			<p class="section-desc">{section.description}</p>

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
								📍
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
						<label for="js-{field.key}">{field.label}</label>
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
						<span class="field-label">{field.label}</span>
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
		gap: 20px;
	}

	.settings-section {
		padding-bottom: 4px;
		border-bottom: 1px solid var(--border);
	}

	.settings-section:last-of-type {
		border-bottom: 0;
	}

	.section-title {
		margin: 0 0 6px;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-muted);
	}

	.section-desc {
		margin: 0 0 14px;
		font-size: 0.8rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.field {
		margin-bottom: 14px;
	}

	.field.compact {
		margin-bottom: 8px;
	}

	.field label,
	.field-label {
		display: block;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 6px;
	}

	.field input[type='text'],
	.field textarea,
	.search-row input {
		width: 100%;
		min-height: 44px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		color: var(--text);
		padding: 10px 12px;
		font-size: 0.95rem;
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
		border-radius: 10px;
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
		padding: 0 12px;
		text-align: right;
	}

	.with-unit input:focus {
		outline: none;
	}

	.unit {
		padding: 0 12px;
		color: var(--text-muted);
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.field-hint {
		margin: 6px 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.35;
	}

	.field-hint.top {
		margin: 0 0 8px;
	}

	.field-error {
		margin: 6px 0 0;
		font-size: 0.8rem;
		color: var(--bad);
	}

	.search-row {
		display: flex;
		gap: 8px;
	}

	.gps-btn {
		min-width: 44px;
		min-height: 44px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		font-size: 1.1rem;
		cursor: pointer;
		flex-shrink: 0;
	}

	.results {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}

	.results button {
		width: 100%;
		text-align: left;
		padding: 10px 12px;
		background: var(--surface);
		border: 0;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		font-size: 0.9rem;
		cursor: pointer;
		min-height: 44px;
	}

	.results li:last-child button {
		border-bottom: 0;
	}

	.location-set {
		margin: 8px 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.location-set b {
		color: var(--text);
	}

	.link {
		background: none;
		border: 0;
		color: var(--accent);
		font-size: 0.8rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
	}

	.mini-hint {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin: 6px 0;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.82rem;
		cursor: pointer;
	}

	.chip.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: 700;
	}

	.check-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		font-size: 0.85rem;
		color: var(--text);
		margin-bottom: 12px;
		cursor: pointer;
	}

	.check-row input {
		width: 18px;
		height: 18px;
		margin-top: 2px;
		accent-color: var(--accent);
		flex-shrink: 0;
	}

	.check-hint {
		display: block;
		font-size: 0.75rem;
		color: var(--text-muted);
		font-weight: 400;
		margin-top: 2px;
		line-height: 1.35;
	}

	.weather-panel {
		margin-bottom: 8px;
	}

	.live-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
		margin-bottom: 10px;
	}

	.live-stat {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 6px;
		text-align: center;
	}

	.live-val {
		display: block;
		font-weight: 800;
		font-size: 0.85rem;
		color: var(--accent);
		line-height: 1.2;
	}

	.live-lbl {
		font-size: 0.65rem;
		color: var(--text-muted);
	}

	.table4-ref {
		margin: 0 0 8px;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.status-banner {
		font-size: 0.78rem;
		padding: 8px 10px;
		border-radius: 8px;
		margin-bottom: 6px;
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
		margin: 8px 0;
	}

	.rain-title {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
	}

	.rain-list {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
	}

	.rain-list li {
		display: flex;
		justify-content: space-between;
		font-size: 0.78rem;
		padding: 5px 0;
		border-bottom: 1px solid var(--border);
	}

	.refresh {
		margin-top: 4px;
	}

	.reset {
		background: none;
		border: 0;
		color: var(--text-muted);
		font-size: 0.8rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 8px 0;
		text-align: left;
		min-height: 44px;
	}

	/* Panel variant: tighter for sidebar */
	.settings-form.panel .section-desc {
		font-size: 0.73rem;
		line-height: 1.35;
	}

	.settings-form.panel .field-hint {
		font-size: 0.72rem;
	}

	.settings-form.panel .with-unit input {
		font-size: 1rem;
		min-height: 40px;
	}

	.settings-form.panel .chip {
		font-size: 0.78rem;
		padding: 0 10px;
		min-height: 36px;
	}

	@media (max-width: 360px) {
		.live-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
