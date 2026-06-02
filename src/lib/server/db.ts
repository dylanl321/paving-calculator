import type { D1Database } from '../../cloudflare';

export interface DbUser {
	id: string;
	email: string;
	password_hash: string;
	name: string;
	is_global_admin: boolean;
	disabled: boolean;
	email_verified: boolean;
	phone: string | null;
	created_at: number;
	updated_at: number;
}

export interface DbOrganization {
	id: string;
	name: string;
	slug: string;
	created_at: number;
}

export interface DbOrgMember {
	user_id: string;
	org_id: string;
	role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office';
	invited_at: number;
	accepted_at: number | null;
}

export interface DbJobSite {
	id: string;
	org_id: string;
	name: string;
	location_description: string | null;
	latitude: number | null;
	longitude: number | null;
	status: 'active' | 'completed' | 'archived';
	created_at: number;
	updated_at: number;
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
	inputs: string; // JSON
	result: string; // JSON
	notes: string | null;
	created_at: number;
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
	created_at: number;
}

export interface DbSession {
	id: string;
	user_id: string;
	expires_at: number;
	created_at: number;
}

export interface DbOrgSettings {
	org_id: string;
	accent_color: string | null;
	logo_key: string | null;
	logo_content_type: string | null;
	overrides: string | null; // JSON
	updated_by: string | null;
	updated_at: number;
}

export interface DbInvitation {
	id: string;
	org_id: string;
	email: string;
	role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office';
	token: string;
	invited_by: string;
	created_at: number;
	accepted_at: number | null;
	expires_at: number;
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
	waypoints: string; // JSON array of {lat: number, lng: number}
	created_at: number;
	updated_at: number;
}

export interface DbWebhook {
	id: string;
	org_id: string;
	url: string;
	secret: string;
	events: string; // JSON array of event types
	description: string | null;
	is_active: number;
	created_by: string | null;
	created_at: number;
	updated_at: number;
}

export interface DbWebhookDelivery {
	id: string;
	webhook_id: string;
	event_type: string;
	payload: string; // JSON
	status: 'pending' | 'delivered' | 'failed';
	http_status: number | null;
	response_body: string | null;
	attempt_count: number;
	last_attempted_at: number | null;
	delivered_at: number | null;
	created_at: number;
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

export class DbHelper {
	constructor(private db: D1Database) {}

	async getUserByEmail(email: string): Promise<DbUser | null> {
		return await this.db
			.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
			.bind(email)
			.first<DbUser>();
	}

	async getUserById(id: string): Promise<DbUser | null> {
		return await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
	}

	async createUser(email: string, passwordHash: string, name: string): Promise<DbUser> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				'INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(id, email, passwordHash, name, now, now)
			.run();

		return {
			id,
			email,
			password_hash: passwordHash,
			name,
			is_global_admin: false,
			disabled: false,
			email_verified: false,
			phone: null,
			created_at: now,
			updated_at: now
		};
	}

	async createOrganization(name: string, slug: string): Promise<DbOrganization> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare('INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
			.bind(id, name, slug, now)
			.run();

		return { id, name, slug, created_at: now };
	}

	async addOrgMember(
		userId: string,
		orgId: string,
		role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office'
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				'INSERT INTO org_members (user_id, org_id, role, invited_at, accepted_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(userId, orgId, role, now, now)
			.run();
	}

	async getOrgByUserId(userId: string): Promise<DbOrganization | null> {
		return await this.db
			.prepare(
				`SELECT o.* FROM organizations o
				JOIN org_members om ON om.org_id = o.id
				WHERE om.user_id = ?
				LIMIT 1`
			)
			.bind(userId)
			.first<DbOrganization>();
	}

	async getOrgMembersByOrgId(orgId: string): Promise<
		Array<
			DbOrgMember & {
				user_name: string;
				user_email: string;
			}
		>
	> {
		return await this.db
			.prepare(
				`SELECT om.*, u.name as user_name, u.email as user_email
				FROM org_members om
				JOIN users u ON u.id = om.user_id
				WHERE om.org_id = ?
				ORDER BY om.invited_at DESC`
			)
			.bind(orgId)
			.all<
				DbOrgMember & {
					user_name: string;
					user_email: string;
				}
			>()
			.then((r) => r.results);
	}

	async getUserRole(userId: string, orgId: string): Promise<string | null> {
		const result = await this.db
			.prepare('SELECT role FROM org_members WHERE user_id = ? AND org_id = ?')
			.bind(userId, orgId)
			.first<{ role: string }>();
		return result?.role || null;
	}

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
			status: 'active',
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
		updates: Partial<Pick<DbJobSite, 'name' | 'location_description' | 'latitude' | 'longitude' | 'status'>>
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

	async createSession(userId: string, expiresAt: number): Promise<string> {
		const tokenBytes = new Uint8Array(32);
		crypto.getRandomValues(tokenBytes);
		const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
			.bind(token, userId, expiresAt, now)
			.run();

		return token;
	}

	async getSession(token: string): Promise<DbSession | null> {
		return await this.db
			.prepare('SELECT * FROM sessions WHERE id = ?')
			.bind(token)
			.first<DbSession>();
	}

	async deleteSession(token: string): Promise<void> {
		await this.db.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
	}

	async deleteSessionsByUserId(userId: string): Promise<void> {
		await this.db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
	}

	async cleanExpiredSessions(): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
	}

	// Admin methods
	async getAllOrganizations(): Promise<
		Array<DbOrganization & { member_count: number }>
	> {
		return await this.db
			.prepare(
				`SELECT o.*, COUNT(om.user_id) as member_count
				FROM organizations o
				LEFT JOIN org_members om ON om.org_id = o.id
				GROUP BY o.id
				ORDER BY o.created_at DESC`
			)
			.all<DbOrganization & { member_count: number }>()
			.then((r) => r.results);
	}

	async getOrganizationById(id: string): Promise<DbOrganization | null> {
		return await this.db
			.prepare('SELECT * FROM organizations WHERE id = ?')
			.bind(id)
			.first<DbOrganization>();
	}

	async updateOrganization(id: string, updates: { name?: string; slug?: string }): Promise<void> {
		const fields: string[] = [];
		const values: string[] = [];

		if (updates.name !== undefined) {
			fields.push('name = ?');
			values.push(updates.name);
		}
		if (updates.slug !== undefined) {
			fields.push('slug = ?');
			values.push(updates.slug);
		}

		if (fields.length === 0) return;
		values.push(id);

		await this.db
			.prepare(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async getAllUsers(): Promise<
		Array<DbUser & { org_name: string | null; org_id: string | null; role: string | null }>
	> {
		return await this.db
			.prepare(
				`SELECT u.*, o.name as org_name, om.org_id, om.role
				FROM users u
				LEFT JOIN org_members om ON om.user_id = u.id
				LEFT JOIN organizations o ON o.id = om.org_id
				ORDER BY u.created_at DESC`
			)
			.all<DbUser & { org_name: string | null; org_id: string | null; role: string | null }>()
			.then((r) => r.results);
	}

	async updateUser(
		id: string,
		updates: {
			name?: string;
			email?: string;
			phone?: string | null;
			is_global_admin?: boolean;
			disabled?: boolean;
		}
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const fields: string[] = [];
		const values: (string | number | boolean)[] = [];

		if (updates.name !== undefined) {
			fields.push('name = ?');
			values.push(updates.name);
		}
		if (updates.email !== undefined) {
			fields.push('email = ?');
			values.push(updates.email);
		}
		if (updates.phone !== undefined) {
			fields.push('phone = ?');
			values.push(updates.phone || '');
		}
		if (updates.is_global_admin !== undefined) {
			fields.push('is_global_admin = ?');
			values.push(updates.is_global_admin ? 1 : 0);
		}
		if (updates.disabled !== undefined) {
			fields.push('disabled = ?');
			values.push(updates.disabled ? 1 : 0);
		}

		if (fields.length === 0) return;

		fields.push('updated_at = ?');
		values.push(now);
		values.push(id);

		await this.db
			.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async removeOrgMember(userId: string, orgId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM org_members WHERE user_id = ? AND org_id = ?')
			.bind(userId, orgId)
			.run();
	}

	async updateOrgMemberRole(
		userId: string,
		orgId: string,
		role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office'
	): Promise<void> {
		await this.db
			.prepare('UPDATE org_members SET role = ? WHERE user_id = ? AND org_id = ?')
			.bind(role, userId, orgId)
			.run();
	}

	// Organization settings (branding + value overrides)
	async getOrgSettings(orgId: string): Promise<DbOrgSettings | null> {
		return await this.db
			.prepare('SELECT * FROM org_settings WHERE org_id = ?')
			.bind(orgId)
			.first<DbOrgSettings>();
	}

	async upsertOrgSettings(
		orgId: string,
		updates: {
			accentColor?: string | null;
			logoKey?: string | null;
			logoContentType?: string | null;
			overrides?: string | null;
			updatedBy?: string | null;
		}
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const existing = await this.getOrgSettings(orgId);

		if (!existing) {
			await this.db
				.prepare(
					`INSERT INTO org_settings (org_id, accent_color, logo_key, logo_content_type, overrides, updated_by, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					orgId,
					updates.accentColor ?? null,
					updates.logoKey ?? null,
					updates.logoContentType ?? null,
					updates.overrides ?? null,
					updates.updatedBy ?? null,
					now
				)
				.run();
			return;
		}

		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (updates.accentColor !== undefined) {
			fields.push('accent_color = ?');
			values.push(updates.accentColor);
		}
		if (updates.logoKey !== undefined) {
			fields.push('logo_key = ?');
			values.push(updates.logoKey);
		}
		if (updates.logoContentType !== undefined) {
			fields.push('logo_content_type = ?');
			values.push(updates.logoContentType);
		}
		if (updates.overrides !== undefined) {
			fields.push('overrides = ?');
			values.push(updates.overrides);
		}
		if (updates.updatedBy !== undefined) {
			fields.push('updated_by = ?');
			values.push(updates.updatedBy);
		}

		fields.push('updated_at = ?');
		values.push(now);
		values.push(orgId);

		await this.db
			.prepare(`UPDATE org_settings SET ${fields.join(', ')} WHERE org_id = ?`)
			.bind(...values)
			.run();
	}

	async getOrgBySlug(slug: string): Promise<DbOrganization | null> {
		return await this.db
			.prepare('SELECT * FROM organizations WHERE slug = ?')
			.bind(slug)
			.first<DbOrganization>();
	}

	// Invitation methods
	async createInvitation(
		orgId: string,
		email: string,
		role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office',
		invitedBy: string
	): Promise<DbInvitation> {
		const id = crypto.randomUUID();
		const tokenBytes = new Uint8Array(32);
		crypto.getRandomValues(tokenBytes);
		const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
		const now = Math.floor(Date.now() / 1000);
		const expiresAt = now + 7 * 24 * 60 * 60; // 7 days

		await this.db
			.prepare(
				'INSERT INTO invitations (id, org_id, email, role, token, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(id, orgId, email, role, token, invitedBy, now, expiresAt)
			.run();

		return {
			id,
			org_id: orgId,
			email,
			role,
			token,
			invited_by: invitedBy,
			created_at: now,
			accepted_at: null,
			expires_at: expiresAt
		};
	}

	async getInvitationsByOrgId(orgId: string): Promise<
		Array<DbInvitation & { invited_by_name: string }>
	> {
		return await this.db
			.prepare(
				`SELECT i.*, u.name as invited_by_name
				FROM invitations i
				JOIN users u ON u.id = i.invited_by
				WHERE i.org_id = ? AND i.accepted_at IS NULL
				ORDER BY i.created_at DESC`
			)
			.bind(orgId)
			.all<DbInvitation & { invited_by_name: string }>()
			.then((r) => r.results);
	}

	async getInvitationByToken(token: string): Promise<DbInvitation | null> {
		return await this.db
			.prepare('SELECT * FROM invitations WHERE token = ?')
			.bind(token)
			.first<DbInvitation>();
	}

	async acceptInvitation(token: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE invitations SET accepted_at = ? WHERE token = ?')
			.bind(now, token)
			.run();
	}

	async deleteInvitation(id: string): Promise<void> {
		await this.db.prepare('DELETE FROM invitations WHERE id = ?').bind(id).run();
	}

	async cleanExpiredInvitations(): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('DELETE FROM invitations WHERE expires_at < ? AND accepted_at IS NULL')
			.bind(now)
			.run();
	}

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
						tack_type, target_tack_rate, notes, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

	// Email token methods
	async createEmailToken(
		userId: string,
		type: string,
		expiresInSeconds: number
	): Promise<string> {
		const token = crypto.randomUUID();
		const id = crypto.randomUUID();
		const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
		await this.db
			.prepare(
				'INSERT INTO email_tokens (id, user_id, type, token, expires_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(id, userId, type, token, expiresAt)
			.run();
		return token;
	}

	async getEmailToken(
		token: string,
		type: string
	): Promise<{ user_id: string; expires_at: number; used_at: number | null } | null> {
		return await this.db
			.prepare('SELECT user_id, expires_at, used_at FROM email_tokens WHERE token = ? AND type = ?')
			.bind(token, type)
			.first<{ user_id: string; expires_at: number; used_at: number | null }>();
	}

	async markEmailTokenUsed(token: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE email_tokens SET used_at = ? WHERE token = ?')
			.bind(now, token)
			.run();
	}

	async setEmailVerified(userId: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?')
			.bind(now, userId)
			.run();
	}

	async updatePassword(userId: string, passwordHash: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
			.bind(passwordHash, now, userId)
			.run();
	}

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

	// Webhook methods
	async getWebhooksByOrgId(orgId: string): Promise<DbWebhook[]> {
		return await this.db
			.prepare('SELECT * FROM webhooks WHERE org_id = ? ORDER BY created_at DESC')
			.bind(orgId)
			.all<DbWebhook>()
			.then((r) => r.results);
	}

	async getWebhookById(id: string): Promise<DbWebhook | null> {
		return await this.db
			.prepare('SELECT * FROM webhooks WHERE id = ?')
			.bind(id)
			.first<DbWebhook>();
	}

	async getActiveWebhooksByOrgId(orgId: string): Promise<DbWebhook[]> {
		return await this.db
			.prepare('SELECT * FROM webhooks WHERE org_id = ? AND is_active = 1')
			.bind(orgId)
			.all<DbWebhook>()
			.then((r) => r.results);
	}

	async createWebhook(
		orgId: string,
		url: string,
		secret: string,
		events: string[],
		description: string | null,
		createdBy: string
	): Promise<DbWebhook> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		const eventsJson = JSON.stringify(events);

		await this.db
			.prepare(
				`INSERT INTO webhooks (
					id, org_id, url, secret, events, description, is_active, created_by, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(id, orgId, url, secret, eventsJson, description, 1, createdBy, now, now)
			.run();

		return {
			id,
			org_id: orgId,
			url,
			secret,
			events: eventsJson,
			description,
			is_active: 1,
			created_by: createdBy,
			created_at: now,
			updated_at: now
		};
	}

	async updateWebhook(
		id: string,
		updates: {
			url?: string;
			events?: string[];
			description?: string | null;
			is_active?: boolean;
		}
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (updates.url !== undefined) {
			fields.push('url = ?');
			values.push(updates.url);
		}
		if (updates.events !== undefined) {
			fields.push('events = ?');
			values.push(JSON.stringify(updates.events));
		}
		if (updates.description !== undefined) {
			fields.push('description = ?');
			values.push(updates.description);
		}
		if (updates.is_active !== undefined) {
			fields.push('is_active = ?');
			values.push(updates.is_active ? 1 : 0);
		}

		if (fields.length === 0) return;

		fields.push('updated_at = ?');
		values.push(now);
		values.push(id);

		await this.db
			.prepare(`UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async deleteWebhook(id: string): Promise<void> {
		await this.db.prepare('DELETE FROM webhook_deliveries WHERE webhook_id = ?').bind(id).run();
		await this.db.prepare('DELETE FROM webhooks WHERE id = ?').bind(id).run();
	}

	async createWebhookDelivery(
		webhookId: string,
		eventType: string,
		payload: string,
		status: 'pending' | 'delivered' | 'failed',
		httpStatus: number | null,
		responseBody: string | null
	): Promise<void> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				`INSERT INTO webhook_deliveries (
					id, webhook_id, event_type, payload, status, http_status, response_body,
					attempt_count, last_attempted_at, delivered_at, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				webhookId,
				eventType,
				payload,
				status,
				httpStatus,
				responseBody,
				1,
				now,
				status === 'delivered' ? now : null,
				now
			)
			.run();
	}

	async getWebhookDeliveries(
		webhookId: string,
		statusFilter?: string,
		limit = 50
	): Promise<DbWebhookDelivery[]> {
		let query = 'SELECT * FROM webhook_deliveries WHERE webhook_id = ?';
		const bindings: (string | number)[] = [webhookId];

		if (statusFilter) {
			query += ' AND status = ?';
			bindings.push(statusFilter);
		}

		query += ' ORDER BY created_at DESC LIMIT ?';
		bindings.push(limit);

		return await this.db
			.prepare(query)
			.bind(...bindings)
			.all<DbWebhookDelivery>()
			.then((r) => r.results);
	}
}
