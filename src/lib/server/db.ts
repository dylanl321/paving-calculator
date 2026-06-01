import type { D1Database } from '../../cloudflare';

export interface DbUser {
	id: string;
	email: string;
	password_hash: string;
	name: string;
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
	role: 'owner' | 'admin' | 'member';
	invited_at: number;
	accepted_at: number | null;
}

export interface DbJobSite {
	id: string;
	org_id: string;
	name: string;
	location_description: string | null;
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
		role: 'owner' | 'admin' | 'member'
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
		locationDescription: string | null
	): Promise<DbJobSite> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				'INSERT INTO job_sites (id, org_id, name, location_description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(id, orgId, name, locationDescription, 'active', now, now)
			.run();

		return {
			id,
			org_id: orgId,
			name,
			location_description: locationDescription,
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
		updates: Partial<Pick<DbJobSite, 'name' | 'location_description' | 'status'>>
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const fields: string[] = [];
		const values: (string | number)[] = [];

		if (updates.name !== undefined) {
			fields.push('name = ?');
			values.push(updates.name);
		}
		if (updates.location_description !== undefined) {
			fields.push('location_description = ?');
			values.push(updates.location_description || '');
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

	async cleanExpiredSessions(): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
	}
}
