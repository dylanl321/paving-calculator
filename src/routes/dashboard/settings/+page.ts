import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const [settingsRes, notificationPrefsRes] = await Promise.all([
			fetch('/api/org/settings', { credentials: 'include' }),
			fetch('/api/user/notification-prefs', { credentials: 'include' })
		]);

		if (!settingsRes.ok) {
			if (settingsRes.status === 401) throw redirect(302, '/login');
			return {
				error: true,
				errorMessage: `Failed to load settings (${settingsRes.status})`,
				errorStatus: settingsRes.status
			};
		}

		const settings = await settingsRes.json();
		const notificationPrefs = notificationPrefsRes.ok
			? await notificationPrefsRes.json()
			: { prefs: {} };

		return { settings, notificationPrefs: notificationPrefs.prefs };
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
