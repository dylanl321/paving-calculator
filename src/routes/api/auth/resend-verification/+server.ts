import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { sendVerificationEmail, buildOrgBranding } from '$lib/server/email';

export async function POST(event: RequestEvent) {
	try {
		const authUser = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const user = await db.getUserById(authUser.id);
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		if (user.email_verified) {
			return json({ error: 'Email is already verified', alreadyVerified: true }, { status: 400 });
		}

		const verifyToken = await db.createEmailToken(user.id, 'verify_email', 24 * 60 * 60);
		const baseUrl = new URL(event.request.url).origin;

		const org = await db.getOrgByUserId(user.id);
		const settings = org ? await db.getOrgSettings(org.id) : null;
		const branding = buildOrgBranding(org, settings);

		const result = await sendVerificationEmail(
			event.platform?.env.RESEND_API_KEY,
			user.email,
			user.name,
			verifyToken,
			baseUrl,
			branding,
			{ logger: db, orgId: org?.id ?? null, userId: user.id }
		);

		if (!result.ok) {
			return json(
				{ error: 'Could not send verification email. Please try again later.' },
				{ status: 502 }
			);
		}

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Resend verification error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
