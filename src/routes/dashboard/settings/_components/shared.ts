import type { OrgOverrides } from '$lib/config/overrides';

/** Settings page tab identifiers. */
export type TabId = 'general' | 'defaults' | 'branding' | 'notifications' | 'reports' | 'mixes';

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

export interface EmailReportSchedule {
	id: string;
	reportType: 'daily_summary' | 'weekly_rollup' | 'monthly_rollup';
	frequency: 'daily' | 'weekly' | 'monthly';
	sendHour: number;
	dayOfWeek: number | null;
	recipients: string[];
	enabled: boolean;
	lastSentAt: number | null;
}
