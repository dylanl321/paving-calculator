import type { D1Database } from '../../cloudflare';
import type { DbJobSite } from './db-jobsites';

export interface DbCrewLocation {
	id: number;
	org_id: string;
	job_site_id: number | null;
	user_id: string;
	display_name: string;
	role: string;
	lat: number;
	lng: number;
	accuracy: number | null;
	heading: number | null;
	speed: number | null;
	status: 'active' | 'idle' | 'offline';
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

export class DbCrewHelper {
	constructor(private db: D1Database) {}

	async listCrews(orgId: string): Promise<{ id: string; name: string; color: string; created_by: string; created_at: number; }[]> {
		return await this.db
			.prepare('SELECT id, name, color, created_by, created_at FROM crews WHERE org_id = ? ORDER BY name ASC')
			.bind(orgId)
			.all<{ id: string; name: string; color: string; created_by: string; created_at: number }>()
			.then(r => r.results);
	}

	async getCrewMembers(crewId: string): Promise<{ user_id: string; org_id: string; assigned_at: number; name?: string; email?: string; }[]> {
		return await this.db
			.prepare(`
				SELECT cm.user_id, cm.org_id, cm.assigned_at, u.name, u.email
				FROM crew_members cm
				JOIN users u ON u.id = cm.user_id
				WHERE cm.crew_id = ?
				ORDER BY u.name ASC
			`)
			.bind(crewId)
			.all<{ user_id: string; org_id: string; assigned_at: number; name: string; email: string }>()
			.then(r => r.results);
	}

	async getCrewJobSites(crewId: string): Promise<{ id: string; name: string; status: string; location_description: string | null; }[]> {
		return await this.db
			.prepare(`
				SELECT js.id, js.name, js.status, js.location_description
				FROM crew_job_sites cjs
				JOIN job_sites js ON js.id = cjs.job_site_id
				WHERE cjs.crew_id = ?
				ORDER BY js.name ASC
			`)
			.bind(crewId)
			.all<{ id: string; name: string; status: string; location_description: string | null }>()
			.then(r => r.results);
	}

	async assignJobSiteToCrew(crewId: string, jobSiteId: string, orgId: string, assignedBy: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(`
				INSERT OR IGNORE INTO crew_job_sites (crew_id, job_site_id, org_id, assigned_at, assigned_by)
				VALUES (?, ?, ?, ?, ?)
			`)
			.bind(crewId, jobSiteId, orgId, now, assignedBy)
			.run();
	}

	async removeJobSiteFromCrew(crewId: string, jobSiteId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM crew_job_sites WHERE crew_id = ? AND job_site_id = ?')
			.bind(crewId, jobSiteId)
			.run();
	}

	async createCrew(orgId: string, name: string, color: string, createdBy: string): Promise<{ id: string; name: string; color: string; org_id: string; created_by: string; created_at: number; }> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(id, orgId, name, color, createdBy, now)
			.run();
		return { id, name, color, org_id: orgId, created_by: createdBy, created_at: now };
	}

	async updateCrew(crewId: string, orgId: string, updates: { name?: string; color?: string }): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const parts: string[] = [];
		const values: unknown[] = [];

		if (updates.name !== undefined) {
			parts.push('name = ?');
			values.push(updates.name);
		}
		if (updates.color !== undefined) {
			parts.push('color = ?');
			values.push(updates.color);
		}

		if (parts.length === 0) return;

		parts.push('updated_at = ?');
		values.push(now);

		values.push(crewId, orgId);

		await this.db
			.prepare(`UPDATE crews SET ${parts.join(', ')} WHERE id = ? AND org_id = ?`)
			.bind(...values)
			.run();
	}

	async getCrew(crewId: string, orgId: string): Promise<DbCrew | null> {
		return await this.db
			.prepare('SELECT * FROM crews WHERE id = ? AND org_id = ?')
			.bind(crewId, orgId)
			.first<DbCrew>();
	}

	async deleteCrew(crewId: string): Promise<void> {
		await this.db.prepare('DELETE FROM crews WHERE id = ?').bind(crewId).run();
	}

	async setCrewMember(crewId: string, userId: string, orgId: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		// remove from any existing crew in this org first (one crew per member per org)
		await this.db
			.prepare('DELETE FROM crew_members WHERE user_id = ? AND org_id = ?')
			.bind(userId, orgId)
			.run();
		await this.db
			.prepare('INSERT INTO crew_members (crew_id, user_id, org_id, assigned_at) VALUES (?, ?, ?, ?)')
			.bind(crewId, userId, orgId, now)
			.run();
	}

	async removeCrewMember(userId: string, orgId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM crew_members WHERE user_id = ? AND org_id = ?')
			.bind(userId, orgId)
			.run();
	}

	async getJobSitesByForeman(userId: string, orgId: string): Promise<DbJobSite[]> {
		return await this.db
			.prepare(
				`SELECT DISTINCT js.* FROM job_sites js
				JOIN crew_job_sites cjs ON cjs.job_site_id = js.id
				JOIN crew_members cm ON cm.crew_id = cjs.crew_id
				WHERE cm.user_id = ? AND js.org_id = ?
				ORDER BY js.created_at DESC`
			)
			.bind(userId, orgId)
			.all<DbJobSite>()
			.then((r) => r.results);
	}
}
