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

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const assignments = await db.getJobSiteAssignments(jobSiteId);

		return json({
			assignments: assignments.map((a) => ({
				job_site_id: a.job_site_id,
				user_id: a.user_id,
				user_name: a.user_name,
				user_email: a.user_email,
				role: a.role,
				assigned_at: a.assigned_at
			}))
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get assignments error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface AssignUserRequest {
	user_id: string;
	role: 'foreman' | 'operator' | 'inspector';
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const body: AssignUserRequest = await event.request.json();

		if (!body.user_id || !body.role) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		if (!['foreman', 'operator', 'inspector'].includes(body.role)) {
			return json({ error: 'Invalid role' }, { status: 400 });
		}

		const targetUser = await db.getUserById(body.user_id);
		if (!targetUser) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const targetUserRole = await db.getUserRole(body.user_id, org.id);
		if (!targetUserRole) {
			return json({ error: 'User not in organization' }, { status: 403 });
		}

		await db.assignUserToJobSite(jobSiteId, body.user_id, body.role);

		return json({
			job_site_id: jobSiteId,
			user_id: body.user_id,
			role: body.role
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Assign user error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
