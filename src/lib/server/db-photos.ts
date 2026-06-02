import type { D1Database } from '../../cloudflare';

export interface DbPhoto {
	id: string;
	job_site_id: string;
	daily_log_id: string | null;
	log_entry_id: string | null;
	r2_key: string;
	filename: string;
	caption: string | null;
	lat: number | null;
	lng: number | null;
	gps_accuracy_m: number | null;
	taken_at: number;
	uploaded_by: string;
	created_at: number;
}

export interface CreatePhotoData {
	job_site_id: string;
	daily_log_id?: string | null;
	log_entry_id?: string | null;
	r2_key: string;
	filename: string;
	caption?: string | null;
	lat?: number | null;
	lng?: number | null;
	gps_accuracy_m?: number | null;
	taken_at: number;
	uploaded_by: string;
}

export class DbPhotoHelper {
	constructor(private db: D1Database) {}

	async listPhotos(jobSiteId: string, dailyLogId?: string): Promise<DbPhoto[]> {
		if (dailyLogId) {
			const result = await this.db
				.prepare(
					'SELECT * FROM photo_attachments WHERE job_site_id = ? AND daily_log_id = ? ORDER BY taken_at DESC'
				)
				.bind(jobSiteId, dailyLogId)
				.all<DbPhoto>();
			return result.results ?? [];
		} else {
			const result = await this.db
				.prepare('SELECT * FROM photo_attachments WHERE job_site_id = ? ORDER BY taken_at DESC')
				.bind(jobSiteId)
				.all<DbPhoto>();
			return result.results ?? [];
		}
	}

	async createPhoto(data: CreatePhotoData): Promise<DbPhoto> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				`INSERT INTO photo_attachments
				(id, job_site_id, daily_log_id, log_entry_id, r2_key, filename, caption, lat, lng, gps_accuracy_m, taken_at, uploaded_by, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				data.job_site_id,
				data.daily_log_id ?? null,
				data.log_entry_id ?? null,
				data.r2_key,
				data.filename,
				data.caption ?? null,
				data.lat ?? null,
				data.lng ?? null,
				data.gps_accuracy_m ?? null,
				data.taken_at,
				data.uploaded_by,
				now
			)
			.run();

		return {
			id,
			job_site_id: data.job_site_id,
			daily_log_id: data.daily_log_id ?? null,
			log_entry_id: data.log_entry_id ?? null,
			r2_key: data.r2_key,
			filename: data.filename,
			caption: data.caption ?? null,
			lat: data.lat ?? null,
			lng: data.lng ?? null,
			gps_accuracy_m: data.gps_accuracy_m ?? null,
			taken_at: data.taken_at,
			uploaded_by: data.uploaded_by,
			created_at: now
		};
	}

	async getPhoto(id: string): Promise<DbPhoto | null> {
		return await this.db
			.prepare('SELECT * FROM photo_attachments WHERE id = ?')
			.bind(id)
			.first<DbPhoto>();
	}

	async deletePhoto(id: string, uploadedBy: string): Promise<boolean> {
		const result = await this.db
			.prepare('DELETE FROM photo_attachments WHERE id = ? AND uploaded_by = ?')
			.bind(id, uploadedBy)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	}
}
