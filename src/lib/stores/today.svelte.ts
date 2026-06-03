// Local-first "Today" production session for Paverate.
//
// This is the bridge between the stateless calculators and a real foreman's
// daily record. It captures the day's work entirely on-device (works fully
// offline / logged-out) and is shaped to mirror the cloud daily-log model
// (DbDailyLog / DbLogEntry in $lib/server/db-logs.ts) so that, when signed in
// with a job site selected, the same session can be pushed field-for-field to
// the existing /api/job-sites/[id]/logs(+entries) endpoints.
//
// Persisted to localStorage. A single "current day" is kept; when the calendar
// date rolls over, the previous day is archived and a fresh day starts.
import { spreadRateFromThickness, actualSpreadRate } from '$lib/config/formulas';
import { deriveFields } from '$lib/services/autoDerive';
import { weather } from '$lib/stores/weather.svelte';

const STORAGE_KEY = 'paverate.today.v1';

export type EntryType = 'paving' | 'milling' | 'tack' | 'break' | 'delay' | 'note';

/** Mirrors DbLogEntry (minus server-only ids) so sync is a direct field map. */
export interface TodayEntry {
	id: string;
	entry_type: EntryType;
	timestamp: string; // HH:MM
	station_start: number | null;
	station_end: number | null;
	distance_ft: number | null;
	tons_placed: number | null;
	loads_count: number | null;
	truck_tickets: string[] | null;
	spread_rate_actual: number | null;
	tack_gallons: number | null;
	lane: string | null;
	notes: string | null;
	waste_tons: number | null;
	/** Which calculator produced this entry, if any (local-only metadata). */
	source_calc: string | null;
	created_at: number;
	/** Server entry id once synced (local-only metadata). */
	remote_id: string | null;
}

/** Mirrors DbDailyLog header fields. */
export interface TodayState {
	date: string; // YYYY-MM-DD
	site_name: string;
	weather_temp_f: number | null;
	weather_temp_f_source: 'auto' | 'manual' | null;
	weather_conditions: 'clear' | 'cloudy' | 'rain' | 'wind' | 'fog' | null;
	wind_speed_mph: number | null;
	crew_count: number | null;
	start_time: string | null; // HH:MM
	end_time: string | null; // HH:MM
	notes: string | null;
	target_tons: number | null;
	target_loads: number | null;
	plant_name: string | null;
	mix_type: string | null;
	entries: TodayEntry[];
	/** Job site this day is linked to for cloud sync (set when signed in). */
	job_site_id: string | null;
	/** Server daily_log id once synced (local-only metadata). */
	remote_log_id: string | null;
	/** Which fields were auto-derived (local-only metadata). */
	derived_fields: string[];
}

function todayDate(): string {
	return new Date().toISOString().split('T')[0];
}

function initial(): TodayState {
	return {
		date: todayDate(),
		site_name: '',
		weather_temp_f: null,
		weather_temp_f_source: null,
		weather_conditions: null,
		wind_speed_mph: null,
		crew_count: null,
		start_time: null,
		end_time: null,
		notes: null,
		target_tons: null,
		target_loads: null,
		plant_name: null,
		mix_type: null,
		entries: [],
		job_site_id: null,
		remote_log_id: null,
		derived_fields: []
	};
}

function load(): TodayState {
	if (typeof localStorage === 'undefined') return initial();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return initial();
		const parsed = { ...initial(), ...JSON.parse(raw) } as TodayState;
		// Roll to a fresh day if the stored session is from a previous date.
		if (parsed.date !== todayDate()) return initial();
		return parsed;
	} catch {
		return initial();
	}
}

export interface TodayRollup {
	total_tons: number;
	total_distance_ft: number;
	total_loads: number;
	total_tack_gallons: number;
	hours_worked: number;
	paving_entries: number;
	milling_entries: number;
	tack_entries: number;
}

class Today {
	#state = $state<TodayState>(initial());

	constructor() {
		if (typeof localStorage !== 'undefined') {
			this.#state = load();
		}

		// Auto-fill weather_temp_f from weather store when available
		$effect(() => {
			const effectiveTempF = weather.effectiveTempF;
			const currentTemp = this.#state.weather_temp_f;
			const currentSource = this.#state.weather_temp_f_source;

			// Only auto-fill if: weather has a temp AND (no temp set OR source is 'auto')
			if (effectiveTempF != null && (currentTemp == null || currentSource === 'auto')) {
				this.#state.weather_temp_f = effectiveTempF;
				this.#state.weather_temp_f_source = 'auto';
				this.#save();
			}
		});

		// Reactive effect: auto-derive fields when entries or weather temp changes
		let lastEntriesLength = 0;
		let lastTempValue: number | null = null;

		$effect(() => {
			const entriesLength = this.#state.entries.length;
			const tempValue = weather.effectiveTempF;

			// Only derive if something actually changed
			if (entriesLength !== lastEntriesLength || tempValue !== lastTempValue) {
				lastEntriesLength = entriesLength;
				lastTempValue = tempValue;

				if (entriesLength > 0 || tempValue != null) {
					// Call deriveFromWeather without tracking its state changes
					queueMicrotask(() => {
						this.deriveFromWeather();
					});
				}
			}
		});
	}

	// ---- Day header ----
	get date() {
		return this.#state.date;
	}
	get siteName() {
		return this.#state.site_name;
	}
	set siteName(v: string) {
		this.#state.site_name = v;
		this.#save();
	}
	get weatherTempF() {
		return this.#state.weather_temp_f;
	}
	set weatherTempF(v: number | null) {
		this.#state.weather_temp_f = v;
		this.#state.weather_temp_f_source = v != null ? 'manual' : null;
		this.#save();
	}
	get weatherTempFSource() {
		return this.#state.weather_temp_f_source;
	}
	get weatherConditions() {
		return this.#state.weather_conditions;
	}
	set weatherConditions(v: TodayState['weather_conditions']) {
		this.#state.weather_conditions = v;
		this.#save();
	}
	get windSpeedMph() {
		return this.#state.wind_speed_mph;
	}
	set windSpeedMph(v: number | null) {
		this.#state.wind_speed_mph = v;
		this.#save();
	}
	get crewCount() {
		return this.#state.crew_count;
	}
	set crewCount(v: number | null) {
		this.#state.crew_count = v;
		this.#save();
	}
	get startTime() {
		return this.#state.start_time;
	}
	set startTime(v: string | null) {
		this.#state.start_time = v;
		this.#save();
	}
	get endTime() {
		return this.#state.end_time;
	}
	set endTime(v: string | null) {
		this.#state.end_time = v;
		this.#save();
	}
	get notes() {
		return this.#state.notes;
	}
	set notes(v: string | null) {
		this.#state.notes = v;
		this.#save();
	}

	// ---- Daily targets ----
	get targetTons() {
		return this.#state.target_tons;
	}
	set targetTons(v: number | null) {
		this.#state.target_tons = v;
		this.#save();
	}
	get targetLoads() {
		return this.#state.target_loads;
	}
	set targetLoads(v: number | null) {
		this.#state.target_loads = v;
		this.#save();
	}
	get plantName() {
		return this.#state.plant_name;
	}
	set plantName(v: string | null) {
		this.#state.plant_name = v;
		this.#save();
	}
	get mixType() {
		return this.#state.mix_type;
	}
	set mixType(v: string | null) {
		this.#state.mix_type = v;
		this.#save();
	}

	get targetProgress() {
		const { total_tons, total_loads } = this.rollup;
		const tons_pct = this.#state.target_tons && this.#state.target_tons > 0
			? (total_tons / this.#state.target_tons) * 100
			: null;
		const loads_pct = this.#state.target_loads && this.#state.target_loads > 0
			? (total_loads / this.#state.target_loads) * 100
			: null;

		let status: 'on_track' | 'behind' | 'done' | null = null;
		if (tons_pct != null) {
			if (tons_pct >= 100) {
				status = 'done';
			} else {
				// No time tracking yet, so we can't compute behind/on_track properly
				status = 'on_track';
			}
		}

		return {
			tons_pct,
			loads_pct,
			status,
			time_elapsed_pct: null
		};
	}

	// ---- Cloud-sync metadata ----
	get jobSiteId() {
		return this.#state.job_site_id;
	}
	set jobSiteId(v: string | null) {
		this.#state.job_site_id = v;
		this.#save();
	}
	get remoteLogId() {
		return this.#state.remote_log_id;
	}
	set remoteLogId(v: string | null) {
		this.#state.remote_log_id = v;
		this.#save();
	}

	// ---- Derived fields tracking ----
	get derivedFields() {
		return this.#state.derived_fields;
	}
	set derivedFields(v: string[]) {
		this.#state.derived_fields = v;
		this.#save();
	}

	/**
	 * Auto-derive fields from weather and entry data.
	 * Runs deriveFields() on each entry, merges derived values where field is null,
	 * and tracks which fields were auto-derived.
	 */
	deriveFromWeather(): void {
		let anyChanges = false;
		const changedFields = new Set<string>();

		// Process each entry
		const updatedEntries = this.#state.entries.map((entry) => {
			const { entryPatch, statePatch } = deriveFields(
				entry,
				this.#state,
				{ road_width: null }, // No job config available in this context
				weather.effectiveTempF
			);

			// Apply entry patches where field is null
			let entryChanged = false;
			const updatedEntry = { ...entry };
			for (const [key, value] of Object.entries(entryPatch)) {
				const fieldKey = key as keyof TodayEntry;
				if (entry[fieldKey] == null && value != null) {
					(updatedEntry as any)[fieldKey] = value;
					changedFields.add(`entry.${key}`);
					entryChanged = true;
				}
			}

			// Apply state patches where field is null
			for (const [key, value] of Object.entries(statePatch)) {
				const fieldKey = key as keyof TodayState;
				if (this.#state[fieldKey] == null && value != null) {
					(this.#state as any)[fieldKey] = value;
					changedFields.add(`state.${key}`);
					anyChanges = true;
				}
			}

			if (entryChanged) {
				anyChanges = true;
			}

			return entryChanged ? updatedEntry : entry;
		});

		// Update entries if any changed
		if (anyChanges) {
			this.#state.entries = updatedEntries;
			this.#state.derived_fields = Array.from(changedFields);
			this.#save();
		}
	}

	// ---- Entries ----
	get entries(): TodayEntry[] {
		return this.#state.entries;
	}

	get entryCount() {
		return this.#state.entries.length;
	}

	/**
	 * Add an entry. Distance auto-derives from stations when both are present
	 * (matching the server's createLogEntry behavior: (end - start) * 100).
	 */
	addEntry(input: {
		entry_type: EntryType;
		timestamp?: string;
		station_start?: number | null;
		station_end?: number | null;
		distance_ft?: number | null;
		tons_placed?: number | null;
		loads_count?: number | null;
		truck_tickets?: string[] | null;
		spread_rate_actual?: number | null;
		tack_gallons?: number | null;
		lane?: string | null;
		notes?: string | null;
		waste_tons?: number | null;
		source_calc?: string | null;
	}): TodayEntry {
		let distance = input.distance_ft ?? null;
		if (distance == null && input.station_start != null && input.station_end != null) {
			distance = (input.station_end - input.station_start) * 100;
		}

		const entry: TodayEntry = {
			id: crypto.randomUUID(),
			entry_type: input.entry_type,
			timestamp: input.timestamp ?? nowHHMM(),
			station_start: input.station_start ?? null,
			station_end: input.station_end ?? null,
			distance_ft: distance,
			tons_placed: input.tons_placed ?? null,
			loads_count: input.loads_count ?? null,
			truck_tickets: input.truck_tickets ?? null,
			spread_rate_actual: input.spread_rate_actual ?? null,
			tack_gallons: input.tack_gallons ?? null,
			lane: input.lane ?? null,
			notes: input.notes ?? null,
			waste_tons: input.waste_tons ?? null,
			source_calc: input.source_calc ?? null,
			created_at: Math.floor(Date.now() / 1000),
			remote_id: null
		};

		this.#state.entries = [...this.#state.entries, entry].sort((a, b) =>
			a.timestamp.localeCompare(b.timestamp)
		);
		this.#save();
		return entry;
	}

	updateEntry(id: string, updates: Partial<Omit<TodayEntry, 'id' | 'created_at'>>): void {
		this.#state.entries = this.#state.entries
			.map((e) => (e.id === id ? { ...e, ...updates } : e))
			.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
		this.#save();
	}

	removeEntry(id: string): void {
		this.#state.entries = this.#state.entries.filter((e) => e.id !== id);
		this.#save();
	}

	/** Start a fresh day, archiving nothing (the day record is the live state). */
	resetDay(): void {
		this.#state = initial();
		this.#save();
	}

	/** Ensure the session reflects the current calendar date. */
	rollToToday(): void {
		if (this.#state.date !== todayDate()) {
			this.resetDay();
		}
	}

	// ---- Rollups (mirror LogSummary + yield) ----
	get rollup(): TodayRollup {
		let total_tons = 0;
		let total_distance_ft = 0;
		let total_loads = 0;
		let total_tack_gallons = 0;
		let paving_entries = 0;
		let milling_entries = 0;
		let tack_entries = 0;

		for (const e of this.#state.entries) {
			if (e.tons_placed) total_tons += e.tons_placed;
			if (e.distance_ft) total_distance_ft += e.distance_ft;
			if (e.loads_count) total_loads += e.loads_count;
			if (e.tack_gallons) total_tack_gallons += e.tack_gallons;
			if (e.entry_type === 'paving') paving_entries++;
			if (e.entry_type === 'milling') milling_entries++;
			if (e.entry_type === 'tack') tack_entries++;
		}

		let hours_worked = 0;
		if (this.#state.start_time && this.#state.end_time) {
			const [sh, sm] = this.#state.start_time.split(':').map(Number);
			const [eh, em] = this.#state.end_time.split(':').map(Number);
			hours_worked = eh + em / 60 - (sh + sm / 60);
		}

		return {
			total_tons,
			total_distance_ft,
			total_loads,
			total_tack_gallons,
			hours_worked,
			paving_entries,
			milling_entries,
			tack_entries
		};
	}

	/**
	 * Yield to date vs target: actual placed lbs/SY across the day's paved area
	 * vs the theoretical target from the job's lift thickness. This is the number
	 * a foreman watches — it must verify against the tonnage on the load tickets.
	 *
	 * actualRate = total tons * 2000 / (total distance * width / 9)
	 */
	yieldVsTarget(widthFt: number, thicknessIn: number): {
		actualRate: number | null;
		targetRate: number | null;
		diffPct: number | null;
		status: 'good' | 'warn' | 'bad' | null;
	} {
		const { total_tons, total_distance_ft } = this.rollup;
		const targetRate = thicknessIn > 0 ? spreadRateFromThickness(thicknessIn) : null;

		let actualRate: number | null = null;
		if (total_distance_ft > 0 && widthFt > 0) {
			actualRate = actualSpreadRate({
				tons: total_tons,
				distanceFt: total_distance_ft,
				widthFt
			});
		}

		let diffPct: number | null = null;
		let status: 'good' | 'warn' | 'bad' | null = null;
		if (actualRate != null && targetRate != null && targetRate > 0) {
			diffPct = ((actualRate - targetRate) / targetRate) * 100;
			const abs = Math.abs(diffPct);
			status = abs <= 5 ? 'good' : abs <= 10 ? 'warn' : 'bad';
		}

		return { actualRate, targetRate, diffPct, status };
	}

	/** Map a local entry to the server createLogEntry body. */
	toServerEntry(e: TodayEntry) {
		return {
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
		};
	}

	/** Map the day header to the server updateDailyLog body. */
	toServerLogHeader() {
		return {
			weather_temp_f: this.#state.weather_temp_f,
			weather_conditions: this.#state.weather_conditions,
			wind_speed_mph: this.#state.wind_speed_mph,
			crew_count: this.#state.crew_count,
			start_time: this.#state.start_time,
			end_time: this.#state.end_time,
			notes: this.#state.notes
		};
	}

	#save() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#state));
		} catch {
			// ignore quota / private-mode errors
		}
	}
}

function nowHHMM(): string {
	const d = new Date();
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const today = new Today();
