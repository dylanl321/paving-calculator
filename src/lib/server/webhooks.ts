import type { D1Database } from '../../cloudflare';

export interface WebhookEvent {
	type: string;
	orgId: string;
	payload: Record<string, unknown>;
	occurredAt: number;
}

interface DbWebhook {
	id: string;
	org_id: string;
	url: string;
	secret: string;
	events: string; // JSON array
	description: string | null;
	is_active: number;
	created_by: string | null;
	created_at: number;
	updated_at: number;
}

interface WebhookDeliveryPayload {
	id: string;
	event: string;
	org_id: string;
	occurred_at: number;
	data: Record<string, unknown>;
}

export function generateWebhookSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function signPayload(payload: string, secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const keyData = encoder.encode(secret);
	const messageData = encoder.encode(payload);

	const key = await crypto.subtle.importKey(
		'raw',
		keyData,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('HMAC', key, messageData);
	const hashArray = Array.from(new Uint8Array(signature));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deliverToWebhook(
	db: D1Database,
	webhook: DbWebhook,
	event: WebhookEvent
): Promise<void> {
	const deliveryId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	const deliveryPayload: WebhookDeliveryPayload = {
		id: deliveryId,
		event: event.type,
		org_id: event.orgId,
		occurred_at: event.occurredAt,
		data: event.payload
	};

	const payloadJson = JSON.stringify(deliveryPayload);
	const signature = await signPayload(payloadJson, webhook.secret);

	// Insert pending delivery record
	await db
		.prepare(
			`INSERT INTO webhook_deliveries (
				id, webhook_id, event_type, payload, status, attempt_count, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(deliveryId, webhook.id, event.type, payloadJson, 'pending', 0, now)
		.run();

	// Attempt delivery
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

		const response = await fetch(webhook.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-PaveRate-Signature': signature,
				'User-Agent': 'PaveRate-Webhooks/1.0'
			},
			body: payloadJson,
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		const responseBody = await response.text();
		const status = response.ok ? 'delivered' : 'failed';

		await db
			.prepare(
				`UPDATE webhook_deliveries
				SET status = ?, http_status = ?, response_body = ?,
				    attempt_count = 1, last_attempted_at = ?, delivered_at = ?
				WHERE id = ?`
			)
			.bind(
				status,
				response.status,
				responseBody.substring(0, 5000), // Limit response body size
				now,
				response.ok ? now : null,
				deliveryId
			)
			.run();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		await db
			.prepare(
				`UPDATE webhook_deliveries
				SET status = ?, response_body = ?, attempt_count = 1, last_attempted_at = ?
				WHERE id = ?`
			)
			.bind('failed', errorMessage.substring(0, 5000), now, deliveryId)
			.run();
	}
}

export async function deliverWebhook(db: D1Database, event: WebhookEvent): Promise<void> {
	// Query active webhooks for this org that are subscribed to this event type
	const webhooks = await db
		.prepare(
			`SELECT * FROM webhooks
			WHERE org_id = ? AND is_active = 1`
		)
		.bind(event.orgId)
		.all<DbWebhook>();

	if (!webhooks.results || webhooks.results.length === 0) {
		return;
	}

	// Filter webhooks that are subscribed to this event type
	const matchingWebhooks = webhooks.results.filter((webhook) => {
		try {
			const events = JSON.parse(webhook.events) as string[];
			return events.includes(event.type);
		} catch {
			return false;
		}
	});

	// Deliver to each matching webhook (fire and forget)
	const deliveryPromises = matchingWebhooks.map((webhook) =>
		deliverToWebhook(db, webhook, event).catch((error) => {
			console.error(`Failed to deliver webhook ${webhook.id}:`, error);
		})
	);

	// Don't await - fire and forget
	Promise.all(deliveryPromises).catch(() => {
		// Suppress unhandled promise rejection
	});
}
