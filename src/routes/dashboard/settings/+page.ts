import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { OrgOverrides } from '$lib/config/overrides';
import type { EmailReportSchedule } from './_components/shared';

export interface OrgSettings {
	role: string;
	overrides: OrgOverrides;
	org: { name: string } | null;
	accentColor: string | null;
	hasLogo: boolean;
	emailFromName: string | null;
	emailReplyTo: string | null;
}

interface NotificationPrefsResponse {
	prefs: Record<string, boolean>;
}

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
				errorStatus: settingsRes.status,
				settings: null as OrgSettings | null,
				notificationPrefs: {} as Record<string, boolean>,
				emailReportSchedules: [],
				mixPresets: []
			};
		}

		const settings = (await settingsRes.json()) as OrgSettings;
		const notificationPrefs = (
			notificationPrefsRes.ok ? await notificationPrefsRes.json() : { prefs: {} }
		) as NotificationPrefsResponse;

		const role = settings?.role;
		const schedulesRes =
			role === 'owner' || role === 'admin'
				? await fetch('/api/org/email-report-schedules', { credentials: 'include' })
				: null;
		const emailReportSchedules =
			schedulesRes?.ok
				? ((await schedulesRes.json()) as { schedules: EmailReportSchedule[] }).schedules
				: ([] as EmailReportSchedule[]);

		const mixPresetsRes = await fetch('/api/org/mix-presets', { credentials: 'include' });
		const mixPresets = mixPresetsRes.ok ? await mixPresetsRes.json() : [];

		return {
			error: false,
			errorMessage: '',
			errorStatus: 0,
			settings,
			notificationPrefs: notificationPrefs.prefs,
			emailReportSchedules,
			mixPresets
		};
	} catch (err) {
		// Re-throw SvelteKit redirects
		if (err && typeof err === 'object' && 'status' in err) throw err;
		return {
			error: true,
			errorMessage: 'Network error while loading settings',
			errorStatus: 0,
			settings: null as OrgSettings | null,
			notificationPrefs: {} as Record<string, boolean>,
			emailReportSchedules: [],
			mixPresets: []
		};
	}
};
