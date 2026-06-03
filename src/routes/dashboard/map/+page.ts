import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/auth/me', { credentials: 'include' });

	if (!res.ok) {
		throw redirect(302, '/login');
	}

	const data = await res.json();

	return {
		user: data.user,
		org: data.org
	};
};
