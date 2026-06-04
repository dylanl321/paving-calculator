import type { D1Database } from '../../cloudflare';
import { toHex } from '$lib/utils/format';
import type { DbUser, DbSession } from './db';

export class DbAuthHelper {
	constructor(private db: D1Database) {}

	async getUserByEmail(email: string): Promise<DbUser | null> {
		return await this.db
			.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
			.bind(email)
			.first<DbUser>();
	}

	async getUserById(id: string): Promise<DbUser | null> {
		return await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
	}

	async createUser(email: string, passwordHash: string, name: string): Promise<DbUser> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				'INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(id, email, passwordHash, name, now, now)
			.run();

		return {
			id,
			email,
			password_hash: passwordHash,
			name,
			is_global_admin: false,
			disabled: false,
			email_verified: false,
			phone: null,
			created_at: now,
			updated_at: now,
			last_login_at: null,
			last_login_ip: null
		};
	}

	async createSession(userId: string, expiresAt: number): Promise<string> {
		const tokenBytes = new Uint8Array(32);
		crypto.getRandomValues(tokenBytes);
		const token = toHex(tokenBytes);
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
			.bind(token, userId, expiresAt, now)
			.run();

		return token;
	}

	async getSession(token: string): Promise<DbSession | null> {
		return await this.db
			.prepare('SELECT * FROM sessions WHERE id = ?')
			.bind(token)
			.first<DbSession>();
	}

	async deleteSession(token: string): Promise<void> {
		await this.db.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
	}

	async deleteSessionsByUserId(userId: string): Promise<void> {
		await this.db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
	}

	async getSessionsByUserId(userId: string): Promise<DbSession[]> {
		return await this.db
			.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
			.bind(userId)
			.all<DbSession>()
			.then((r) => r.results);
	}

	async cleanExpiredSessions(): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
	}

	async setEmailVerified(id: string, verified = true): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE users SET email_verified = ?, updated_at = ? WHERE id = ?')
			.bind(verified ? 1 : 0, now, id)
			.run();
	}

	async updatePassword(userId: string, passwordHash: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
			.bind(passwordHash, now, userId)
			.run();
	}

	async createEmailToken(
		userId: string,
		type: string,
		expiresInSeconds: number
	): Promise<string> {
		const token = crypto.randomUUID();
		const id = crypto.randomUUID();
		const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
		await this.db
			.prepare(
				'INSERT INTO email_tokens (id, user_id, type, token, expires_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(id, userId, type, token, expiresAt)
			.run();
		return token;
	}

	async getEmailToken(
		token: string,
		type: string
	): Promise<{ user_id: string; expires_at: number; used_at: number | null } | null> {
		return await this.db
			.prepare('SELECT user_id, expires_at, used_at FROM email_tokens WHERE token = ? AND type = ?')
			.bind(token, type)
			.first<{ user_id: string; expires_at: number; used_at: number | null }>();
	}

	async markEmailTokenUsed(token: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE email_tokens SET used_at = ? WHERE token = ?')
			.bind(now, token)
			.run();
	}
}
