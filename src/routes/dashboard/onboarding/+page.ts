import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	if (browser) {
		const completed = localStorage.getItem('onboarding_complete');
		if (completed === '1') {
			throw redirect(307, '/dashboard');
		}
	}
	return {};
};
