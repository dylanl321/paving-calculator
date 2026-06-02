import type { D1Database } from '../../cloudflare';

export interface DbDailyLog {
	id: string;
	job_site_id: string;
	log_date: string; // YYYY-MM-DD
	created_by: string;
	weather_temp_f: number | null;
	weather_conditions: 'clear' | 'cloudy' | 'rain' | 'wind' | 'fog' | null;
	wind_speed_mph: number | null;
	crew_count: number | null;
	start_time: string | null; // HH:MM
	end_time: string | null; // HH:MM
	notes: string | null;
	created_at: number;
	updated_at: number;
}

export interface DbLogEntry {
	id: string;
	daily_log_id: string;
	entry_type: 'paving' | 'milling' | 'tack' | 'break' | 'delay' | 'note';
	timestamp: string; // HH:MM
	station_start: number | null;
	station_end: number | null;
	distance_ft: number | null;
	tons_placed: number | null;
	loads_count: number | null;
	truck_tickets: string | null; // JSON array
	spread_rate_actual: number | null;
	tack_gallons: number | null;
	lane: string | null;
	notes: string | null;
	created_at: number;
}

export interface LogSummary {
	total_distance_ft: number;
	total_tons: number;
	total_loads: number;
	total_tack_gallons: number;
	hours_worked: number;
	paving_entries: number;
	milling_entries: number;
	tack_entries: number;
}

export interface DbDensityReading {
	id: string;
	daily_log_id: string;
	station_number: number;
	lane: string | null;
	reading_number: number;
	wet_density_pcf: number;
	moisture_pct: number;
	dry_density_pcf: number | null;
	target_density_pcf: number | null;
	compaction_pct: number | null;
	depth_in: number | null;
	notes: string | null;
	created_at: number;
}

export class DbLogHelper {
	constructor(private db: D1Database) {}

	async getDailyLog(jobSiteId: string, logDate: string): Promise<DbDailyLog | null> {
		return await this.db
			.prepare('SELECT * FROM daily_logs WHERE job_site_id = ? AND log_date = ?')
			.bind(jobSiteId, logDate)
			.first<DbDailyLog>();
	}

	async getDailyLogById(id: string): Promise<DbDailyLog | null> {
		return await this.db
			.prepare('SELECT * FROM daily_logs WHERE id = ?')
			.bind(id)
			.first<DbDailyLog>();
	}

	async createDailyLog(
		jobSiteId: string,
		logDate: string,
		createdBy: string
	): Promise<DbDailyLog> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				'INSERT INTO daily_logs (id, job_site_id, log_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(id, jobSiteId, logDate, createdBy, now, now)
			.run();

		return {
			id,
			job_site_id: jobSiteId,
			log_date: logDate,
			created_by: createdBy,
			weather_temp_f: null,
			weather_conditions: null,
			wind_speed_mph: null,
			crew_count: null,
			start_time: null,
			end_time: null,
			notes: null,
			created_at: now,
			updated_at: now
		};
	}

	async updateDailyLog(
		id: string,
		updates: Partial<
			Pick<
				DbDailyLog,
				| 'weather_temp_f'
				| 'weather_conditions'
				| 'wind_speed_mph'
				| 'crew_count'
				| 'start_time'
				| 'end_time'
				| 'notes'
			>
		>
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (updates.weather_temp_f !== undefined) {
			fields.push('weather_temp_f = ?');
			values.push(updates.weather_temp_f);
		}
		if (updates.weather_conditions !== undefined) {
			fields.push('weather_conditions = ?');
			values.push(updates.weather_conditions);
		}
		if (updates.wind_speed_mph !== undefined) {
			fields.push('wind_speed_mph = ?');
			values.push(updates.wind_speed_mph);
		}
		if (updates.crew_count !== undefined) {
			fields.push('crew_count = ?');
			values.push(updates.crew_count);
		}
		if (updates.start_time !== undefined) {
			fields.push('start_time = ?');
			values.push(updates.start_time);
		}
		if (updates.end_time !== undefined) {
			fields.push('end_time = ?');
			values.push(updates.end_time);
		}
		if (updates.notes !== undefined) {
			fields.push('notes = ?');
			values.push(updates.notes);
		}

		if (fields.length === 0) return;

		fields.push('updated_at = ?');
		values.push(now);
		values.push(id);

		await this.db
			.prepare(`UPDATE daily_logs SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async listDailyLogs(jobSiteId: string, limit = 50, offset = 0): Promise<DbDailyLog[]> {
		return await this.db
			.prepare(
				'SELECT * FROM daily_logs WHERE job_site_id = ? ORDER BY log_date DESC LIMIT ? OFFSET ?'
			)
			.bind(jobSiteId, limit, offset)
			.all<DbDailyLog>()
			.then((r) => r.results);
	}

	async createLogEntry(
		dailyLogId: string,
		entry: {
			entry_type: DbLogEntry['entry_type'];
			timestamp: string;
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
		}
	): Promise<DbLogEntry> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		// Auto-calculate distance from stations if both provided
		let distance = entry.distance_ft;
		if (!distance && entry.station_start != null && entry.station_end != null) {
			distance = (entry.station_end - entry.station_start) * 100;
		}

		const truckTicketsJson = entry.truck_tickets ? JSON.stringify(entry.truck_tickets) : null;

		await this.db
			.prepare(
				`INSERT INTO log_entries (
					id, daily_log_id, entry_type, timestamp, station_start, station_end,
					distance_ft, tons_placed, loads_count, truck_tickets, spread_rate_actual,
					tack_gallons, lane, notes, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				dailyLogId,
				entry.entry_type,
				entry.timestamp,
				entry.station_start ?? null,
				entry.station_end ?? null,
				distance ?? null,
				entry.tons_placed ?? null,
				entry.loads_count ?? null,
				truckTicketsJson,
				entry.spread_rate_actual ?? null,
				entry.tack_gallons ?? null,
				entry.lane ?? null,
				entry.notes ?? null,
				now
			)
			.run();

		return {
			id,
			daily_log_id: dailyLogId,
			entry_type: entry.entry_type,
			timestamp: entry.timestamp,
			station_start: entry.station_start ?? null,
			station_end: entry.station_end ?? null,
			distance_ft: distance ?? null,
			tons_placed: entry.tons_placed ?? null,
			loads_count: entry.loads_count ?? null,
			truck_tickets: truckTicketsJson,
			spread_rate_actual: entry.spread_rate_actual ?? null,
			tack_gallons: entry.tack_gallons ?? null,
			lane: entry.lane ?? null,
			notes: entry.notes ?? null,
			created_at: now
		};
	}

	async updateLogEntry(
		id: string,
		updates: Partial<
			Pick<
				DbLogEntry,
				| 'timestamp'
				| 'station_start'
				| 'station_end'
				| 'distance_ft'
				| 'tons_placed'
				| 'loads_count'
				| 'truck_tickets'
				| 'spread_rate_actual'
				| 'tack_gallons'
				| 'lane'
				| 'notes'
			>
		>
	): Promise<void> {
		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (updates.timestamp !== undefined) {
			fields.push('timestamp = ?');
			values.push(updates.timestamp);
		}
		if (updates.station_start !== undefined) {
			fields.push('station_start = ?');
			values.push(updates.station_start);
		}
		if (updates.station_end !== undefined) {
			fields.push('station_end = ?');
			values.push(updates.station_end);
		}
		if (updates.distance_ft !== undefined) {
			fields.push('distance_ft = ?');
			values.push(updates.distance_ft);
		}
		if (updates.tons_placed !== undefined) {
			fields.push('tons_placed = ?');
			values.push(updates.tons_placed);
		}
		if (updates.loads_count !== undefined) {
			fields.push('loads_count = ?');
			values.push(updates.loads_count);
		}
		if (updates.truck_tickets !== undefined) {
			fields.push('truck_tickets = ?');
			values.push(updates.truck_tickets);
		}
		if (updates.spread_rate_actual !== undefined) {
			fields.push('spread_rate_actual = ?');
			values.push(updates.spread_rate_actual);
		}
		if (updates.tack_gallons !== undefined) {
			fields.push('tack_gallons = ?');
			values.push(updates.tack_gallons);
		}
		if (updates.lane !== undefined) {
			fields.push('lane = ?');
			values.push(updates.lane);
		}
		if (updates.notes !== undefined) {
			fields.push('notes = ?');
			values.push(updates.notes);
		}

		if (fields.length === 0) return;
		values.push(id);

		await this.db
			.prepare(`UPDATE log_entries SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async deleteLogEntry(id: string): Promise<void> {
		await this.db.prepare('DELETE FROM log_entries WHERE id = ?').bind(id).run();
	}

	async getLogEntries(dailyLogId: string): Promise<DbLogEntry[]> {
		return await this.db
			.prepare('SELECT * FROM log_entries WHERE daily_log_id = ? ORDER BY timestamp ASC')
			.bind(dailyLogId)
			.all<DbLogEntry>()
			.then((r) => r.results);
	}

	async getLogEntryById(id: string): Promise<DbLogEntry | null> {
		return await this.db
			.prepare('SELECT * FROM log_entries WHERE id = ?')
			.bind(id)
			.first<DbLogEntry>();
	}

	async getLogSummary(dailyLogId: string): Promise<LogSummary> {
		const entries = await this.getLogEntries(dailyLogId);
		const log = await this.getDailyLogById(dailyLogId);

		let totalDistance = 0;
		let totalTons = 0;
		let totalLoads = 0;
		let totalTackGallons = 0;
		let pavingEntries = 0;
		let millingEntries = 0;
		let tackEntries = 0;

		for (const entry of entries) {
			if (entry.distance_ft) totalDistance += entry.distance_ft;
			if (entry.tons_placed) totalTons += entry.tons_placed;
			if (entry.loads_count) totalLoads += entry.loads_count;
			if (entry.tack_gallons) totalTackGallons += entry.tack_gallons;

			if (entry.entry_type === 'paving') pavingEntries++;
			if (entry.entry_type === 'milling') millingEntries++;
			if (entry.entry_type === 'tack') tackEntries++;
		}

		let hoursWorked = 0;
		if (log?.start_time && log?.end_time) {
			const [startHour, startMin] = log.start_time.split(':').map(Number);
			const [endHour, endMin] = log.end_time.split(':').map(Number);
			hoursWorked = endHour + endMin / 60 - (startHour + startMin / 60);
		}

		return {
			total_distance_ft: totalDistance,
			total_tons: totalTons,
			total_loads: totalLoads,
			total_tack_gallons: totalTackGallons,
			hours_worked: hoursWorked,
			paving_entries: pavingEntries,
			milling_entries: millingEntries,
			tack_entries: tackEntries
		};
	}

	async getProjectSummary(jobSiteId: string): Promise<{
		total_distance_ft: number;
		total_tons: number;
		total_loads: number;
		total_tack_gallons: number;
		total_days: number;
		total_hours: number;
	}> {
		const logs = await this.db
			.prepare('SELECT * FROM daily_logs WHERE job_site_id = ?')
			.bind(jobSiteId)
			.all<DbDailyLog>()
			.then((r) => r.results);

		let totalDistance = 0;
		let totalTons = 0;
		let totalLoads = 0;
		let totalTackGallons = 0;
		let totalHours = 0;

		for (const log of logs) {
			const summary = await this.getLogSummary(log.id);
			totalDistance += summary.total_distance_ft;
			totalTons += summary.total_tons;
			totalLoads += summary.total_loads;
			totalTackGallons += summary.total_tack_gallons;
			totalHours += summary.hours_worked;
		}

		return {
			total_distance_ft: totalDistance,
			total_tons: totalTons,
			total_loads: totalLoads,
			total_tack_gallons: totalTackGallons,
			total_days: logs.length,
			total_hours: totalHours
		};
	}

	async addDensityReading(
		dailyLogId: string,
		reading: {
			station_number: number;
			lane?: string | null;
			reading_number?: number;
			wet_density_pcf: number;
			moisture_pct: number;
			target_density_pcf?: number | null;
			depth_in?: number | null;
			notes?: string | null;
		}
	): Promise<DbDensityReading> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		// Calculate dry density: wet_density / (1 + moisture/100)
		const dryDensity = reading.wet_density_pcf / (1 + reading.moisture_pct / 100);

		// Calculate compaction %: (dry_density / target) * 100
		const compactionPct =
			reading.target_density_pcf && reading.target_density_pcf > 0
				? (dryDensity / reading.target_density_pcf) * 100
				: null;

		await this.db
			.prepare(
				`INSERT INTO density_readings (
					id, daily_log_id, station_number, lane, reading_number,
					wet_density_pcf, moisture_pct, dry_density_pcf,
					target_density_pcf, compaction_pct, depth_in, notes, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				dailyLogId,
				reading.station_number,
				reading.lane ?? null,
				reading.reading_number ?? 1,
				reading.wet_density_pcf,
				reading.moisture_pct,
				dryDensity,
				reading.target_density_pcf ?? null,
				compactionPct,
				reading.depth_in ?? null,
				reading.notes ?? null,
				now
			)
			.run();

		return {
			id,
			daily_log_id: dailyLogId,
			station_number: reading.station_number,
			lane: reading.lane ?? null,
			reading_number: reading.reading_number ?? 1,
			wet_density_pcf: reading.wet_density_pcf,
			moisture_pct: reading.moisture_pct,
			dry_density_pcf: dryDensity,
			target_density_pcf: reading.target_density_pcf ?? null,
			compaction_pct: compactionPct,
			depth_in: reading.depth_in ?? null,
			notes: reading.notes ?? null,
			created_at: now
		};
	}

	async getDensityReadings(dailyLogId: string): Promise<DbDensityReading[]> {
		return await this.db
			.prepare('SELECT * FROM density_readings WHERE daily_log_id = ? ORDER BY station_number ASC, reading_number ASC')
			.bind(dailyLogId)
			.all<DbDensityReading>()
			.then((r) => r.results);
	}

	async deleteDensityReading(id: string): Promise<void> {
		await this.db.prepare('DELETE FROM density_readings WHERE id = ?').bind(id).run();
	}
}
