import { redirect } from '@sveltejs/kit';
import { getAuthUser } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const user = await getAuthUser(event);
	if (!user) throw redirect(303, '/login');
	if (!user.isGlobalAdmin) throw redirect(303, '/dashboard');
	return { adminUser: user };
};
