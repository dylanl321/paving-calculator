import type { RequestEvent } from '@sveltejs/kit';
import { DbHelper, type DbUser } from './db';

const SESSION_COOKIE = 'paverate_session';
const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	isGlobalAdmin?: boolean;
	disabled?: boolean;
}

export async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);
	const salt = crypto.randomUUID();
	const saltedData = encoder.encode(salt + password);

	const keyMaterial = await crypto.subtle.importKey('raw', saltedData, 'PBKDF2', false, [
		'deriveBits'
	]);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: encoder.encode(salt),
			iterations: 100000,
			hash: 'SHA-256'
		},
		keyMaterial,
		256
	);

	const hashArray = Array.from(new Uint8Array(derivedBits));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return `${salt}:${hashHex}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	const [salt, storedHash] = hash.split(':');
	if (!salt || !storedHash) return false;

	const encoder = new TextEncoder();
	const saltedData = encoder.encode(salt + password);

	const keyMaterial = await crypto.subtle.importKey('raw', saltedData, 'PBKDF2', false, [
		'deriveBits'
	]);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: encoder.encode(salt),
			iterations: 100000,
			hash: 'SHA-256'
		},
		keyMaterial,
		256
	);

	const hashArray = Array.from(new Uint8Array(derivedBits));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return hashHex === storedHash;
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export async function createSession(db: DbHelper, userId: string): Promise<string> {
	const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
	return await db.createSession(userId, expiresAt);
}

export function setSessionCookie(cookies: RequestEvent['cookies'], token: string): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: SESSION_DURATION_SECONDS
	});
}

export function clearSessionCookie(cookies: RequestEvent['cookies']): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function getAuthUser(event: RequestEvent): Promise<AuthUser | null> {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) return null;

	if (!event.platform?.env?.DB) return null;

	const db = new DbHelper(event.platform.env.DB);

	const session = await db.getSession(token);
	if (!session) return null;

	const now = Math.floor(Date.now() / 1000);
	if (session.expires_at < now) {
		await db.deleteSession(token);
		return null;
	}

	const user = await db.getUserById(session.user_id);
	if (!user) return null;

	if (user.disabled) {
		await db.deleteSession(token);
		return null;
	}

	// Auto-promote super admin from env allowlist
	const superEmails = event.platform.env.SUPER_ADMIN_EMAILS;
	if (superEmails && !user.is_global_admin) {
		const allowed = superEmails.split(',').map((e) => e.trim().toLowerCase());
		if (allowed.includes(user.email.toLowerCase())) {
			await db.updateUser(user.id, { is_global_admin: true });
			// reflect in this response
			return {
				id: user.id,
				email: user.email,
				name: user.name,
				isGlobalAdmin: true,
				disabled: user.disabled
			};
		}
	}

	return {
		id: user.id,
		email: user.email,
		name: user.name,
		isGlobalAdmin: user.is_global_admin,
		disabled: user.disabled
	};
}

export async function requireAuth(event: RequestEvent): Promise<AuthUser> {
	const user = await getAuthUser(event);
	if (!user) {
		throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	return user;
}

export async function requireGlobalAdmin(event: RequestEvent): Promise<AuthUser> {
	const user = await requireAuth(event);
	if (!user.isGlobalAdmin) {
		throw new Response(JSON.stringify({ error: 'Forbidden: Global admin access required' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	return user;
}

export async function requireOrgRole(
	event: RequestEvent,
	orgId: string,
	allowedRoles: Array<'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer' | 'screed_man'>
): Promise<{ user: AuthUser; role: string }> {
	const user = await requireAuth(event);
	if (!event.platform?.env?.DB) {
		throw new Response(JSON.stringify({ error: 'Database not available' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	const db = new DbHelper(event.platform.env.DB);
	const role = await db.getUserRole(user.id, orgId);

	if (!role || !allowedRoles.includes(role as 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer' | 'screed_man')) {
		throw new Response(JSON.stringify({ error: 'Forbidden: Insufficient permissions' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return { user, role };
}

// Roles that can manage crews and job sites (admin level+)
export const ADMIN_ROLES = ['owner', 'admin'] as const;

// Roles that have field-level access (foreman and below)
export const FIELD_ROLES = ['foreman', 'operator', 'inspector', 'office', 'laborer', 'screed_man', 'member'] as const;

// Laborer: can only log loads and run calcs (no management)
export const LABORER_ROLES = ['laborer'] as const;

// Helper: can this role manage crews/job-sites?
export function canManage(role: string): boolean {
	return role === 'owner' || role === 'admin';
}

// Helper: is this a foreman who has crew-scoped access?
export function isForeman(role: string): boolean {
	return role === 'foreman';
}

// Helper: is this a laborer (logging + calc only)?
export function isLaborer(role: string): boolean {
	return role === 'laborer';
}

// Helper: is this a screed man (calculator-only, simplified view)?
export function isScreedMan(role: string): boolean {
	return role === 'screed_man';
}

