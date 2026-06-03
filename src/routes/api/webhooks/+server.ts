import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { generateWebhookSecret } from '$lib/server/webhooks';

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

		const webhooks = await db.getWebhooksByOrgId(org.id);

		// Return webhooks without the secret field
		return json({
			webhooks: webhooks.map((webhook) => ({
				id: webhook.id,
				url: webhook.url,
				events: JSON.parse(webhook.events),
				description: webhook.description,
				is_active: webhook.is_active === 1,
				created_at: webhook.created_at
			}))
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get webhooks error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface CreateWebhookRequest {
	url: string;
	events: string[];
	description?: string;
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Only owners and admins can create webhooks' }, { status: 403 });
		}

		const body: CreateWebhookRequest = await event.request.json();

		// Validate URL
		if (!body.url || !body.url.startsWith('https://')) {
			return json({ error: 'URL must start with https://' }, { status: 400 });
		}

		// Validate events
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

		// Generate secret
		const secret = generateWebhookSecret();

		// Create webhook
		const webhook = await db.createWebhook(
			org.id,
			body.url,
			secret,
			body.events,
			body.description || null,
			user.id
		);

		// Return the webhook including the secret (ONLY time it's exposed)
		return json(
			{
				id: webhook.id,
				url: webhook.url,
				secret: webhook.secret,
				events: JSON.parse(webhook.events),
				description: webhook.description,
				is_active: webhook.is_active === 1,
				created_at: webhook.created_at
			},
			{ status: 201 }
		);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create webhook error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
