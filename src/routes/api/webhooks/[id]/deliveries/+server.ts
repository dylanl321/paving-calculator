import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

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
			return json({ error: 'Only owners and admins can view webhook deliveries' }, { status: 403 });
		}

		const { id } = event.params;
		if (!id) return json({ error: 'Webhook ID is required' }, { status: 400 });
		const webhook = await db.getWebhookById(id);
		if (!webhook) {
			return json({ error: 'Webhook not found' }, { status: 404 });
		}

		// Verify webhook belongs to user's org
		if (webhook.org_id !== org.id) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		// Get status filter from query params
		const statusFilter = event.url.searchParams.get('status') || undefined;
		if (statusFilter && !['pending', 'delivered', 'failed'].includes(statusFilter)) {
			return json({ error: 'Invalid status filter. Must be pending, delivered, or failed' }, { status: 400 });
		}

		const deliveries = await db.getWebhookDeliveries(id, statusFilter, 50);

		return json({
			deliveries: deliveries.map((delivery) => ({
				id: delivery.id,
				event_type: delivery.event_type,
				status: delivery.status,
				http_status: delivery.http_status,
				attempt_count: delivery.attempt_count,
				last_attempted_at: delivery.last_attempted_at,
				delivered_at: delivery.delivered_at,
				created_at: delivery.created_at
			}))
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get webhook deliveries error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
