import type { D1Database } from '../../cloudflare';

export interface DbMilestone {
	id: string;
	job_site_id: string;
	name: string;
	description: string | null;
	status: string;
	target_date: string | null;
	completed_at: number | null;
	sort_order: number;
	created_at: number;
	updated_at: number;
}

export class DbMilestoneHelper {
	constructor(private db: D1Database) {}

	async getMilestones(jobSiteId: string): Promise<DbMilestone[]> {
		return await this.db
			.prepare(
				'SELECT * FROM job_site_milestones WHERE job_site_id = ? ORDER BY sort_order ASC, created_at ASC'
			)
			.bind(jobSiteId)
			.all<DbMilestone>()
			.then((r) => r.results);
	}

	async createMilestone(
		jobSiteId: string,
		data: {
			name: string;
			description?: string | null;
			status?: string;
			target_date?: string | null;
			sort_order?: number;
		}
	): Promise<DbMilestone> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		const status = data.status ?? 'pending';
		const sortOrder = data.sort_order ?? 0;

		await this.db
			.prepare(
				`INSERT INTO job_site_milestones (
					id, job_site_id, name, description, status, target_date, completed_at, sort_order, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				jobSiteId,
				data.name,
				data.description ?? null,
				status,
				data.target_date ?? null,
				null,
				sortOrder,
				now,
				now
			)
			.run();

		return {
			id,
			job_site_id: jobSiteId,
			name: data.name,
			description: data.description ?? null,
			status,
			target_date: data.target_date ?? null,
			completed_at: null,
			sort_order: sortOrder,
			created_at: now,
			updated_at: now
		};
	}

	async updateMilestone(
		milestoneId: string,
		updates: {
			name?: string;
			description?: string | null;
			status?: string;
			target_date?: string | null;
			sort_order?: number;
			completed_at?: number | null;
		}
	): Promise<DbMilestone | null> {
		const now = Math.floor(Date.now() / 1000);
		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (updates.name !== undefined) {
			fields.push('name = ?');
			values.push(updates.name);
		}
		if (updates.description !== undefined) {
			fields.push('description = ?');
			values.push(updates.description);
		}
		if (updates.status !== undefined) {
			fields.push('status = ?');
			values.push(updates.status);
		}
		if (updates.target_date !== undefined) {
			fields.push('target_date = ?');
			values.push(updates.target_date);
		}
		if (updates.sort_order !== undefined) {
			fields.push('sort_order = ?');
			values.push(updates.sort_order);
		}
		if (updates.completed_at !== undefined) {
			fields.push('completed_at = ?');
			values.push(updates.completed_at);
		}

		if (fields.length > 0) {
			fields.push('updated_at = ?');
			values.push(now);
			values.push(milestoneId);

			await this.db
				.prepare(`UPDATE job_site_milestones SET ${fields.join(', ')} WHERE id = ?`)
				.bind(...values)
				.run();
		}

		return await this.db
			.prepare('SELECT * FROM job_site_milestones WHERE id = ?')
			.bind(milestoneId)
			.first<DbMilestone>();
	}

	async deleteMilestone(milestoneId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM job_site_milestones WHERE id = ?')
			.bind(milestoneId)
			.run();
	}
}
