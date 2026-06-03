import type { D1Database } from '../../cloudflare';

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

export class DbWebhookHelper {
	constructor(private db: D1Database) {}

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
