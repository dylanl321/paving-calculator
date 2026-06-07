import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { loadEnrichedProjects } from '$lib/loaders/project-summaries';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const authRes = await fetch('/api/auth/me', { credentials: 'include' });
		if (!authRes.ok) {
			throw redirect(302, '/login');
		}

		const authData = (await authRes.json()) as {
			user: unknown;
			org: unknown;
		};

		const projects = await loadEnrichedProjects(fetch);

		return {
			user: authData.user,
			org: authData.org,
			projects
		};
	} catch (err) {
		if (err instanceof Response) throw err;
		throw redirect(302, '/login');
	}
};
