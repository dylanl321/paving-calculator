import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { verifyPassword, createSession, setSessionCookie } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { checkRateLimit } from '$lib/server/rate-limit';
import { logAuditEvent } from '$lib/server/db-audit';
import { getViewForRole, getRedirectForView } from '$lib/server/role-views';

interface LoginRequest {
	email: string;
	password: string;
}

export async function POST(event: RequestEvent) {
	try {
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		// Rate limiting: 10 attempts per hour
		const ip =
			event.request.headers.get('CF-Connecting-IP') ||
			event.request.headers.get('X-Forwarded-For') ||
			'0.0.0.0';
		const rateLimit = await checkRateLimit(event.platform.env.DB, ip, 'login', 10, 3600);
		if (!rateLimit.allowed) {
			return json(
				{ error: 'Too many requests. Please try again later.' },
				{ status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
			);
		}

		const body: LoginRequest = await event.request.json();

		if (!body.email || !body.password) {
			return json({ error: 'Missing email or password' }, { status: 400 });
		}

		const db = new DbHelper(event.platform.env.DB);

		const user = await db.getUserByEmail(body.email);
		if (!user) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		const isValid = await verifyPassword(body.password, user.password_hash);
		if (!isValid) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		const sessionToken = await createSession(db, user.id);
		setSessionCookie(event.cookies, sessionToken);

		const org = await db.getOrgByUserId(user.id);
		let redirectTo = '/dashboard';

		if (org) {
			await recordAudit(event.platform.env.DB, {
				actorUserId: user.id,
				actorName: user.name,
				orgId: org.id,
				resourceType: 'user',
				resourceId: user.id,
				action: 'logged_in',
				ipAddress:
					event.request.headers.get('cf-connecting-ip') ||
					event.request.headers.get('x-forwarded-for') ||
					undefined,
				userAgent: event.request.headers.get('user-agent') || undefined
			});

			// Look up user role and determine redirect
			const role = await db.getUserRole(user.id, org.id);
			if (role) {
				const view = getViewForRole(role);
				redirectTo = getRedirectForView(view);
			}
		}

		// Log to admin audit log
		const ipAddress = event.request.headers.get('CF-Connecting-IP') || event.request.headers.get('X-Forwarded-For') || undefined;
		const userAgent = event.request.headers.get('user-agent') || undefined;
		await logAuditEvent(event.platform.env.DB, {
			user_id: user.id,
			org_id: org?.id,
			event_type: 'login',
			ip_address: ipAddress,
			user_agent: userAgent
		});

		// Update last login fields
		await db
			.prepare('UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE id = ?')
			.bind(Math.floor(Date.now() / 1000), ipAddress, user.id)
			.run();

		return json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name
			},
			redirectTo
		});
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
