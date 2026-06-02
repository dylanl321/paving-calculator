import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/org/settings', { credentials: 'include' });
		if (!res.ok) {
			if (res.status === 401) throw redirect(302, '/login');
			return {
				error: true,
				errorMessage: `Failed to load settings (${res.status})`,
				errorStatus: res.status
			};
		}
		const settings = await res.json();
		return { settings };
	} catch (err) {
		// Re-throw SvelteKit redirects
		if (err && typeof err === 'object' && 'status' in err) throw err;
		return {
			error: true,
			errorMessage: 'Network error while loading settings',
			errorStatus: 0
		};
	}
};
