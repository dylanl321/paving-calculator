import type { D1Database } from '../../cloudflare';
import type { DbJobSiteEquipment, DbJobSiteAssignment } from './db-jobsites';

export class DbJobSiteEquipmentHelper {
	constructor(private db: D1Database) {}

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
}
