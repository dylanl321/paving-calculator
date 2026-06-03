import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/auth/me', { credentials: 'include' });

	if (!res.ok) {
		throw redirect(302, '/login');
	}

	const data = (await res.json()) as { user?: unknown; org?: unknown };

	return {
		user: data.user,
		org: data.org
	};
};
