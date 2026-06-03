import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';
import { sendPasswordResetEmail, buildOrgBranding } from '$lib/server/email';

export async function POST(event: RequestEvent) {
	try {
		const admin = await requireGlobalAdmin(event);
		const { id } = event.params;
		if (!id) return json({ error: 'User ID is required' }, { status: 400 });

		const db = new DbHelper(event.platform!.env.DB);
		const user = await db.getUserById(id);
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const resetToken = await db.createEmailToken(id, 'reset_password', 60 * 60);
		const baseUrl = new URL(event.request.url).origin;

		const org = await db.getOrgByUserId(id);
		const settings = org ? await db.getOrgSettings(org.id) : null;
		const branding = buildOrgBranding(org, settings);

		const result = await sendPasswordResetEmail(
			event.platform?.env.RESEND_API_KEY,
			user.email,
			user.name,
			resetToken,
			baseUrl,
			branding,
			{ logger: db, orgId: org?.id ?? null, userId: id }
		);

		await recordAudit(event.platform!.env.DB, {
			actorUserId: admin.id,
			actorName: admin.name,
			orgId: org?.id ?? 'global',
			resourceType: 'user',
			resourceId: id,
			action: 'password_reset_sent',
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		if (!result.ok) {
			return json({ error: 'Could not send password reset email.' }, { status: 502 });
		}

		return json({ ok: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error sending password reset:', error);
		return json({ error: 'Failed to send password reset' }, { status: 500 });
	}
}
