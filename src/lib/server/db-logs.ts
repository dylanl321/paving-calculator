import type { D1Database } from '../../cloudflare';
import type { DbDotRoadSegment, DbDotSyncLog } from '$lib/types/dot';
export type { DbDotRoadSegment, DbDotSyncLog } from '$lib/types/dot';

export interface DbNotificationPref {
	user_id: string;
	pref_key: string;
	enabled: number;
	updated_at: number;
}

export interface DbEmailLog {
	id: string;
	to_email: string;
	from_email: string;
	subject: string;
	type: string;
	org_id: string | null;
	user_id: string | null;
	status: 'sent' | 'failed' | 'skipped_no_key';
	provider_message_id: string | null;
	error: string | null;
	created_at: number;
}

export interface DbNotificationSchedule {
	id: string;
	org_id: string;
	schedule_type: 'eod_summary' | 'weekly_report';
	enabled: number;
	send_time: string;
	timezone: string;
	recipients: string;
	created_at: number;
	updated_at: number;
}

export interface DbEmailReportSchedule {
	id: string;
	org_id: string;
	report_type: 'daily_summary' | 'weekly_rollup' | 'monthly_rollup';
	frequency: 'daily' | 'weekly' | 'monthly';
	send_hour: number;
	day_of_week: number | null;
	recipients: string;
	enabled: number;
	created_by: string;
	created_at: number;
	updated_at: number;
	last_sent_at: number | null;
}

export interface DbDailyLog {
	id: string;
	job_site_id: string;
	log_date: string; // YYYY-MM-DD
	created_by: string;
	weather_temp_f: number | null;
	weather_conditions: 'clear' | 'cloudy' | 'rain' | 'wind' | 'fog' | null;
	wind_speed_mph: number | null;
	is_raining: number | null; // 0 or 1 (SQLite boolean)
	weather_fetched_at: number | null; // unix ts — set when auto-fetch succeeds
	crew_count: number | null;
	start_time: string | null; // HH:MM
	end_time: string | null; // HH:MM
	notes: string | null;
	target_tons: number | null;
	target_loads: number | null;
	plant_name: string | null;
	mix_type: string | null;
	closed_at: number | null;
	foreman_name: string | null;
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
	waste_tons: number | null;
	created_at: number;
}

export interface LogSummary {
	total_distance_ft: number;
	total_tons: number;
	total_loads: number;
	total_tack_gallons: number;
	total_waste_tons: number;
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
			is_raining: null,
			weather_fetched_at: null,
			crew_count: null,
			start_time: null,
			end_time: null,
			notes: null,
			target_tons: null,
			target_loads: null,
			plant_name: null,
			mix_type: null,
			closed_at: null,
			foreman_name: null,
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
				| 'is_raining'
				| 'weather_fetched_at'
				| 'crew_count'
				| 'start_time'
				| 'end_time'
				| 'notes'
				| 'target_tons'
				| 'target_loads'
				| 'plant_name'
				| 'mix_type'
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
		if (updates.is_raining !== undefined) {
			fields.push('is_raining = ?');
			values.push(updates.is_raining);
		}
		if (updates.weather_fetched_at !== undefined) {
			fields.push('weather_fetched_at = ?');
			values.push(updates.weather_fetched_at);
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
		if (updates.target_tons !== undefined) {
			fields.push('target_tons = ?');
			values.push(updates.target_tons);
		}
		if (updates.target_loads !== undefined) {
			fields.push('target_loads = ?');
			values.push(updates.target_loads);
		}
		if (updates.plant_name !== undefined) {
			fields.push('plant_name = ?');
			values.push(updates.plant_name);
		}
		if (updates.mix_type !== undefined) {
			fields.push('mix_type = ?');
			values.push(updates.mix_type);
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

	async closeDailyLog(id: string, foremanName: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE daily_logs SET closed_at = ?, foreman_name = ?, updated_at = ? WHERE id = ?')
			.bind(now, foremanName, now, id)
			.run();
	}

	async reopenDailyLog(id: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE daily_logs SET closed_at = NULL, foreman_name = NULL, updated_at = ? WHERE id = ?')
			.bind(now, id)
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
			waste_tons?: number | null;
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
					tack_gallons, lane, notes, waste_tons, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
				entry.waste_tons ?? null,
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
			waste_tons: entry.waste_tons ?? null,
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
				| 'waste_tons'
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
		if (updates.waste_tons !== undefined) {
			fields.push('waste_tons = ?');
			values.push(updates.waste_tons);
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
		let totalWasteTons = 0;
		let pavingEntries = 0;
		let millingEntries = 0;
		let tackEntries = 0;

		for (const entry of entries) {
			if (entry.distance_ft) totalDistance += entry.distance_ft;
			if (entry.tons_placed) totalTons += entry.tons_placed;
			if (entry.loads_count) totalLoads += entry.loads_count;
			if (entry.tack_gallons) totalTackGallons += entry.tack_gallons;
			if (entry.waste_tons) totalWasteTons += entry.waste_tons;

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
			total_waste_tons: totalWasteTons,
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

	// ── Email Logging ─────────────────────────────────────────────────────

	async logEmail(entry: {
		to: string;
		from: string;
		subject: string;
		type: string;
		status: 'sent' | 'failed' | 'skipped_no_key';
		orgId?: string | null;
		userId?: string | null;
		providerMessageId?: string | null;
		error?: string | null;
	}): Promise<void> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				`INSERT INTO email_log (
					id, to_email, from_email, subject, type, org_id, user_id, status,
					provider_message_id, error, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				entry.to,
				entry.from,
				entry.subject,
				entry.type,
				entry.orgId ?? null,
				entry.userId ?? null,
				entry.status,
				entry.providerMessageId ?? null,
				entry.error ?? null,
				now
			)
			.run();
	}

	async getEmailLog(filters?: {
		status?: string;
		type?: string;
		toEmail?: string;
		failedOnly?: boolean;
		dateFrom?: number;
		dateTo?: number;
		orgId?: string;
		offset?: number;
		limit?: number;
	}): Promise<{ rows: DbEmailLog[]; total: number }> {
		let whereClause = 'WHERE 1=1';
		const bindings: (string | number)[] = [];

		if (filters?.status) {
			whereClause += ' AND status = ?';
			bindings.push(filters.status);
		}
		if (filters?.failedOnly) {
			whereClause += " AND status IN ('failed', 'skipped_no_key')";
		}
		if (filters?.type) {
			whereClause += ' AND type = ?';
			bindings.push(filters.type);
		}
		if (filters?.toEmail) {
			whereClause += ' AND to_email LIKE ?';
			bindings.push(`%${filters.toEmail}%`);
		}
		if (filters?.dateFrom) {
			whereClause += ' AND created_at >= ?';
			bindings.push(filters.dateFrom);
		}
		if (filters?.dateTo) {
			whereClause += ' AND created_at <= ?';
			bindings.push(filters.dateTo);
		}
		if (filters?.orgId) {
			whereClause += ' AND org_id = ?';
			bindings.push(filters.orgId);
		}

		const countQuery = `SELECT COUNT(*) as count FROM email_log ${whereClause}`;
		const countResult = await this.db
			.prepare(countQuery)
			.bind(...bindings)
			.first<{ count: number }>();
		const total = countResult?.count ?? 0;

		const dataQuery = `SELECT * FROM email_log ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
		const limit = filters?.limit ?? 50;
		const offset = filters?.offset ?? 0;
		const rows = await this.db
			.prepare(dataQuery)
			.bind(...bindings, limit, offset)
			.all<DbEmailLog>()
			.then((r) => r.results);

		return { rows, total };
	}

	// ── Notification Preferences ──────────────────────────────────────────

	async getNotificationPrefs(userId: string): Promise<DbNotificationPref[]> {
		return await this.db
			.prepare('SELECT * FROM user_notification_prefs WHERE user_id = ?')
			.bind(userId)
			.all<DbNotificationPref>()
			.then((r) => r.results);
	}

	async bulkSetNotificationPrefs(
		userId: string,
		prefs: Record<string, boolean>
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		for (const [key, enabled] of Object.entries(prefs)) {
			await this.db
				.prepare(
					`INSERT INTO user_notification_prefs (user_id, pref_key, enabled, updated_at)
					VALUES (?, ?, ?, ?)
					ON CONFLICT(user_id, pref_key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
				)
				.bind(userId, key, enabled ? 1 : 0, now)
				.run();
		}
	}

	// ── DOT Road Segments ─────────────────────────────────────────────────

	async upsertDotSegment(
		row: Omit<DbDotRoadSegment, 'id' | 'fetched_at' | 'updated_at'>
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				`INSERT INTO dot_road_segments
					(state_dot, source, external_id, road_name, route_id, functional_class, surface_type,
					 iri, pci, psr, begin_milepost, end_milepost, length_miles, lanes, aadt,
					 district_code, county_code, geometry_geojson, raw_json, data_year,
					 fetched_at, updated_at)
				VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
				ON CONFLICT(state_dot, source, external_id)
				DO UPDATE SET
					road_name=excluded.road_name, route_id=excluded.route_id,
					functional_class=excluded.functional_class, surface_type=excluded.surface_type,
					iri=excluded.iri, pci=excluded.pci, psr=excluded.psr,
					begin_milepost=excluded.begin_milepost, end_milepost=excluded.end_milepost,
					length_miles=excluded.length_miles, lanes=excluded.lanes, aadt=excluded.aadt,
					district_code=excluded.district_code, county_code=excluded.county_code,
					geometry_geojson=excluded.geometry_geojson, raw_json=excluded.raw_json,
					data_year=excluded.data_year, fetched_at=excluded.fetched_at,
					updated_at=excluded.updated_at`
			)
			.bind(
				row.state_dot, row.source, row.external_id, row.road_name, row.route_id,
				row.functional_class, row.surface_type, row.iri, row.pci, row.psr,
				row.begin_milepost, row.end_milepost, row.length_miles, row.lanes, row.aadt,
				row.district_code, row.county_code, row.geometry_geojson, row.raw_json,
				row.data_year, now, now
			)
			.run();
	}

	async getDotSegmentsByState(stateDot: string, limit = 500): Promise<DbDotRoadSegment[]> {
		return await this.db
			.prepare('SELECT * FROM dot_road_segments WHERE state_dot = ? LIMIT ?')
			.bind(stateDot, limit)
			.all<DbDotRoadSegment>()
			.then((r) => r.results);
	}

	async getDotSegmentsByRoute(stateDot: string, routeId: string): Promise<DbDotRoadSegment[]> {
		return await this.db
			.prepare('SELECT * FROM dot_road_segments WHERE state_dot = ? AND route_id = ?')
			.bind(stateDot, routeId)
			.all<DbDotRoadSegment>()
			.then((r) => r.results);
	}

	async logDotSync(
		stateDot: string,
		source: string,
		status: 'success' | 'partial' | 'failed',
		recordsUpserted: number,
		errorMessage: string | null = null
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				`INSERT INTO dot_sync_log (state_dot, source, status, records_upserted, error_message, synced_at)
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(stateDot, source, status, recordsUpserted, errorMessage, now)
			.run();
	}

	async getLastDotSync(stateDot: string, source: string): Promise<DbDotSyncLog | null> {
		return await this.db
			.prepare(
				'SELECT * FROM dot_sync_log WHERE state_dot = ? AND source = ? ORDER BY synced_at DESC LIMIT 1'
			)
			.bind(stateDot, source)
			.first<DbDotSyncLog>();
	}

	// ── Email Report Schedules ────────────────────────────────────────────

	async getEmailReportSchedules(orgId: string): Promise<DbEmailReportSchedule[]> {
		return await this.db
			.prepare('SELECT * FROM email_report_schedules WHERE org_id = ? ORDER BY created_at DESC')
			.bind(orgId)
			.all<DbEmailReportSchedule>()
			.then((r) => r.results);
	}

	async upsertEmailReportSchedule(
		schedule: Omit<DbEmailReportSchedule, 'created_at' | 'updated_at' | 'last_sent_at'>
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const existing = await this.db
			.prepare('SELECT id FROM email_report_schedules WHERE id = ?')
			.bind(schedule.id)
			.first<{ id: string }>();

		if (existing) {
			await this.db
				.prepare(
					`UPDATE email_report_schedules
					 SET report_type = ?, frequency = ?, send_hour = ?, day_of_week = ?,
					     recipients = ?, enabled = ?, updated_at = ?
					 WHERE id = ?`
				)
				.bind(
					schedule.report_type,
					schedule.frequency,
					schedule.send_hour,
					schedule.day_of_week,
					schedule.recipients,
					schedule.enabled,
					now,
					schedule.id
				)
				.run();
		} else {
			await this.db
				.prepare(
					`INSERT INTO email_report_schedules
					 (id, org_id, report_type, frequency, send_hour, day_of_week, recipients, enabled, created_by, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					schedule.id,
					schedule.org_id,
					schedule.report_type,
					schedule.frequency,
					schedule.send_hour,
					schedule.day_of_week,
					schedule.recipients,
					schedule.enabled,
					schedule.created_by,
					now,
					now
				)
				.run();
		}
	}

	async deleteEmailReportSchedule(id: string, orgId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM email_report_schedules WHERE id = ? AND org_id = ?')
			.bind(id, orgId)
			.run();
	}

	async markEmailReportScheduleSent(id: string, sentAt: number): Promise<void> {
		await this.db
			.prepare('UPDATE email_report_schedules SET last_sent_at = ? WHERE id = ?')
			.bind(sentAt, id)
			.run();
	}

	// ── Notification Schedules ────────────────────────────────────────────

	async getNotificationSchedules(orgId: string): Promise<DbNotificationSchedule[]> {
		return await this.db
			.prepare('SELECT * FROM notification_schedules WHERE org_id = ? ORDER BY schedule_type ASC')
			.bind(orgId)
			.all<DbNotificationSchedule>()
			.then((r) => r.results);
	}

	async upsertNotificationSchedule(
		schedule: Omit<DbNotificationSchedule, 'created_at' | 'updated_at'>
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				`INSERT INTO notification_schedules (id, org_id, schedule_type, enabled, send_time, timezone, recipients, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(org_id, schedule_type) DO UPDATE SET
				   enabled = excluded.enabled,
				   send_time = excluded.send_time,
				   timezone = excluded.timezone,
				   recipients = excluded.recipients,
				   updated_at = excluded.updated_at`
			)
			.bind(
				schedule.id,
				schedule.org_id,
				schedule.schedule_type,
				schedule.enabled,
				schedule.send_time,
				schedule.timezone,
				schedule.recipients,
				now,
				now
			)
			.run();
	}

	async deleteNotificationSchedule(id: string, orgId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM notification_schedules WHERE id = ? AND org_id = ?')
			.bind(id, orgId)
			.run();
	}
}
