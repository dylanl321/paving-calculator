import type { D1Database } from '../../cloudflare';
import { DbJobSiteConfigHelper } from './db-jobsite-config';
import { DbJobSiteSectionsHelper } from './db-jobsite-sections';
import { DbJobSiteEquipmentHelper } from './db-jobsite-equipment';
import { DbJobSiteDocumentsHelper } from './db-jobsite-documents';

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
	/** Human-readable begin/end terminus text parsed from the contract headline. */
	begin_terminus: string | null;
	end_terminus: string | null;
	/** Begin/end terminus as a station offset (ft / 100) along the stored route. */
	begin_station: number | null;
	end_station: number | null;
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

export interface DbRoadwayLogEvent {
	id: string;
	job_site_id: string;
	source_key: string | null;
	page_number: number | null;
	milepost: number;
	station: number;
	event_type:
		| 'project_start'
		| 'project_end'
		| 'operation_change'
		| 'width_change'
		| 'side_road'
		| 'reference'
		| 'note';
	description: string;
	roadway_width_ft: number | null;
	side: 'left' | 'right' | null;
	surface: 'paved' | 'unpaved' | null;
	is_reference: number;
	confidence: 'high' | 'medium' | 'low';
	raw_text: string | null;
	coordinate_geojson: string | null;
	sort_order: number;
	created_at: number;
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
	production_mix_id?: string | null;
	layer_label?: string | null;
	planned_length_ft?: number | null;
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
	private configHelper: DbJobSiteConfigHelper;
	private sectionsHelper: DbJobSiteSectionsHelper;
	private equipmentHelper: DbJobSiteEquipmentHelper;
	private documentsHelper: DbJobSiteDocumentsHelper;

	constructor(private db: D1Database) {
		this.configHelper = new DbJobSiteConfigHelper(db);
		this.sectionsHelper = new DbJobSiteSectionsHelper(db);
		this.equipmentHelper = new DbJobSiteEquipmentHelper(db);
		this.documentsHelper = new DbJobSiteDocumentsHelper(db);
	}

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

	// ── Bid Items (delegated to documentsHelper) ──────────────────────────

	async getBidItems(jobSiteId: string): Promise<DbBidItem[]> {
		return this.documentsHelper.getBidItems(jobSiteId);
	}

	async createBidItem(
		jobSiteId: string,
		item: Omit<DbBidItem, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbBidItem> {
		return this.documentsHelper.createBidItem(jobSiteId, item);
	}

	async deleteBidItems(jobSiteId: string): Promise<void> {
		return this.documentsHelper.deleteBidItems(jobSiteId);
	}

	// ── Production Mixes (delegated to documentsHelper) ───────────────────

	async getProductionMixes(jobSiteId: string): Promise<DbProductionMix[]> {
		return this.documentsHelper.getProductionMixes(jobSiteId);
	}

	async createProductionMix(
		jobSiteId: string,
		mix: Omit<DbProductionMix, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbProductionMix> {
		return this.documentsHelper.createProductionMix(jobSiteId, mix);
	}

	async getProductionMix(mixId: string): Promise<DbProductionMix | null> {
		return this.documentsHelper.getProductionMix(mixId);
	}

	async updateProductionMix(
		mixId: string,
		updates: Partial<Omit<DbProductionMix, 'id' | 'job_site_id' | 'created_at'>>
	): Promise<void> {
		return this.documentsHelper.updateProductionMix(mixId, updates);
	}

	async setActiveMix(jobSiteId: string, mixId: string): Promise<void> {
		return this.documentsHelper.setActiveMix(jobSiteId, mixId);
	}

	async deleteProductionMix(mixId: string): Promise<void> {
		return this.documentsHelper.deleteProductionMix(mixId);
	}

	async deleteProductionMixes(jobSiteId: string): Promise<void> {
		return this.documentsHelper.deleteProductionMixes(jobSiteId);
	}

	// ── Schematics (delegated to documentsHelper) ─────────────────────────

	async getSchematics(jobSiteId: string): Promise<DbSchematic[]> {
		return this.documentsHelper.getSchematics(jobSiteId);
	}

	async getSchematic(id: string): Promise<DbSchematic | null> {
		return this.documentsHelper.getSchematic(id);
	}

	async createSchematic(
		jobSiteId: string,
		schematic: Omit<DbSchematic, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbSchematic> {
		return this.documentsHelper.createSchematic(jobSiteId, schematic);
	}

	// ── Job Documents (delegated to documentsHelper) ──────────────────────

	async getJobDocuments(jobSiteId: string): Promise<DbJobDocument[]> {
		return this.documentsHelper.getJobDocuments(jobSiteId);
	}

	async getJobDocument(id: string): Promise<DbJobDocument | null> {
		return this.documentsHelper.getJobDocument(id);
	}

	async createJobDocument(
		jobSiteId: string,
		doc: Omit<DbJobDocument, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbJobDocument> {
		return this.documentsHelper.createJobDocument(jobSiteId, doc);
	}

	// ── Job Site Assignments (delegated to equipmentHelper) ───────────────

	async getJobSiteAssignments(jobSiteId: string): Promise<
		Array<
			DbJobSiteAssignment & {
				user_name: string;
				user_email: string;
			}
		>
	> {
		return this.equipmentHelper.getJobSiteAssignments(jobSiteId);
	}

	async assignUserToJobSite(
		jobSiteId: string,
		userId: string,
		role: 'foreman' | 'operator' | 'inspector'
	): Promise<void> {
		return this.equipmentHelper.assignUserToJobSite(jobSiteId, userId, role);
	}

	// ── Job Site Config (delegated to configHelper) ───────────────────────

	async getJobSiteConfig(jobSiteId: string): Promise<DbJobSiteConfig | null> {
		return this.configHelper.getJobSiteConfig(jobSiteId);
	}

	async upsertJobSiteConfig(
		jobSiteId: string,
		config: Partial<Omit<DbJobSiteConfig, 'job_site_id' | 'created_at' | 'updated_at'>>
	): Promise<void> {
		return this.configHelper.upsertJobSiteConfig(jobSiteId, config);
	}

	// ── Job Site Equipment (delegated to equipmentHelper) ─────────────────

	async getJobSiteEquipment(jobSiteId: string): Promise<DbJobSiteEquipment[]> {
		return this.equipmentHelper.getJobSiteEquipment(jobSiteId);
	}

	async createJobSiteEquipment(
		jobSiteId: string,
		equipmentType: DbJobSiteEquipment['equipment_type'],
		name: string,
		capacity: string | null,
		notes: string | null
	): Promise<DbJobSiteEquipment> {
		return this.equipmentHelper.createJobSiteEquipment(jobSiteId, equipmentType, name, capacity, notes);
	}

	async deleteJobSiteEquipment(equipmentId: string): Promise<void> {
		return this.equipmentHelper.deleteJobSiteEquipment(equipmentId);
	}

	// ── Job Site Route (delegated to configHelper) ────────────────────────

	async getJobSiteRoute(jobSiteId: string): Promise<DbJobSiteRoute | null> {
		return this.configHelper.getJobSiteRoute(jobSiteId);
	}

	async upsertJobSiteRoute(
		jobSiteId: string,
		waypoints: Array<{ lat: number; lng: number }>
	): Promise<DbJobSiteRoute> {
		return this.configHelper.upsertJobSiteRoute(jobSiteId, waypoints);
	}

	// ── Calculations (delegated to sectionsHelper) ────────────────────────

	async createCalculation(
		jobSiteId: string,
		userId: string,
		calcType: DbCalculation['calc_type'],
		inputs: object,
		result: object,
		notes: string | null
	): Promise<DbCalculation> {
		return this.sectionsHelper.createCalculation(jobSiteId, userId, calcType, inputs, result, notes);
	}

	async getCalculations(filters?: {
		jobSiteId?: string;
		userId?: string;
		limit?: number;
	}): Promise<DbCalculation[]> {
		return this.sectionsHelper.getCalculations(filters);
	}

	async getCalculationById(id: string): Promise<DbCalculation | null> {
		return this.sectionsHelper.getCalculationById(id);
	}

	async deleteCalculation(id: string): Promise<void> {
		return this.sectionsHelper.deleteCalculation(id);
	}
}
