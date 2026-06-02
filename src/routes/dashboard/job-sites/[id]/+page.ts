import { redirect, error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
	try {
		const authRes = await fetch('/api/auth/me', { credentials: 'include' });
		if (!authRes.ok) {
			throw redirect(302, '/login');
		}

		const authData = await authRes.json();

		const siteRes = await fetch(`/api/job-sites/${params.id}`, { credentials: 'include' });
		if (!siteRes.ok) {
			if (siteRes.status === 404) {
				throw error(404, 'Job site not found');
			}
			throw error(siteRes.status, 'Failed to load job site');
		}

		const siteData = await siteRes.json();

		const [calcRes, configRes, equipmentRes, assignmentsRes, routeRes, milestonesRes] = await Promise.all([
			fetch(`/api/calculations?job_site_id=${params.id}`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/config`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/equipment`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/assignments`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/route`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/milestones`, { credentials: 'include' })
		]);

		if (!calcRes.ok) {
			throw error(calcRes.status, 'Failed to load calculations');
		}

		const calcData = await calcRes.json();
		const configData = configRes.ok ? await configRes.json() : { config: null };
		const equipmentData = equipmentRes.ok ? await equipmentRes.json() : { equipment: [] };
		const assignmentsData = assignmentsRes.ok ? await assignmentsRes.json() : { assignments: [] };
		const routeData = routeRes.ok ? await routeRes.json() : { waypoints: [] };
		const milestonesData = milestonesRes.ok ? await milestonesRes.json() : { milestones: [] };

		return {
			user: authData.user,
			org: authData.org,
			jobSite: siteData,
			calculations: calcData.calculations || [],
			config: configData.config,
			equipment: equipmentData.equipment || [],
			assignments: assignmentsData.assignments || [],
			routeWaypoints: routeData.waypoints || [],
			milestones: milestonesData.milestones || []
		};
	} catch (err) {
		// Re-throw SvelteKit errors/redirects; do not swallow real load failures
		throw err;
	}
};
