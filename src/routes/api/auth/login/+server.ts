import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { verifyPassword, createSession, setSessionCookie } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { checkRateLimit } from '$lib/server/rate-limit';
import { logAuditEvent } from '$lib/server/db-audit';

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
		const ipAddress = event.request.headers.get('CF-Connecting-IP') ?? event.request.headers.get('X-Forwarded-For') ?? 'unknown';
		const userAgent = event.request.headers.get('User-Agent') ?? '';

		if (!user) {
			await logAuditEvent({
				db: event.platform.env.DB,
				eventType: 'login_failed',
				ipAddress,
				userAgent,
				metadata: { email: body.email, reason: 'user_not_found' }
			});
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		const isValid = await verifyPassword(body.password, user.password_hash);
		if (!isValid) {
			await logAuditEvent({
				db: event.platform.env.DB,
				userId: user.id,
				eventType: 'login_failed',
				ipAddress,
				userAgent,
				metadata: { email: body.email, reason: 'invalid_password' }
			});
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		const sessionToken = await createSession(db, user.id);
		setSessionCookie(event.cookies, sessionToken);

		// Update last login info
		await event.platform.env.DB.prepare('UPDATE users SET last_login_at = unixepoch(), last_login_ip = ? WHERE id = ?')
			.bind(ipAddress, user.id)
			.run();

		const org = await db.getOrgByUserId(user.id);

		// Log successful login
		await logAuditEvent({
			db: event.platform.env.DB,
			userId: user.id,
			orgId: org?.id,
			eventType: 'login_success',
			ipAddress,
			userAgent,
			metadata: { email: user.email }
		});
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
		await db.prepare('UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE id = ?')
			.bind(Math.floor(Date.now() / 1000), ipAddress, user.id)
			.run();

		return json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name
			}
		});
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
