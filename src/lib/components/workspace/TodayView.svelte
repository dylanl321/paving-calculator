<script lang="ts">
	import { today, type EntryType } from '$lib/stores/today.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { fetchJobSites, pushTodayToCloud, type JobSiteOption } from '$lib/services/todaySync';
	import TodaySummary from './TodaySummary.svelte';

	const entries = $derived(today.entries);

	// ---- Cloud sync (only when signed in) ----
	let jobSites = $state<JobSiteOption[]>([]);
	let selectedSiteId = $state<string>(today.jobSiteId ?? '');
	let syncing = $state(false);
	let syncMsg = $state<string | null>(null);
	let syncErr = $state<string | null>(null);

	$effect(() => {
		if (authStore.isAuthenticated && jobSites.length === 0) {
			fetchJobSites()
				.then((sites) => (jobSites = sites))
				.catch(() => {});
		}
	});

	$effect(() => {
		if (selectedSiteId && today.jobSiteId !== selectedSiteId) {
			today.jobSiteId = selectedSiteId;
		}
	});

	async function syncNow() {
		if (!selectedSiteId) {
			syncErr = 'Pick a job site first';
			return;
		}
		syncing = true;
		syncErr = null;
		syncMsg = null;
		try {
			const res = await pushTodayToCloud(selectedSiteId);
			syncMsg =
				res.pushed > 0
					? `Synced ${res.pushed} ${res.pushed === 1 ? 'entry' : 'entries'} to cloud`
					: 'Day is up to date in the cloud';
		} catch (e) {
			syncErr = e instanceof Error ? e.message : 'Sync failed';
		} finally {
			syncing = false;
		}
	}

	// Keep the day's site name in step with the configured job site.
	$effect(() => {
		if (job.siteName && today.siteName !== job.siteName) {
			today.siteName = job.siteName;
		}
	});

	// Auto-fill day conditions from the live weather store once, when blank.
	function pullWeather() {
		if (weather.effectiveTempF != null) today.weatherTempF = Math.round(weather.effectiveTempF);
		const c = mapConditions(weather.conditions, weather.isRaining);
		if (c) today.weatherConditions = c;
	}
	$effect(() => {
		if (today.weatherTempF == null && weather.effectiveTempF != null) {
			today.weatherTempF = Math.round(weather.effectiveTempF);
		}
		if (today.weatherConditions == null) {
			const c = mapConditions(weather.conditions, weather.isRaining);
			if (c) today.weatherConditions = c;
		}
	});

	function mapConditions(
		raw: string,
		raining: boolean
	): 'clear' | 'cloudy' | 'rain' | 'wind' | 'fog' | null {
		if (raining) return 'rain';
		const s = (raw || '').toLowerCase();
		if (!s) return null;
		if (s.includes('rain') || s.includes('drizzle') || s.includes('shower')) return 'rain';
		if (s.includes('fog') || s.includes('mist')) return 'fog';
		if (s.includes('wind')) return 'wind';
		if (s.includes('cloud') || s.includes('overcast')) return 'cloudy';
		if (s.includes('clear') || s.includes('sun')) return 'clear';
		return null;
	}

	const ENTRY_TYPES: { value: EntryType; label: string }[] = [
		{ value: 'paving', label: 'Paving' },
		{ value: 'milling', label: 'Milling' },
		{ value: 'tack', label: 'Tack' },
		{ value: 'delay', label: 'Delay' },
		{ value: 'break', label: 'Break' },
		{ value: 'note', label: 'Note' }
	];

	let showForm = $state(false);
	let editingId = $state<string | null>(null);
	let form = $state(blankForm());

	function blankForm() {
		return {
			entry_type: 'paving' as EntryType,
			timestamp: nowHHMM(),
			station_start: null as number | null,
			station_end: null as number | null,
			distance_ft: null as number | null,
			tons_placed: null as number | null,
			loads_count: null as number | null,
			truck_tickets: '' as string,
			spread_rate_actual: null as number | null,
			tack_gallons: null as number | null,
			lane: '' as string,
			notes: '' as string
		};
	}

	function nowHHMM(): string {
		const d = new Date();
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}

	function openAdd() {
		form = blankForm();
		editingId = null;
		showForm = true;
	}

	function openEdit(id: string) {
		const e = entries.find((x) => x.id === id);
		if (!e) return;
		form = {
			entry_type: e.entry_type,
			timestamp: e.timestamp,
			station_start: e.station_start,
			station_end: e.station_end,
			distance_ft: e.distance_ft,
			tons_placed: e.tons_placed,
			loads_count: e.loads_count,
			truck_tickets: (e.truck_tickets ?? []).join(', '),
			spread_rate_actual: e.spread_rate_actual,
			tack_gallons: e.tack_gallons,
			lane: e.lane ?? '',
			notes: e.notes ?? ''
		};
		editingId = id;
		showForm = true;
	}

	function save() {
		const tickets = form.truck_tickets
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const payload = {
			entry_type: form.entry_type,
			timestamp: form.timestamp || nowHHMM(),
			station_start: form.station_start,
			station_end: form.station_end,
			distance_ft: form.distance_ft,
			tons_placed: form.tons_placed,
			loads_count: form.loads_count,
			truck_tickets: tickets.length ? tickets : null,
			spread_rate_actual: form.spread_rate_actual,
			tack_gallons: form.tack_gallons,
			lane: form.lane || null,
			notes: form.notes || null
		};
		if (editingId) {
			today.updateEntry(editingId, payload);
		} else {
			today.addEntry(payload);
		}
		showForm = false;
		editingId = null;
	}

	function remove(id: string) {
		today.removeEntry(id);
	}

	const ENTRY_ICON: Record<EntryType, string> = {
		paving: '🛣️',
		milling: '🚜',
		tack: '💧',
		break: '☕',
		delay: '⏸️',
		note: '📝'
	};

	function fmtFeet(ft: number | null): string {
		if (ft == null) return '';
		if (ft >= 5280) return `${(ft / 5280).toFixed(2)} mi`;
		return `${Math.round(ft).toLocaleString()} ft`;
	}

	const dateLabel = $derived(
		new Date(today.date + 'T00:00:00').toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric'
		})
	);

	async function exportDailyReport() {
		const { generateDailyReportPDF } = await import('$lib/utils/pdf-export');
		const r = today.rollup;
		const y = today.yieldVsTarget(job.widthFt, job.thicknessIn);
		await generateDailyReportPDF(
			{
				widthFt: job.widthFt,
				thicknessIn: job.thicknessIn,
				machineId: job.machineId,
				firstPass: job.firstPass,
				truckLoadTons: job.truckLoadTons,
				tackApplication: job.tackApplication,
				wastePct: job.wastePct,
				siteName: job.siteName,
				siteDescription: job.siteDescription
			},
			{
				date: today.date,
				siteName: today.siteName,
				weatherTempF: today.weatherTempF,
				weatherConditions: today.weatherConditions,
				windSpeedMph: today.windSpeedMph,
				crewCount: today.crewCount,
				startTime: today.startTime,
				endTime: today.endTime,
				notes: today.notes,
				entries: today.entries.map((e) => ({
					entry_type: e.entry_type,
					timestamp: e.timestamp,
					station_start: e.station_start,
					station_end: e.station_end,
					distance_ft: e.distance_ft,
					tons_placed: e.tons_placed,
					loads_count: e.loads_count,
					truck_tickets: e.truck_tickets,
					spread_rate_actual: e.spread_rate_actual,
					tack_gallons: e.tack_gallons,
					lane: e.lane,
					notes: e.notes
				})),
				totals: {
					totalTons: r.total_tons,
					totalDistanceFt: r.total_distance_ft,
					totalLoads: r.total_loads,
					totalTackGallons: r.total_tack_gallons,
					hoursWorked: r.hours_worked
				},
				yield: {
					actualRate: y.actualRate,
					targetRate: y.targetRate,
					diffPct: y.diffPct
				}
			}
		);
	}
</script>

<div class="today">
	<div class="day-head">
		<div>
			<div class="eyebrow">{dateLabel}</div>
			{#if today.siteName}<h2 class="site">{today.siteName}</h2>{/if}
		</div>
		<div class="head-actions">
			<button class="btn btn-ghost btn-sm" onclick={exportDailyReport}>Daily report PDF</button>
			<button class="btn btn-primary btn-sm" onclick={openAdd}>+ Add entry</button>
		</div>
	</div>

	<section class="conditions">
		<div class="cond-head">
			<span class="eyebrow">Day Conditions</span>
			{#if weather.hasLocation}
				<button class="btn btn-subtle btn-sm" onclick={pullWeather}>Pull live weather</button>
			{/if}
		</div>
		<div class="cond-grid">
			<label class="f">
				<span>Temp °F</span>
				<input type="number" inputmode="numeric" bind:value={today.weatherTempF} />
			</label>
			<label class="f">
				<span>Conditions</span>
				<select bind:value={today.weatherConditions}>
					<option value={null}>—</option>
					<option value="clear">Clear</option>
					<option value="cloudy">Cloudy</option>
					<option value="rain">Rain</option>
					<option value="wind">Wind</option>
					<option value="fog">Fog</option>
				</select>
			</label>
			<label class="f">
				<span>Wind mph</span>
				<input type="number" inputmode="numeric" bind:value={today.windSpeedMph} />
			</label>
			<label class="f crew-field">
				<span>Crew</span>
				<input type="number" inputmode="numeric" bind:value={today.crewCount} />
				<div class="crew-quick">
					<button class="crew-btn" onclick={() => (today.crewCount = 3)}>3</button>
					<button class="crew-btn" onclick={() => (today.crewCount = 4)}>4</button>
					<button class="crew-btn" onclick={() => (today.crewCount = 5)}>5</button>
					<button class="crew-btn" onclick={() => (today.crewCount = 6)}>6</button>
				</div>
			</label>
			<label class="f">
				<span>Start</span>
				<input type="time" bind:value={today.startTime} />
			</label>
			<label class="f">
				<span>End</span>
				<input type="time" bind:value={today.endTime} />
			</label>
		</div>
	</section>

	<TodaySummary variant="full" />

	{#if authStore.isAuthenticated}
		<section class="sync">
			<div class="sync-row">
				<label class="f sync-site">
					<span>Cloud job site</span>
					<select bind:value={selectedSiteId}>
						<option value="">Not linked (local only)</option>
						{#each jobSites as site (site.id)}
							<option value={site.id}>{site.name}</option>
						{/each}
					</select>
				</label>
				<button class="btn btn-primary btn-sm" disabled={syncing || !selectedSiteId} onclick={syncNow}>
					{syncing ? 'Syncing…' : 'Sync to cloud'}
				</button>
			</div>
			{#if syncMsg}<p class="sync-ok">{syncMsg}</p>{/if}
			{#if syncErr}<p class="sync-bad">{syncErr}</p>{/if}
		</section>
	{/if}

	<section class="timeline-wrap">
		<span class="eyebrow">Timeline</span>
		{#if entries.length === 0}
			<div class="empty">
				<p>No entries yet. Log a result from any calculator, or add one manually.</p>
				<button class="btn btn-primary btn-sm" onclick={openAdd}>+ Add entry</button>
			</div>
		{:else}
			<ul class="timeline">
				{#each entries as e (e.id)}
					<li class="row">
						<span class=" icon" aria-hidden="true">{ENTRY_ICON[e.entry_type]}</span>
						<span class="time">{e.timestamp}</span>
						<div class="body">
							<div class="line1">
								<span class="type">{e.entry_type}</span>
								{#if e.source_calc}<span class="src">from {e.source_calc}</span>{/if}
							</div>
							<div class="line2">
								{#if e.tons_placed != null}<span>{e.tons_placed} t</span>{/if}
								{#if e.distance_ft != null}<span>{fmtFeet(e.distance_ft)}</span>{/if}
								{#if e.station_start != null && e.station_end != null}
									<span>{e.station_start}+00 → {e.station_end}+00</span>
								{/if}
								{#if e.loads_count != null}<span>{e.loads_count} loads</span>{/if}
								{#if e.spread_rate_actual != null}<span>{Math.round(e.spread_rate_actual)} lbs/SY</span>{/if}
								{#if e.tack_gallons != null}<span>{Math.round(e.tack_gallons)} gal</span>{/if}
								{#if e.lane}<span>{e.lane}</span>{/if}
								{#if e.truck_tickets?.length}<span>#{e.truck_tickets.join(', #')}</span>{/if}
							</div>
							{#if e.notes}<p class="note">{e.notes}</p>{/if}
						</div>
						<div class="actions">
							<button class="btn btn-subtle btn-sm" onclick={() => openEdit(e.id)}>Edit</button>
							<button class="btn btn-subtle btn-sm" onclick={() => remove(e.id)}>✕</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

{#if showForm}
	<div
		class="overlay"
		role="button"
		tabindex="0"
		onclick={() => (showForm = false)}
		onkeydown={(ev) => ev.key === 'Escape' && (showForm = false)}
	></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Entry">
		<header class="sheet-head">
			<h3>{editingId ? 'Edit entry' : 'New entry'}</h3>
			<button class="btn btn-subtle btn-sm" onclick={() => (showForm = false)}>✕</button>
		</header>

		<div class="sheet-body">
			<div class="type-chips">
				{#each ENTRY_TYPES as t (t.value)}
					<button
						class="chip"
						class:active={form.entry_type === t.value}
						onclick={() => (form.entry_type = t.value)}
					>
						{ENTRY_ICON[t.value]} {t.label}
					</button>
				{/each}
			</div>

			<div class="form-grid">
				<label class="f">
					<span>Time</span>
					<input type="time" bind:value={form.timestamp} />
				</label>

				{#if form.entry_type === 'paving' || form.entry_type === 'milling'}
					<label class="f"><span>Station start</span><input type="number" inputmode="decimal" bind:value={form.station_start} /></label>
					<label class="f"><span>Station end</span><input type="number" inputmode="decimal" bind:value={form.station_end} /></label>
					<label class="f"><span>Distance ft</span><input type="number" inputmode="decimal" bind:value={form.distance_ft} placeholder="auto from stations" /></label>
					<label class="f"><span>Tons placed</span><input type="number" inputmode="decimal" bind:value={form.tons_placed} /></label>
					<label class="f"><span>Loads</span><input type="number" inputmode="numeric" bind:value={form.loads_count} /></label>
					<label class="f"><span>Actual lbs/SY</span><input type="number" inputmode="decimal" bind:value={form.spread_rate_actual} /></label>
					<label class="f"><span>Lane</span><input type="text" bind:value={form.lane} /></label>
					<label class="f wide"><span>Truck tickets (comma-sep)</span><input type="text" bind:value={form.truck_tickets} placeholder="1042, 1043" /></label>
				{:else if form.entry_type === 'tack'}
					<label class="f"><span>Tack gallons</span><input type="number" inputmode="decimal" bind:value={form.tack_gallons} /></label>
					<label class="f"><span>Station start</span><input type="number" inputmode="decimal" bind:value={form.station_start} /></label>
					<label class="f"><span>Station end</span><input type="number" inputmode="decimal" bind:value={form.station_end} /></label>
					<label class="f"><span>Lane</span><input type="text" bind:value={form.lane} /></label>
				{/if}

				<label class="f wide">
					<span>Notes</span>
					<textarea rows="2" bind:value={form.notes}></textarea>
				</label>
			</div>
		</div>

		<footer class="sheet-foot">
			<button class="btn btn-ghost" onclick={() => (showForm = false)}>Cancel</button>
			<button class="btn btn-primary" onclick={save}>{editingId ? 'Save' : 'Add'}</button>
		</footer>
	</div>
{/if}

<style>
	.today {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}
	.day-head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--sp-3);
	}
	.site {
		margin: 2px 0 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-heavy);
	}
	.head-actions {
		display: flex;
		gap: var(--sp-2);
		flex-shrink: 0;
	}

	.conditions,
	.timeline-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.sync {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3) var(--sp-4);
	}
	.sync-row {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-3);
	}
	.sync-site {
		flex: 1;
	}
	.sync-ok {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-sm);
		color: var(--good);
	}
	.sync-bad {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-sm);
		color: var(--bad);
	}
	.cond-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.cond-grid {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: var(--sp-2);
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
	.f input,
	.f select,
	.f textarea {
		width: 100%;
		min-height: 48px;
		padding: 0 var(--sp-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--fs-base);
	}
	.f textarea {
		padding: var(--sp-2);
		min-height: auto;
	}
	.f input[type="time"] {
		min-height: 48px;
	}

	.crew-field {
		position: relative;
	}
	.crew-quick {
		display: flex;
		gap: 4px;
		margin-top: 4px;
	}
	.crew-btn {
		flex: 1;
		min-height: 44px;
		padding: 0 var(--sp-2);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		color: var(--text);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.crew-btn:hover {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}
	.crew-btn:active {
		transform: scale(0.96);
	}

	.empty {
		background: var(--surface-alt);
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-6);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
	}
	.empty p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.timeline {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.row {
		display: grid;
		grid-template-columns: auto auto 1fr auto;
		align-items: start;
		gap: var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3);
	}
	.icon {
		font-size: 18px;
		line-height: 1.4;
	}
	.time {
		font-variant-numeric: tabular-nums;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		padding-top: 1px;
	}
	.body {
		min-width: 0;
	}
	.line1 {
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
	}
	.type {
		text-transform: capitalize;
		font-weight: var(--fw-bold);
		font-size: var(--fs-sm);
	}
	.src {
		font-size: var(--fs-2xs);
		color: var(--text-muted);
	}
	.line2 {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1) var(--sp-3);
		margin-top: 3px;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.note {
		margin: var(--sp-1) 0 0;
		font-size: var(--fs-sm);
		color: var(--text);
	}
	.actions {
		display: flex;
		gap: 4px;
	}

	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 40;
	}
	.sheet {
		position: fixed;
		z-index: 41;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(640px, 100%);
		max-height: 90vh;
		overflow: auto;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		display: flex;
		flex-direction: column;
	}
	.sheet-head,
	.sheet-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-4);
		position: sticky;
		background: var(--surface);
	}
	.sheet-head {
		top: 0;
		border-bottom: 1px solid var(--border);
	}
	.sheet-head h3 {
		margin: 0;
		font-size: var(--fs-lg);
	}
	.sheet-foot {
		bottom: 0;
		border-top: 1px solid var(--border);
		gap: var(--sp-3);
	}
	.sheet-body {
		padding: var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
	.type-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.chip {
		min-height: 40px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-pill);
		font-size: var(--fs-sm);
		cursor: pointer;
	}
	.chip.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}
	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
	}
	.f.wide {
		grid-column: 1 / -1;
	}

	@media (min-width: 768px) {
		.sheet {
			bottom: auto;
			top: 50%;
			transform: translate(-50%, -50%);
			border-radius: var(--radius-lg);
		}
	}

	@media (max-width: 640px) {
		.cond-grid {
			grid-template-columns: 1fr 1fr 1fr;
		}
		.row {
			grid-template-columns: auto 1fr;
		}
		.time {
			grid-column: 2;
		}
		.actions {
			grid-column: 1 / -1;
			justify-content: flex-end;
		}
	}
</style>
