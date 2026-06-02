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
	role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer';
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
	email_from_name: string | null;
	email_reply_to: string | null;
	overrides: string | null; // JSON
	updated_by: string | null;
	updated_at: number;
}

export interface DbInvitation {
	id: string;
	org_id: string;
	email: string;
	role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer';
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
	num_lifts: number | null;
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
	waypoints: string; // JSON array of {lat: number, lng: number}
	created_at: number;
	updated_at: number;
}

export interface DbCrew {
	id: string;
	org_id: string;
	name: string;
	color: string;
	created_by: string;
	created_at: number;
}

export interface DbCrewMember {
	crew_id: string;
	user_id: string;
	org_id: string;
	assigned_at: number;
}

export interface DbCrewJobSite {
	crew_id: string;
	job_site_id: string;
	org_id: string;
	assigned_at: number;
	assigned_by: string;
}

export interface DbNotificationPref {
	user_id: string;
	pref_key: string;
	enabled: boolean;
	updated_at: number;
}

export interface DbMilestone {
	id: string;
	job_site_id: string;
	name: string;
	description: string | null;
	status: 'pending' | 'in_progress' | 'completed';
	target_date: string | null;
	completed_at: number | null;
	sort_order: number;
	created_at: number;
	updated_at: number;
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
		role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer'
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
		role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer'
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
			emailFromName?: string | null;
			emailReplyTo?: string | null;
			overrides?: string | null;
			updatedBy?: string | null;
		}
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const existing = await this.getOrgSettings(orgId);

		if (!existing) {
			await this.db
				.prepare(
					`INSERT INTO org_settings (org_id, accent_color, logo_key, logo_content_type, email_from_name, email_reply_to, overrides, updated_by, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					orgId,
					updates.accentColor ?? null,
					updates.logoKey ?? null,
					updates.logoContentType ?? null,
					updates.emailFromName ?? null,
					updates.emailReplyTo ?? null,
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
		if (updates.emailFromName !== undefined) {
			fields.push('email_from_name = ?');
			values.push(updates.emailFromName);
		}
		if (updates.emailReplyTo !== undefined) {
			fields.push('email_reply_to = ?');
			values.push(updates.emailReplyTo);
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
		role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer',
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

	async getInvitationById(id: string): Promise<DbInvitation | null> {
		return await this.db
			.prepare('SELECT * FROM invitations WHERE id = ?')
			.bind(id)
			.first<DbInvitation>();
	}

	async getInvitationByEmail(orgId: string, email: string): Promise<DbInvitation | null> {
		return await this.db
			.prepare('SELECT * FROM invitations WHERE org_id = ? AND email = ? COLLATE NOCASE AND accepted_at IS NULL')
			.bind(orgId, email)
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
						tack_type, target_tack_rate, notes, num_lifts, total_tonnage,
						cost_per_ton, cost_per_sy, cost_per_mile, total_contract_value,
						created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
					config.num_lifts || null,
					config.total_tonnage || null,
					config.cost_per_ton || null,
					config.cost_per_sy || null,
					config.cost_per_mile || null,
					config.total_contract_value || null,
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
			if (config.num_lifts !== undefined) {
				fields.push('num_lifts = ?');
				values.push(config.num_lifts);
			}
			if (config.total_tonnage !== undefined) {
				fields.push('total_tonnage = ?');
				values.push(config.total_tonnage);
			}
			if (config.cost_per_ton !== undefined) {
				fields.push('cost_per_ton = ?');
				values.push(config.cost_per_ton);
			}
			if (config.cost_per_sy !== undefined) {
				fields.push('cost_per_sy = ?');
				values.push(config.cost_per_sy);
			}
			if (config.cost_per_mile !== undefined) {
				fields.push('cost_per_mile = ?');
				values.push(config.cost_per_mile);
			}
			if (config.total_contract_value !== undefined) {
				fields.push('total_contract_value = ?');
				values.push(config.total_contract_value);
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

	// Crew methods
	async createCrew(
		orgId: string,
		name: string,
		color: string,
		createdBy: string
	): Promise<DbCrew> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				'INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(id, orgId, name, color, createdBy, now)
			.run();

		return {
			id,
			org_id: orgId,
			name,
			color,
			created_by: createdBy,
			created_at: now
		};
	}

	async listCrews(orgId: string): Promise<DbCrew[]> {
		return await this.db
			.prepare('SELECT * FROM crews WHERE org_id = ? ORDER BY created_at ASC')
			.bind(orgId)
			.all<DbCrew>()
			.then((r) => r.results);
	}

	async deleteCrew(crewId: string, orgId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM crews WHERE id = ? AND org_id = ?')
			.bind(crewId, orgId)
			.run();
	}

	async assignMemberToCrew(crewId: string, userId: string, orgId: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				'INSERT OR REPLACE INTO crew_members (crew_id, user_id, org_id, assigned_at) VALUES (?, ?, ?, ?)'
			)
			.bind(crewId, userId, orgId, now)
			.run();
	}

	async removeMemberFromCrew(userId: string, orgId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM crew_members WHERE user_id = ? AND org_id = ?')
			.bind(userId, orgId)
			.run();
	}

	async getCrewMembers(
		crewId: string
	): Promise<Array<{ user_id: string; user_name: string }>> {
		return await this.db
			.prepare(
				`SELECT cm.user_id, u.name as user_name
				FROM crew_members cm
				JOIN users u ON u.id = cm.user_id
				WHERE cm.crew_id = ?
				ORDER BY u.name ASC`
			)
			.bind(crewId)
			.all<{ user_id: string; user_name: string }>()
			.then((r) => r.results);
	}

	async getMemberCrew(userId: string, orgId: string): Promise<DbCrew | null> {
		return await this.db
			.prepare(
				`SELECT c.*
				FROM crews c
				JOIN crew_members cm ON cm.crew_id = c.id
				WHERE cm.user_id = ? AND cm.org_id = ?`
			)
			.bind(userId, orgId)
			.first<DbCrew>();
	}

	// Crew-to-job-site assignment methods
	async assignJobSiteToCrew(crewId: string, jobSiteId: string, orgId: string, assignedBy: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				'INSERT OR REPLACE INTO crew_job_sites (crew_id, job_site_id, org_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(crewId, jobSiteId, orgId, now, assignedBy)
			.run();
	}

	async removeJobSiteFromCrew(crewId: string, jobSiteId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM crew_job_sites WHERE crew_id = ? AND job_site_id = ?')
			.bind(crewId, jobSiteId)
			.run();
	}

	async getCrewJobSites(crewId: string): Promise<DbJobSite[]> {
		return await this.db
			.prepare(
				`SELECT js.*
				FROM job_sites js
				JOIN crew_job_sites cjs ON cjs.job_site_id = js.id
				WHERE cjs.crew_id = ?
				ORDER BY js.name ASC`
			)
			.bind(crewId)
			.all<DbJobSite>()
			.then((r) => r.results);
	}

	async getJobSiteCrews(jobSiteId: string): Promise<DbCrew[]> {
		return await this.db
			.prepare(
				`SELECT c.*
				FROM crews c
				JOIN crew_job_sites cjs ON cjs.crew_id = c.id
				WHERE cjs.job_site_id = ?
				ORDER BY c.name ASC`
			)
			.bind(jobSiteId)
			.all<DbCrew>()
			.then((r) => r.results);
	}

	// Get job sites visible to a foreman (only their crew's assigned job sites)
	async getJobSitesByForeman(userId: string, orgId: string): Promise<DbJobSite[]> {
		return await this.db
			.prepare(
				`SELECT DISTINCT js.*
				FROM job_sites js
				JOIN crew_job_sites cjs ON cjs.job_site_id = js.id
				JOIN crew_members cm ON cm.crew_id = cjs.crew_id
				WHERE cm.user_id = ? AND cm.org_id = ?
				ORDER BY js.name ASC`
			)
			.bind(userId, orgId)
			.all<DbJobSite>()
			.then((r) => r.results);
	}

	async getNotificationPrefs(userId: string): Promise<Record<string, boolean>> {
		const DEFAULTS: Record<string, boolean> = {
			email_daily_summary: true,
			email_invite: true,
			email_spec_alerts: true,
			email_job_updates: false,
			push_spec_alerts: true,
			push_job_updates: false
		};

		const rows = await this.db
			.prepare('SELECT pref_key, enabled FROM user_notification_prefs WHERE user_id = ?')
			.bind(userId)
			.all<{ pref_key: string; enabled: number }>()
			.then((r) => r.results);

		const prefs = { ...DEFAULTS };
		for (const row of rows) {
			prefs[row.pref_key] = row.enabled === 1;
		}

		return prefs;
	}

	async setNotificationPref(userId: string, prefKey: string, enabled: boolean): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				'INSERT INTO user_notification_prefs (user_id, pref_key, enabled, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, pref_key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at'
			)
			.bind(userId, prefKey, enabled ? 1 : 0, now)
			.run();
	}

	async bulkSetNotificationPrefs(userId: string, prefs: Record<string, boolean>): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const statements = Object.entries(prefs).map(([prefKey, enabled]) =>
			this.db
				.prepare(
					'INSERT INTO user_notification_prefs (user_id, pref_key, enabled, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, pref_key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at'
				)
				.bind(userId, prefKey, enabled ? 1 : 0, now)
		);

		await this.db.batch(statements);
	}

	async getMilestones(jobSiteId: string): Promise<DbMilestone[]> {
		return await this.db
			.prepare('SELECT * FROM job_site_milestones WHERE job_site_id = ? ORDER BY sort_order ASC, created_at ASC')
			.bind(jobSiteId)
			.all<DbMilestone>()
			.then((r) => r.results);
	}

	async createMilestone(
		jobSiteId: string,
		data: {
			name: string;
			description?: string;
			status?: 'pending' | 'in_progress' | 'completed';
			target_date?: string;
			sort_order?: number;
		}
	): Promise<DbMilestone> {
		const id = crypto.randomUUID();
		const now = Date.now();
		const status = data.status || 'pending';
		const completed_at = status === 'completed' ? now : null;

		await this.db
			.prepare(
				'INSERT INTO job_site_milestones (id, job_site_id, name, description, status, target_date, completed_at, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(
				id,
				jobSiteId,
				data.name,
				data.description || null,
				status,
				data.target_date || null,
				completed_at,
				data.sort_order || 0,
				now,
				now
			)
			.run();

		return {
			id,
			job_site_id: jobSiteId,
			name: data.name,
			description: data.description || null,
			status,
			target_date: data.target_date || null,
			completed_at,
			sort_order: data.sort_order || 0,
			created_at: now,
			updated_at: now
		};
	}

	async updateMilestone(
		id: string,
		data: Partial<Pick<DbMilestone, 'name' | 'description' | 'status' | 'target_date' | 'sort_order' | 'completed_at'>>
	): Promise<DbMilestone | null> {
		const existing = await this.db
			.prepare('SELECT * FROM job_site_milestones WHERE id = ?')
			.bind(id)
			.first<DbMilestone>();

		if (!existing) {
			return null;
		}

		const now = Date.now();
		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (data.name !== undefined) {
			fields.push('name = ?');
			values.push(data.name);
		}
		if (data.description !== undefined) {
			fields.push('description = ?');
			values.push(data.description);
		}
		if (data.status !== undefined) {
			fields.push('status = ?');
			values.push(data.status);
			if (data.status === 'completed' && !existing.completed_at) {
				fields.push('completed_at = ?');
				values.push(now);
			}
		}
		if (data.target_date !== undefined) {
			fields.push('target_date = ?');
			values.push(data.target_date);
		}
		if (data.sort_order !== undefined) {
			fields.push('sort_order = ?');
			values.push(data.sort_order);
		}
		if (data.completed_at !== undefined) {
			fields.push('completed_at = ?');
			values.push(data.completed_at);
		}

		fields.push('updated_at = ?');
		values.push(now);
		values.push(id);

		await this.db
			.prepare(`UPDATE job_site_milestones SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();

		return await this.db
			.prepare('SELECT * FROM job_site_milestones WHERE id = ?')
			.bind(id)
			.first<DbMilestone>();
	}

	async deleteMilestone(id: string): Promise<void> {
		await this.db.prepare('DELETE FROM job_site_milestones WHERE id = ?').bind(id).run();
	}
}
