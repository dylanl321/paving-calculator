import type { PageServerLoad } from './$types';
import { DbHelper } from '$lib/server/db';

export const load: PageServerLoad = async ({ url, platform }) => {
	const token = url.searchParams.get('token');

	if (!token) {
		return { error: 'missing_token', invitation: null, org: null, existingUser: false };
	}

	if (!platform?.env?.DB) {
		return { error: 'invalid_token', invitation: null, org: null, existingUser: false };
	}

	const db = new DbHelper(platform.env.DB);

	const invitation = await db.getInvitationByToken(token);

	if (!invitation) {
		return { error: 'invalid_token', invitation: null, org: null, existingUser: false };
	}

	if (invitation.accepted_at !== null) {
		return { error: 'already_accepted', invitation, org: null, existingUser: false };
	}

	const now = Math.floor(Date.now() / 1000);
	if (invitation.expires_at < now) {
		return { error: 'expired', invitation, org: null, existingUser: false };
	}

	const org = await db.getOrganizationById(invitation.org_id);
	const existingUser = await db.getUserByEmail(invitation.email);

	return {
		error: null,
		invitation,
		org,
		existingUser: existingUser !== null
	};
};
