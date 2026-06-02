import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

const VALID_EVENT_TYPES = [
	'job_site.created',
	'job_site.updated',
	'job_site.status_changed',
	'daily_log.created',
	'daily_log.updated',
	'member.invited',
	'member.removed',
	'load.logged'
];

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Only owners and admins can view webhooks' }, { status: 403 });
		}

		const webhook = await db.getWebhookById(event.params.id);
		if (!webhook) {
			return json({ error: 'Webhook not found' }, { status: 404 });
		}

		// Verify webhook belongs to user's org
		if (webhook.org_id !== org.id) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		// Return webhook without the secret field
		return json({
			id: webhook.id,
			url: webhook.url,
			events: JSON.parse(webhook.events),
			description: webhook.description,
			is_active: webhook.is_active === 1,
			created_at: webhook.created_at
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get webhook error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface UpdateWebhookRequest {
	url?: string;
	events?: string[];
	description?: string;
	is_active?: boolean;
}

export async function PATCH(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Only owners and admins can update webhooks' }, { status: 403 });
		}

		const webhook = await db.getWebhookById(event.params.id);
		if (!webhook) {
			return json({ error: 'Webhook not found' }, { status: 404 });
		}

		// Verify webhook belongs to user's org
		if (webhook.org_id !== org.id) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		const body: UpdateWebhookRequest = await event.request.json();

		// Validate URL if provided
		if (body.url !== undefined && !body.url.startsWith('https://')) {
			return json({ error: 'URL must start with https://' }, { status: 400 });
		}

		// Validate events if provided
		if (body.events !== undefined) {
			if (!Array.isArray(body.events) || body.events.length === 0) {
				return json({ error: 'Events must be a non-empty array' }, { status: 400 });
			}

			for (const eventType of body.events) {
				if (!VALID_EVENT_TYPES.includes(eventType)) {
					return json(
						{
							error: `Invalid event type: ${eventType}`,
							valid_events: VALID_EVENT_TYPES
						},
						{ status: 400 }
					);
				}
			}
		}

		// Update webhook
		await db.updateWebhook(event.params.id, {
			url: body.url,
			events: body.events,
			description: body.description,
			is_active: body.is_active
		});

		// Fetch updated webhook
		const updatedWebhook = await db.getWebhookById(event.params.id);
		if (!updatedWebhook) {
			return json({ error: 'Webhook not found after update' }, { status: 500 });
		}

		return json({
			id: updatedWebhook.id,
			url: updatedWebhook.url,
			events: JSON.parse(updatedWebhook.events),
			description: updatedWebhook.description,
			is_active: updatedWebhook.is_active === 1,
			created_at: updatedWebhook.created_at
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Update webhook error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Only owners and admins can delete webhooks' }, { status: 403 });
		}

		const webhook = await db.getWebhookById(event.params.id);
		if (!webhook) {
			return json({ error: 'Webhook not found' }, { status: 404 });
		}

		// Verify webhook belongs to user's org
		if (webhook.org_id !== org.id) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		// Delete webhook (and its deliveries via cascade or explicit)
		await db.deleteWebhook(event.params.id);

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Delete webhook error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
