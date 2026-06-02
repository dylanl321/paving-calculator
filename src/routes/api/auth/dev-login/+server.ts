import { json, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { DbHelper } from '$lib/server/db';
import { hashPassword, slugify, createSession, setSessionCookie } from '$lib/server/auth';

// Local-only convenience login. Seeds a known dev user + org if missing,
// then issues a session. Disabled outside `vite dev` / preview dev builds.
const DEV_EMAIL = 'dev@paverate.local';
const DEV_PASSWORD = 'devpassword';
const DEV_NAME = 'Dev User';
const DEV_ORG = 'Dev Paving Co';

export async function POST(event: RequestEvent) {
	if (!dev) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	try {
		if (!event.platform?.env?.DB) {
			return json(
				{
					error:
						'Local database not available. Run migrations: npx wrangler d1 execute paverate-db --local --file=./migrations/0001_initial_schema.sql'
				},
				{ status: 503 }
			);
		}

		const db = new DbHelper(event.platform.env.DB);

		let user = await db.getUserByEmail(DEV_EMAIL);
		if (!user) {
			const passwordHash = await hashPassword(DEV_PASSWORD);
			user = await db.createUser(DEV_EMAIL, passwordHash, DEV_NAME);
			const org = await db.createOrganization(DEV_ORG, slugify(DEV_ORG));
			await db.addOrgMember(user.id, org.id, 'owner');
		} else if (!(await db.getOrgByUserId(user.id))) {
			const org = await db.createOrganization(DEV_ORG, slugify(DEV_ORG));
			await db.addOrgMember(user.id, org.id, 'owner');
		}

		const sessionToken = await createSession(db, user.id);
		setSessionCookie(event.cookies, sessionToken);

		return json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name
			}
		});
	} catch (error) {
		console.error('Dev login error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
