import type { D1Database } from '../../cloudflare';

export interface DbJobSite {
	id: string;
	org_id: string;
	name: string;
	location_description: string | null;
	latitude: number | null;
	longitude: number | null;
	gdot_county: string | null;
	gdot_district: string | null;
	status: 'active' | 'completed' | 'archived';
	job_number: string | null;
	project_number: string | null;
	contract_id: string | null;
	work_type: string | null;
	contract_type: string | null;
	contract_amount: number | null;
	retainage_pct: number | null;
	est_start_date: string | null;
	completion_date: string | null;
	customer_name: string | null;
	customer_address: string | null;
	customer_contact: string | null;
	customer_phone: string | null;
	customer_email: string | null;
	owner_name: string | null;
	owner_address: string | null;
	project_manager: string | null;
	asphalt_supplier: string | null;
	import_source_key: string | null;
	scopes_json: string | null;
	created_at: number;
	updated_at: number;
}

export type JobSiteContractMeta = Partial<
	Pick<
		DbJobSite,
		| 'job_number'
		| 'project_number'
		| 'contract_id'
		| 'work_type'
		| 'contract_type'
		| 'contract_amount'
		| 'retainage_pct'
		| 'est_start_date'
		| 'completion_date'
		| 'customer_name'
		| 'customer_address'
		| 'customer_contact'
		| 'customer_phone'
		| 'customer_email'
		| 'owner_name'
		| 'owner_address'
		| 'project_manager'
		| 'asphalt_supplier'
		| 'import_source_key'
		| 'scopes_json'
	>
>;

export interface DbBidItem {
	id: string;
	job_site_id: string;
	line_number: string | null;
	item_id: string | null;
	description: string;
	quantity: number | null;
	unit: string | null;
	unit_price: number | null;
	bid_amount: number | null;
	section: string | null;
	is_alternate: number;
	selected: number;
	sort_order: number;
	created_at: number;
}

export interface DbProductionMix {
	id: string;
	job_site_id: string;
	mix_name: string;
	unit: string | null;
	bid_quantity: number | null;
	takeoff_tonnage: number | null;
	quantity_per_day: number | null;
	est_days: number | null;
	mix_type: string | null;
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	tack_type: 'anionic' | 'cationic' | 'polymer_modified' | 'trackless' | null;
	target_tack_rate: number | null;
	contract_unit_price: number | null;
	is_active: number;
	sort_order: number;
	created_at: number;
}

export interface DbSchematic {
	id: string;
	job_site_id: string;
	r2_key: string;
	page_number: number | null;
	label: string | null;
	content_type: string;
	sort_order: number;
	created_at: number;
}

export interface DbJobDocument {
	id: string;
	job_site_id: string;
	r2_key: string;
	filename: string;
	doc_type: string | null;
	content_type: string;
	created_at: number;
}

export interface DbJobSiteAssignment {
	job_site_id: string;
	user_id: string;
	assigned_at: number;
	role: 'foreman' | 'operator' | 'inspector';
}

export interface DbCalculation {
	id: string;
	job_site_id: string;
	user_id: string;
	calc_type: 'spread_rate' | 'feet_left' | 'tonnage' | 'tack_rate' | 'stick_check';
	inputs: string;
	result: string;
	notes: string | null;
	created_at: number;
}

export interface DbJobSiteConfig {
	job_site_id: string;
	road_type:
		| 'highway'
		| 'state_route'
		| 'county_road'
		| 'city_street'
		| 'subdivision'
		| 'parking_lot'
		| 'other'
		| null;
	num_lanes: number | null;
	lane_width_ft: number | null;
	total_length_ft: number | null;
	scope_of_work:
		| 'full_depth'
		| 'mill_and_fill'
		| 'overlay'
		| 'leveling'
		| 'patching'
		| 'widening'
		| null;
	mix_type: string | null;
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	tack_type: 'anionic' | 'cationic' | 'polymer_modified' | 'trackless' | null;
	target_tack_rate: number | null;
	notes: string | null;
	route_designation: string | null;
	route_county: string | null;
	route_district: string | null;
	route_functional_class: string | null;
	route_system_code: string | null;
	total_tonnage: number | null;
	cost_per_ton: number | null;
	cost_per_sy: number | null;
	cost_per_mile: number | null;
	total_contract_value: number | null;
	created_at: number;
	updated_at: number;
}

export interface DbJobSiteEquipment {
	id: string;
	job_site_id: string;
	equipment_type:
		| 'paver'
		| 'shuttle_buggy'
		| 'roller_breakdown'
		| 'roller_intermediate'
		| 'roller_finish'
		| 'distributor'
		| 'milling_machine'
		| 'other';
	name: string;
	capacity: string | null;
	notes: string | null;
	created_at: number;
}

export interface DbJobSiteRoute {
	job_site_id: string;
	waypoints: string;
	created_at: number;
	updated_at: number;
}

export interface DbRoadSection {
	id: string;
	job_site_id: string;
	name: string;
	lane: string;
	station_start: number | null;
	station_end: number | null;
	status: 'active' | 'completed' | 'skipped';
	geometry_geojson: string | null;
	notes: string | null;
	sort_order: number;
	created_at: number;
	updated_at: number;
}

export interface DbLoad {
	id: string;
	job_site_id: string;
	user_id: string;
	ticket_number: string | null;
	tons: number;
	timestamp: number;
	spread_rate: number | null;
	notes: string | null;
	lane_number: number | null;
	pass_number: number | null;
	created_at: number;
	rejected: number;
	rejection_reason: string | null;
	rejection_notes: string | null;
	ticket_photo_id: string | null;
}

export class DbJobSitesHelper {
	constructor(private db: D1Database) {}

	// ── Job Sites CRUD ────────────────────────────────────────────────────

	async createJobSite(
		orgId: string,
		name: string,
		locationDescription: string | null,
		latitude: number | null = null,
		longitude: number | null = null
	): Promise<DbJobSite> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				'INSERT INTO job_sites (id, org_id, name, location_description, latitude, longitude, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(id, orgId, name, locationDescription, latitude, longitude, 'active', now, now)
			.run();

		return {
			id,
			org_id: orgId,
			name,
			location_description: locationDescription,
			latitude,
			longitude,
			gdot_county: null,
			gdot_district: null,
			status: 'active',
			job_number: null,
			project_number: null,
			contract_id: null,
			work_type: null,
			contract_type: null,
			contract_amount: null,
			retainage_pct: null,
			est_start_date: null,
			completion_date: null,
			customer_name: null,
			customer_address: null,
			customer_contact: null,
			customer_phone: null,
			customer_email: null,
			owner_name: null,
			owner_address: null,
			project_manager: null,
			asphalt_supplier: null,
			import_source_key: null,
			scopes_json: null,
			created_at: now,
			updated_at: now
		};
	}

	async getJobSitesByOrgId(orgId: string): Promise<DbJobSite[]> {
		return await this.db
			.prepare('SELECT * FROM job_sites WHERE org_id = ? ORDER BY created_at DESC')
			.bind(orgId)
			.all<DbJobSite>()
			.then((r) => r.results);
	}

	async getJobSiteById(id: string): Promise<DbJobSite | null> {
		return await this.db.prepare('SELECT * FROM job_sites WHERE id = ?').bind(id).first<DbJobSite>();
	}

	async updateJobSite(
		id: string,
		updates: Partial<Pick<DbJobSite, 'name' | 'location_description' | 'latitude' | 'longitude' | 'gdot_county' | 'gdot_district' | 'status'>>
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (updates.name !== undefined) {
			fields.push('name = ?');
			values.push(updates.name);
		}
		if (updates.location_description !== undefined) {
			fields.push('location_description = ?');
			values.push(updates.location_description || '');
		}
		if (updates.latitude !== undefined) {
			fields.push('latitude = ?');
			values.push(updates.latitude);
		}
		if (updates.longitude !== undefined) {
			fields.push('longitude = ?');
			values.push(updates.longitude);
		}
		if (updates.gdot_county !== undefined) {
			fields.push('gdot_county = ?');
			values.push(updates.gdot_county);
		}
		if (updates.gdot_district !== undefined) {
			fields.push('gdot_district = ?');
			values.push(updates.gdot_district);
		}
		if (updates.status !== undefined) {
			fields.push('status = ?');
			values.push(updates.status);
		}

		if (fields.length === 0) return;

		fields.push('updated_at = ?');
		values.push(now);
		values.push(id);

		await this.db
			.prepare(`UPDATE job_sites SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async setJobSiteContractMeta(id: string, meta: JobSiteContractMeta): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const columns: (keyof JobSiteContractMeta)[] = [
			'job_number',
			'project_number',
			'contract_id',
			'work_type',
			'contract_type',
			'contract_amount',
			'retainage_pct',
			'est_start_date',
			'completion_date',
			'customer_name',
			'customer_address',
			'customer_contact',
			'customer_phone',
			'customer_email',
			'owner_name',
			'owner_address',
			'project_manager',
			'asphalt_supplier',
			'import_source_key',
			'scopes_json'
		];

		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		for (const col of columns) {
			const value = meta[col];
			if (value !== undefined) {
				fields.push(`${col} = ?`);
				values.push(value);
			}
		}

		if (fields.length === 0) return;

		fields.push('updated_at = ?');
		values.push(now);
		values.push(id);

		await this.db
			.prepare(`UPDATE job_sites SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async getJobSiteCountByOrgId(orgId: string): Promise<number> {
		const row = await this.db
			.prepare('SELECT COUNT(*) as c FROM job_sites WHERE org_id = ?')
			.bind(orgId)
			.first<{ c: number }>();
		return row?.c ?? 0;
	}

	// ── Bid Items ─────────────────────────────────────────────────────────

	async getBidItems(jobSiteId: string): Promise<DbBidItem[]> {
		return await this.db
			.prepare('SELECT * FROM job_bid_items WHERE job_site_id = ? ORDER BY sort_order ASC, created_at ASC')
			.bind(jobSiteId)
			.all<DbBidItem>()
			.then((r) => r.results);
	}

	async createBidItem(
		jobSiteId: string,
		item: Omit<DbBidItem, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbBidItem> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				`INSERT INTO job_bid_items (
					id, job_site_id, line_number, item_id, description, quantity,
					unit, unit_price, bid_amount, section, is_alternate, selected,
					sort_order, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				jobSiteId,
				item.line_number ?? null,
				item.item_id ?? null,
				item.description,
				item.quantity ?? null,
				item.unit ?? null,
				item.unit_price ?? null,
				item.bid_amount ?? null,
				item.section ?? null,
				item.is_alternate ?? 0,
				item.selected ?? 1,
				item.sort_order ?? 0,
				now
			)
			.run();

		return { id, job_site_id: jobSiteId, created_at: now, ...item };
	}

	async deleteBidItems(jobSiteId: string): Promise<void> {
		await this.db.prepare('DELETE FROM job_bid_items WHERE job_site_id = ?').bind(jobSiteId).run();
	}

	// ── Production Mixes ──────────────────────────────────────────────────

	async getProductionMixes(jobSiteId: string): Promise<DbProductionMix[]> {
		return await this.db
			.prepare('SELECT * FROM job_production_mixes WHERE job_site_id = ? ORDER BY sort_order ASC, created_at ASC')
			.bind(jobSiteId)
			.all<DbProductionMix>()
			.then((r) => r.results);
	}

	async createProductionMix(
		jobSiteId: string,
		mix: Omit<DbProductionMix, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbProductionMix> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				`INSERT INTO job_production_mixes (
					id, job_site_id, mix_name, unit, bid_quantity, takeoff_tonnage,
					quantity_per_day, est_days, mix_type, target_thickness_in,
					target_spread_rate, tack_type, target_tack_rate, contract_unit_price,
					is_active, sort_order, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				jobSiteId,
				mix.mix_name,
				mix.unit ?? null,
				mix.bid_quantity ?? null,
				mix.takeoff_tonnage ?? null,
				mix.quantity_per_day ?? null,
				mix.est_days ?? null,
				mix.mix_type ?? null,
				mix.target_thickness_in ?? null,
				mix.target_spread_rate ?? null,
				mix.tack_type ?? null,
				mix.target_tack_rate ?? null,
				mix.contract_unit_price ?? null,
				mix.is_active ?? 0,
				mix.sort_order ?? 0,
				now
			)
			.run();

		return { id, job_site_id: jobSiteId, created_at: now, ...mix };
	}

	async getProductionMix(mixId: string): Promise<DbProductionMix | null> {
		return await this.db
			.prepare('SELECT * FROM job_production_mixes WHERE id = ?')
			.bind(mixId)
			.first<DbProductionMix>();
	}

	async updateProductionMix(
		mixId: string,
		updates: Partial<Omit<DbProductionMix, 'id' | 'job_site_id' | 'created_at'>>
	): Promise<void> {
		const columns: (keyof typeof updates)[] = [
			'mix_name',
			'unit',
			'bid_quantity',
			'takeoff_tonnage',
			'quantity_per_day',
			'est_days',
			'mix_type',
			'target_thickness_in',
			'target_spread_rate',
			'tack_type',
			'target_tack_rate',
			'contract_unit_price',
			'is_active',
			'sort_order'
		];
		const fields: string[] = [];
		const values: (string | number | null)[] = [];
		for (const col of columns) {
			const value = updates[col];
			if (value !== undefined) {
				fields.push(`${col} = ?`);
				values.push(value as string | number | null);
			}
		}
		if (fields.length === 0) return;
		values.push(mixId);
		await this.db
			.prepare(`UPDATE job_production_mixes SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async setActiveMix(jobSiteId: string, mixId: string): Promise<void> {
		await this.db
			.prepare('UPDATE job_production_mixes SET is_active = 0 WHERE job_site_id = ?')
			.bind(jobSiteId)
			.run();
		await this.db
			.prepare('UPDATE job_production_mixes SET is_active = 1 WHERE id = ? AND job_site_id = ?')
			.bind(mixId, jobSiteId)
			.run();
	}

	async deleteProductionMix(mixId: string): Promise<void> {
		await this.db.prepare('DELETE FROM job_production_mixes WHERE id = ?').bind(mixId).run();
	}

	async deleteProductionMixes(jobSiteId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM job_production_mixes WHERE job_site_id = ?')
			.bind(jobSiteId)
			.run();
	}

	// ── Schematics ────────────────────────────────────────────────────────

	async getSchematics(jobSiteId: string): Promise<DbSchematic[]> {
		return await this.db
			.prepare('SELECT * FROM job_schematics WHERE job_site_id = ? ORDER BY sort_order ASC, page_number ASC, created_at ASC')
			.bind(jobSiteId)
			.all<DbSchematic>()
			.then((r) => r.results);
	}

	async getSchematic(id: string): Promise<DbSchematic | null> {
		return await this.db.prepare('SELECT * FROM job_schematics WHERE id = ?').bind(id).first<DbSchematic>();
	}

	async createSchematic(
		jobSiteId: string,
		schematic: Omit<DbSchematic, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbSchematic> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				`INSERT INTO job_schematics (id, job_site_id, r2_key, page_number, label, content_type, sort_order, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				jobSiteId,
				schematic.r2_key,
				schematic.page_number ?? null,
				schematic.label ?? null,
				schematic.content_type ?? 'image/png',
				schematic.sort_order ?? 0,
				now
			)
			.run();
		return { id, job_site_id: jobSiteId, created_at: now, ...schematic };
	}

	// ── Job Documents ─────────────────────────────────────────────────────

	async getJobDocuments(jobSiteId: string): Promise<DbJobDocument[]> {
		return await this.db
			.prepare('SELECT * FROM job_documents WHERE job_site_id = ? ORDER BY created_at ASC')
			.bind(jobSiteId)
			.all<DbJobDocument>()
			.then((r) => r.results);
	}

	async getJobDocument(id: string): Promise<DbJobDocument | null> {
		return await this.db.prepare('SELECT * FROM job_documents WHERE id = ?').bind(id).first<DbJobDocument>();
	}

	async createJobDocument(
		jobSiteId: string,
		doc: Omit<DbJobDocument, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbJobDocument> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				`INSERT INTO job_documents (id, job_site_id, r2_key, filename, doc_type, content_type, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				jobSiteId,
				doc.r2_key,
				doc.filename,
				doc.doc_type ?? null,
				doc.content_type ?? 'application/pdf',
				now
			)
			.run();
		return { id, job_site_id: jobSiteId, created_at: now, ...doc };
	}

	// ── Job Site Assignments ──────────────────────────────────────────────

	async getJobSiteAssignments(jobSiteId: string): Promise<
		Array<
			DbJobSiteAssignment & {
				user_name: string;
				user_email: string;
			}
		>
	> {
		return await this.db
			.prepare(
				`SELECT jsa.*, u.name as user_name, u.email as user_email
				FROM job_site_assignments jsa
				JOIN users u ON u.id = jsa.user_id
				WHERE jsa.job_site_id = ?
				ORDER BY jsa.assigned_at DESC`
			)
			.bind(jobSiteId)
			.all<
				DbJobSiteAssignment & {
					user_name: string;
					user_email: string;
				}
			>()
			.then((r) => r.results);
	}

	async assignUserToJobSite(
		jobSiteId: string,
		userId: string,
		role: 'foreman' | 'operator' | 'inspector'
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				'INSERT OR REPLACE INTO job_site_assignments (job_site_id, user_id, assigned_at, role) VALUES (?, ?, ?, ?)'
			)
			.bind(jobSiteId, userId, now, role)
			.run();
	}

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

		if (!existing) {
			await this.db
				.prepare(
					`INSERT INTO job_site_config (
						job_site_id, road_type, num_lanes, lane_width_ft, total_length_ft,
						scope_of_work, mix_type, target_thickness_in, target_spread_rate,
						tack_type, target_tack_rate, notes, route_designation, route_county,
						route_district, route_functional_class, route_system_code, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					jobSiteId,
					config.road_type || null,
					config.num_lanes || null,
					config.lane_width_ft || null,
					config.total_length_ft || null,
					config.scope_of_work || null,
					config.mix_type || null,
					config.target_thickness_in || null,
					config.target_spread_rate || null,
					config.tack_type || null,
					config.target_tack_rate || null,
					config.notes || null,
					config.route_designation || null,
					config.route_county || null,
					config.route_district || null,
					config.route_functional_class || null,
					config.route_system_code || null,
					now,
					now
				)
				.run();
		} else {
			const fields: string[] = [];
			const values: (string | number | null)[] = [];

			if (config.road_type !== undefined) {
				fields.push('road_type = ?');
				values.push(config.road_type);
			}
			if (config.num_lanes !== undefined) {
				fields.push('num_lanes = ?');
				values.push(config.num_lanes);
			}
			if (config.lane_width_ft !== undefined) {
				fields.push('lane_width_ft = ?');
				values.push(config.lane_width_ft);
			}
			if (config.total_length_ft !== undefined) {
				fields.push('total_length_ft = ?');
				values.push(config.total_length_ft);
			}
			if (config.scope_of_work !== undefined) {
				fields.push('scope_of_work = ?');
				values.push(config.scope_of_work);
			}
			if (config.mix_type !== undefined) {
				fields.push('mix_type = ?');
				values.push(config.mix_type);
			}
			if (config.target_thickness_in !== undefined) {
				fields.push('target_thickness_in = ?');
				values.push(config.target_thickness_in);
			}
			if (config.target_spread_rate !== undefined) {
				fields.push('target_spread_rate = ?');
				values.push(config.target_spread_rate);
			}
			if (config.tack_type !== undefined) {
				fields.push('tack_type = ?');
				values.push(config.tack_type);
			}
			if (config.target_tack_rate !== undefined) {
				fields.push('target_tack_rate = ?');
				values.push(config.target_tack_rate);
			}
			if (config.notes !== undefined) {
				fields.push('notes = ?');
				values.push(config.notes);
			}
			if (config.route_designation !== undefined) {
				fields.push('route_designation = ?');
				values.push(config.route_designation);
			}
			if (config.route_county !== undefined) {
				fields.push('route_county = ?');
				values.push(config.route_county);
			}
			if (config.route_district !== undefined) {
				fields.push('route_district = ?');
				values.push(config.route_district);
			}
			if (config.route_functional_class !== undefined) {
				fields.push('route_functional_class = ?');
				values.push(config.route_functional_class);
			}
			if (config.route_system_code !== undefined) {
				fields.push('route_system_code = ?');
				values.push(config.route_system_code);
			}

			if (fields.length > 0) {
				fields.push('updated_at = ?');
				values.push(now);
				values.push(jobSiteId);

				await this.db
					.prepare(`UPDATE job_site_config SET ${fields.join(', ')} WHERE job_site_id = ?`)
					.bind(...values)
					.run();
			}
		}
	}

	// ── Job Site Equipment ────────────────────────────────────────────────

	async getJobSiteEquipment(jobSiteId: string): Promise<DbJobSiteEquipment[]> {
		return await this.db
			.prepare('SELECT * FROM job_site_equipment WHERE job_site_id = ? ORDER BY created_at ASC')
			.bind(jobSiteId)
			.all<DbJobSiteEquipment>()
			.then((r) => r.results);
	}

	async createJobSiteEquipment(
		jobSiteId: string,
		equipmentType: DbJobSiteEquipment['equipment_type'],
		name: string,
		capacity: string | null,
		notes: string | null
	): Promise<DbJobSiteEquipment> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				'INSERT INTO job_site_equipment (id, job_site_id, equipment_type, name, capacity, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(id, jobSiteId, equipmentType, name, capacity, notes, now)
			.run();

		return {
			id,
			job_site_id: jobSiteId,
			equipment_type: equipmentType,
			name,
			capacity,
			notes,
			created_at: now
		};
	}

	async deleteJobSiteEquipment(equipmentId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM job_site_equipment WHERE id = ?')
			.bind(equipmentId)
			.run();
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

	// ── Calculations ──────────────────────────────────────────────────────

	async createCalculation(
		jobSiteId: string,
		userId: string,
		calcType: DbCalculation['calc_type'],
		inputs: object,
		result: object,
		notes: string | null
	): Promise<DbCalculation> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		const inputsJson = JSON.stringify(inputs);
		const resultJson = JSON.stringify(result);

		await this.db
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(id, jobSiteId, userId, calcType, inputsJson, resultJson, notes, now)
			.run();

		return {
			id,
			job_site_id: jobSiteId,
			user_id: userId,
			calc_type: calcType,
			inputs: inputsJson,
			result: resultJson,
			notes,
			created_at: now
		};
	}

	async getCalculations(filters?: {
		jobSiteId?: string;
		userId?: string;
		limit?: number;
	}): Promise<DbCalculation[]> {
		let query = 'SELECT * FROM calculations WHERE 1=1';
		const bindings: string[] = [];

		if (filters?.jobSiteId) {
			query += ' AND job_site_id = ?';
			bindings.push(filters.jobSiteId);
		}

		if (filters?.userId) {
			query += ' AND user_id = ?';
			bindings.push(filters.userId);
		}

		query += ' ORDER BY created_at DESC';

		if (filters?.limit) {
			query += ' LIMIT ?';
			bindings.push(String(filters.limit));
		}

		return await this.db
			.prepare(query)
			.bind(...bindings)
			.all<DbCalculation>()
			.then((r) => r.results);
	}

	async getCalculationById(id: string): Promise<DbCalculation | null> {
		return await this.db
			.prepare('SELECT * FROM calculations WHERE id = ?')
			.bind(id)
			.first<DbCalculation>();
	}

	async deleteCalculation(id: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM calculations WHERE id = ?')
			.bind(id)
			.run();
	}
}
