import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth, requireOrgRole } from '$lib/server/auth';
import { buildPreviewEmail, type OrgBranding } from '$lib/server/email';

const VALID_TYPES = ['invitation', 'verification', 'password-reset'] as const;
type PreviewType = (typeof VALID_TYPES)[number];

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		await requireOrgRole(event, org.id, ['owner', 'admin']);

		const typeParam = event.url.searchParams.get('type') ?? 'invitation';
		if (!VALID_TYPES.includes(typeParam as PreviewType)) {
			return json(
				{ error: 'type must be invitation, verification, or password-reset' },
				{ status: 400 }
			);
		}
		const type = typeParam as PreviewType;

		const settings = await db.getOrgSettings(org.id);
		const branding: OrgBranding = {
			orgName: org.name,
			accentColor: settings?.accent_color ?? undefined,
			emailFromName: settings?.email_from_name ?? undefined,
			emailReplyTo: settings?.email_reply_to ?? undefined
		};

		const preview = buildPreviewEmail(type, branding);

		return json(preview);
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Email preview error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
