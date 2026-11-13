import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import type { D1Database } from '../../cloudflare';

/**
 * Field roles only see projects assigned to their crew.
 * Owner, admin, member, office, and inspector keep the whole organization.
 */
export const FIELD_PROJECT_ROLES = ['foreman', 'laborer', 'operator', 'screed_man'] as const;

const STATIC_JOB_SITE_SEGMENTS = new Set([
	'map',
	'from-import',
	'import-pdf',
	'import-route-preview'
]);

export function isFieldProjectRole(role: string | null | undefined): boolean {
	return !!role && (FIELD_PROJECT_ROLES as readonly string[]).includes(role);
}

/** `/api/job-sites/:id` and nested routes. Static collection paths are not ids. */
export function jobSiteIdFromApiPath(pathname: string): string | null {
	const match = pathname.match(/^\/api\/job-sites\/([^/]+)/);
	if (!match) return null;
	const segment = decodeURIComponent(match[1]);
	if (STATIC_JOB_SITE_SEGMENTS.has(segment)) return null;
	return segment;
}

export async function jobSiteAccessDecision(
	db: D1Database,
	userId: string,
	jobSiteId: string
): Promise<{ ok: true } | { ok: false; status: 403 | 404; error: string }> {
	const helper = new DbHelper(db);
	const jobSite = await helper.getJobSiteById(jobSiteId);
	if (!jobSite) return { ok: false, status: 404, error: 'Job site not found' };

	const org = await helper.getOrgByUserId(userId);
	if (!org || org.id !== jobSite.org_id) {
		return { ok: false, status: 403, error: 'Access denied' };
	}

	const role = await helper.getUserRole(userId, org.id);
	if (!isFieldProjectRole(role)) return { ok: true };

	const crewDb = new DbCrewHelper(db);
	const assigned = await crewDb.userAssignedToJobSite(userId, jobSiteId, org.id);
	if (!assigned) {
		return { ok: false, status: 403, error: 'This project is not assigned to your crew' };
	}
	return { ok: true };
}

/**
 * Returns a 403/404 response when the signed-in user cannot open this project.
 * Returns null when there is no signed-in user (the route still answers 401)
 * or when access is allowed.
 */
export async function enforceJobSiteAccess(
	event: RequestEvent,
	jobSiteId: string
): Promise<Response | null> {
	if (!event.locals.user || !event.platform?.env?.DB) return null;
	const decision = await jobSiteAccessDecision(event.platform.env.DB, event.locals.user.id, jobSiteId);
	if (decision.ok) return null;
	return json({ error: decision.error }, { status: decision.status });
}
