import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';
import { sendVerificationEmail, buildOrgBranding } from '$lib/server/email';

type Body = { action: 'force_verify' | 'unverify' | 'resend' };

export async function POST(event: RequestEvent) {
	try {
		const admin = await requireGlobalAdmin(event);
		const { id } = event.params;
		if (!id) return json({ error: 'User ID is required' }, { status: 400 });

		const body = (await event.request.json()) as Body;
		const db = new DbHelper(event.platform!.env.DB);
		const user = await db.getUserById(id);
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const ipAddress =
			event.request.headers.get('cf-connecting-ip') ||
			event.request.headers.get('x-forwarded-for') ||
			undefined;
		const userAgent = event.request.headers.get('user-agent') || undefined;
		const org = await db.getOrgByUserId(id);

		if (body.action === 'force_verify') {
			await db.setEmailVerified(id, true);
			await recordAudit(event.platform!.env.DB, {
				actorUserId: admin.id,
				actorName: admin.name,
				orgId: org?.id ?? 'global',
				resourceType: 'user',
				resourceId: id,
				action: 'email_verified_forced',
				ipAddress,
				userAgent
			});
			return json({ ok: true, email_verified: true });
		}

		if (body.action === 'unverify') {
			await db.setEmailVerified(id, false);
			await recordAudit(event.platform!.env.DB, {
				actorUserId: admin.id,
				actorName: admin.name,
				orgId: org?.id ?? 'global',
				resourceType: 'user',
				resourceId: id,
				action: 'email_unverified',
				ipAddress,
				userAgent
			});
			return json({ ok: true, email_verified: false });
		}

		if (body.action === 'resend') {
			if (user.email_verified) {
				return json({ error: 'Email is already verified' }, { status: 400 });
			}
			const verifyToken = await db.createEmailToken(id, 'verify_email', 24 * 60 * 60);
			const baseUrl = new URL(event.request.url).origin;
			const settings = org ? await db.getOrgSettings(org.id) : null;
			const branding = buildOrgBranding(org, settings);

			const result = await sendVerificationEmail(
				event.platform?.env.RESEND_API_KEY,
				user.email,
				user.name,
				verifyToken,
				baseUrl,
				branding,
				{ logger: db, orgId: org?.id ?? null, userId: id }
			);

			if (!result.ok) {
				return json({ error: 'Could not send verification email.' }, { status: 502 });
			}
			return json({ ok: true, sent: true });
		}

		return json({ error: 'Invalid action' }, { status: 400 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error in verify-email action:', error);
		return json({ error: 'Failed to update verification' }, { status: 500 });
	}
}
