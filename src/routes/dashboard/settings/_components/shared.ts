import type { OrgOverrides } from '$lib/config/overrides';

/** Settings page tab identifiers. */
export type TabId = 'general' | 'defaults' | 'branding' | 'notifications';

export interface SettingsSaveResult {
	error?: string;
	hasLogo?: boolean;
	accentColor?: string | null;
	overrides?: OrgOverrides;
	org?: { name?: string } | null;
}

export interface LogoUploadResult {
	error?: string;
}

export interface NotificationPrefsResult {
	error?: string;
	prefs?: Record<string, boolean>;
}

export interface EmailPreviewResult {
	html: string;
	subject: string;
	from: string;
}
