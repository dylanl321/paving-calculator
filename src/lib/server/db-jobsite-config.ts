import type { D1Database } from '../../cloudflare';
import type { DbJobSiteConfig, DbJobSiteRoute } from './db-jobsites';

export class DbJobSiteConfigHelper {
	constructor(private db: D1Database) {}

	// ── Job Site Config ───────────────────────────────────────────────────

	async getJobSiteConfig(jobSiteId: string): Promise<DbJobSiteConfig | null> {
		return await this.db
			.prepare('SELECT * FROM job_site_config WHERE job_site_id = ?')
			.bind(jobSiteId)
			.first<DbJobSiteConfig>();
	}

	async upsertJobSiteConfig(
		jobSiteId: string,
		config: Partial<Omit<DbJobSiteConfig, 'job_site_id' | 'created_at' | 'updated_at'>>
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const existing = await this.getJobSiteConfig(jobSiteId);

		// Columns added by a later migration. If the deployed DB hasn't had that
		// migration applied yet (code-before-migration deploy), writing them throws
		// "no such column"; we detect that and retry without them so the import
		// still succeeds rather than 500ing. The data is simply persisted once the
		// migration lands.
		const OPTIONAL_COLUMNS = new Set([
			'begin_terminus',
			'end_terminus',
			'begin_station',
			'end_station'
		]);
		const isMissingColumnError = (err: unknown): boolean =>
			err instanceof Error && /no such column|has no column named/i.test(err.message);

		if (!existing) {
			// All insertable columns in a stable order, paired with their value.
			const cols: Array<[string, string | number | null]> = [
				['road_type', config.road_type || null],
				['num_lanes', config.num_lanes || null],
				['lane_width_ft', config.lane_width_ft || null],
				['total_length_ft', config.total_length_ft || null],
				['scope_of_work', config.scope_of_work || null],
				['mix_type', config.mix_type || null],
				['target_thickness_in', config.target_thickness_in || null],
				['target_spread_rate', config.target_spread_rate || null],
				['tack_type', config.tack_type || null],
				['target_tack_rate', config.target_tack_rate || null],
				['notes', config.notes || null],
				['route_designation', config.route_designation || null],
				['route_county', config.route_county || null],
				['route_district', config.route_district || null],
				['route_functional_class', config.route_functional_class || null],
				['route_system_code', config.route_system_code || null],
				['begin_terminus', config.begin_terminus ?? null],
				['end_terminus', config.end_terminus ?? null],
				['begin_station', config.begin_station ?? null],
				['end_station', config.end_station ?? null]
			];

			const runInsert = async (includeOptional: boolean) => {
				const used = cols.filter(([c]) => includeOptional || !OPTIONAL_COLUMNS.has(c));
				const colNames = ['job_site_id', ...used.map(([c]) => c), 'created_at', 'updated_at'];
				const placeholders = colNames.map(() => '?').join(', ');
				const values = [jobSiteId, ...used.map(([, v]) => v), now, now];
				await this.db
					.prepare(
						`INSERT INTO job_site_config (${colNames.join(', ')}) VALUES (${placeholders})`
					)
					.bind(...values)
					.run();
			};

			try {
				await runInsert(true);
			} catch (err) {
				if (isMissingColumnError(err)) {
					console.error('[upsertJobSiteConfig] optional column missing, retrying without it:', err);
					await runInsert(false);
				} else {
					throw err;
				}
			}
			return;
		}

		await this.updateJobSiteConfigFields(jobSiteId, config, now, OPTIONAL_COLUMNS, isMissingColumnError);
	}

	/** Build + run the dynamic UPDATE for an existing config row, retrying without
	 *  optional (possibly-unmigrated) columns if the DB rejects them. */
	private async updateJobSiteConfigFields(
		jobSiteId: string,
		config: Partial<Omit<DbJobSiteConfig, 'job_site_id' | 'created_at' | 'updated_at'>>,
		now: number,
		optionalColumns: Set<string>,
		isMissingColumnError: (err: unknown) => boolean
	): Promise<void> {
		const allFields: Array<[string, string | number | null]> = [];
		const push = (col: keyof typeof config, value: string | number | null | undefined) => {
			if (value !== undefined) allFields.push([col as string, value as string | number | null]);
		};
		push('road_type', config.road_type);
		push('num_lanes', config.num_lanes);
		push('lane_width_ft', config.lane_width_ft);
		push('total_length_ft', config.total_length_ft);
		push('scope_of_work', config.scope_of_work);
		push('mix_type', config.mix_type);
		push('target_thickness_in', config.target_thickness_in);
		push('target_spread_rate', config.target_spread_rate);
		push('tack_type', config.tack_type);
		push('target_tack_rate', config.target_tack_rate);
		push('notes', config.notes);
		push('route_designation', config.route_designation);
		push('route_county', config.route_county);
		push('route_district', config.route_district);
		push('route_functional_class', config.route_functional_class);
		push('route_system_code', config.route_system_code);
		push('begin_terminus', config.begin_terminus);
		push('end_terminus', config.end_terminus);
		push('begin_station', config.begin_station);
		push('end_station', config.end_station);

		const runUpdate = async (includeOptional: boolean) => {
			const used = allFields.filter(([c]) => includeOptional || !optionalColumns.has(c));
			if (used.length === 0) return;
			const setClause = [...used.map(([c]) => `${c} = ?`), 'updated_at = ?'].join(', ');
			const values = [...used.map(([, v]) => v), now, jobSiteId];
			await this.db
				.prepare(`UPDATE job_site_config SET ${setClause} WHERE job_site_id = ?`)
				.bind(...values)
				.run();
		};

		try {
			await runUpdate(true);
		} catch (err) {
			if (isMissingColumnError(err)) {
				console.error('[upsertJobSiteConfig] optional column missing on update, retrying without it:', err);
				await runUpdate(false);
			} else {
				throw err;
			}
		}
	}

	// ── Job Site Route ────────────────────────────────────────────────────

	async getJobSiteRoute(jobSiteId: string): Promise<DbJobSiteRoute | null> {
		return await this.db
			.prepare('SELECT * FROM job_site_routes WHERE job_site_id = ?')
			.bind(jobSiteId)
			.first<DbJobSiteRoute>();
	}

	async upsertJobSiteRoute(
		jobSiteId: string,
		waypoints: Array<{ lat: number; lng: number }>
	): Promise<DbJobSiteRoute> {
		const now = Math.floor(Date.now() / 1000);
		const waypointsJson = JSON.stringify(waypoints);

		const existing = await this.getJobSiteRoute(jobSiteId);

		if (existing) {
			await this.db
				.prepare(
					'UPDATE job_site_routes SET waypoints = ?, updated_at = ? WHERE job_site_id = ?'
				)
				.bind(waypointsJson, now, jobSiteId)
				.run();
		} else {
			await this.db
				.prepare(
					'INSERT INTO job_site_routes (job_site_id, waypoints, created_at, updated_at) VALUES (?, ?, ?, ?)'
				)
				.bind(jobSiteId, waypointsJson, now, now)
				.run();
		}

		return {
			job_site_id: jobSiteId,
			waypoints: waypointsJson,
			created_at: existing?.created_at ?? now,
			updated_at: now
		};
	}
}
