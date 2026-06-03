import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { hashPassword, slugify, createSession, setSessionCookie } from '$lib/server/auth';
import { sendVerificationEmail, buildOrgBranding } from '$lib/server/email';
import { checkRateLimit } from '$lib/server/rate-limit';

interface RegisterRequest {
	email: string;
	password: string;
	name: string;
	orgName: string;
}

export async function POST(event: RequestEvent) {
	try {
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		// Rate limiting: 5 attempts per hour
		const ip =
			event.request.headers.get('CF-Connecting-IP') ||
			event.request.headers.get('X-Forwarded-For') ||
			'0.0.0.0';
		const rateLimit = await checkRateLimit(event.platform.env.DB, ip, 'register', 5, 3600);
		if (!rateLimit.allowed) {
			return json(
				{ error: 'Too many requests. Please try again later.' },
				{ status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
			);
		}

		const body: RegisterRequest = await event.request.json();

		if (!body.email || !body.password || !body.name || !body.orgName) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Normalize and validate email
		const email = body.email.trim().toLowerCase();
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return json({ error: 'Invalid email format' }, { status: 400 });
		}

		// Normalize and validate name
		const name = body.name.trim().replace(/<[^>]*>/g, '');
		if (name.length < 2) {
			return json({ error: 'Name must be at least 2 characters' }, { status: 400 });
		}
		if (name.length > 100) {
			return json({ error: 'Name must be 100 characters or less' }, { status: 400 });
		}

		// Normalize and validate orgName
		const orgName = body.orgName.trim().replace(/<[^>]*>/g, '');
		if (orgName.length < 2) {
			return json({ error: 'Organization name must be at least 2 characters' }, { status: 400 });
		}
		if (orgName.length > 100) {
			return json({ error: 'Organization name must be 100 characters or less' }, { status: 400 });
		}

		// Validate password
		if (body.password.length < 8) {
			return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
		}
		if (body.password.length > 128) {
			return json({ error: 'Password must be at most 128 characters' }, { status: 400 });
		}

		const db = new DbHelper(event.platform!.env.DB);

		const existingUser = await db.getUserByEmail(email);
		if (existingUser) {
			return json({ error: 'Email already registered' }, { status: 409 });
		}

		const passwordHash = await hashPassword(body.password);
		const user = await db.createUser(email, passwordHash, name);

		// Resolve org slug with collision handling (up to 3 retries with random suffix)
		let orgSlug = slugify(orgName);
		let org;
		try {
			const existing = await db.getOrgBySlug(orgSlug);
			if (existing) {
				let resolved = false;
				for (let i = 0; i < 3; i++) {
					const suffix = Math.random().toString(36).slice(2, 6);
					const candidate = `${orgSlug}-${suffix}`;
					const collision = await db.getOrgBySlug(candidate);
					if (!collision) {
						orgSlug = candidate;
						resolved = true;
						break;
					}
				}
				if (!resolved) {
					// Compensating delete for orphaned user
					try { await db.deleteUser(user.id); } catch (_) { /* best effort */ }
					return json({ error: 'Organization name is unavailable, please choose a different one' }, { status: 409 });
				}
			}
			org = await db.createOrganization(orgName, orgSlug);
		} catch (orgError) {
			// Org creation failed — compensating delete of orphaned user
			try { await db.deleteUser(user.id); } catch (_) { /* best effort */ }
			throw orgError;
		}

		await db.addOrgMember(user.id, org.id, 'owner');

		const sessionToken = await createSession(db, user.id);
		setSessionCookie(event.cookies, sessionToken);

		// Send verification email (24h expiry)
		const verifyToken = await db.createEmailToken(user.id, 'verify_email', 24 * 60 * 60);
		const baseUrl = new URL(event.request.url).origin;
		const settings = await db.getOrgSettings(org.id);
		const branding = buildOrgBranding(org, settings);
		await sendVerificationEmail(
			event.platform?.env.RESEND_API_KEY,
			user.email,
			user.name,
			verifyToken,
			baseUrl,
			branding,
			{ logger: db, orgId: org.id, userId: user.id }
		);

		return json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				email_verified: false
			},
			org: {
				id: org.id,
				name: org.name,
				slug: org.slug
			}
		});
	} catch (error) {
		console.error('Registration error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
