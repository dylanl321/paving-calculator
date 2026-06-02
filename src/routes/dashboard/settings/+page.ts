import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/org/settings', { credentials: 'include' });
	if (!res.ok) {
		if (res.status === 401) throw redirect(302, '/login');
		throw redirect(302, '/dashboard');
	}
	const settings = await res.json();
	return { settings };
};
