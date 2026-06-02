import { redirect, error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ params, fetch }) => {
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

		return {
			user: authData.user,
			org: authData.org,
			jobSite: siteData
		};
	} catch (err) {
		if (err instanceof Response) throw err;
		throw redirect(302, '/login');
	}
};
