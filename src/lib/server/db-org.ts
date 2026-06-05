import type { D1Database } from '../../cloudflare';
import { toHex } from '$lib/utils/format';

export interface DbOrganization {
	id: string;
	name: string;
	slug: string;
	address?: string | null;
	superintendent_email?: string | null;
	superintendent_phone?: string | null;
	archived_at?: number | null;
	created_at: number;
}

export interface DbOrgMember {
	user_id: string;
	org_id: string;
	role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer' | 'screed_man';
	invited_at: number;
	accepted_at: number | null;
}

export interface DbOrgSettings {
	org_id: string;
	accent_color: string | null;
	logo_key: string | null;
	logo_content_type: string | null;
	overrides: string | null;
	email_from_name: string | null;
	email_reply_to: string | null;
	report_recipients: string | null;
	equipment_templates: string | null;
	updated_by: string | null;
	updated_at: number;
}

export interface DbInvitation {
	id: string;
	org_id: string;
	email: string;
	role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer' | 'screed_man';
	token: string;
	invited_by: string;
	created_at: number;
	accepted_at: number | null;
	expires_at: number;
}

export type OrgRole =
	| 'owner'
	| 'admin'
	| 'member'
	| 'foreman'
	| 'operator'
	| 'inspector'
	| 'office'
	| 'laborer'
	| 'screed_man';

export class DbOrgHelper {
	constructor(private db: D1Database) {}

	// ── Organization CRUD ──────────────────────────────────────────────────

	async createOrganization(name: string, slug: string): Promise<DbOrganization> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare('INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
			.bind(id, name, slug, now)
			.run();

		return { id, name, slug, created_at: now };
	}

	async getOrgById(id: string): Promise<DbOrganization | null> {
		return await this.db
			.prepare('SELECT * FROM organizations WHERE id = ?')
			.bind(id)
			.first<DbOrganization>();
	}

	async getOrganizationById(id: string): Promise<DbOrganization | null> {
		return this.getOrgById(id);
	}

	async getOrgBySlug(slug: string): Promise<DbOrganization | null> {
		return await this.db
			.prepare('SELECT * FROM organizations WHERE slug = ?')
			.bind(slug)
			.first<DbOrganization>();
	}

	async getOrgByUserId(userId: string): Promise<DbOrganization | null> {
		return await this.db
			.prepare(
				`SELECT o.* FROM organizations o
				JOIN org_members om ON om.org_id = o.id
				WHERE om.user_id = ?
				LIMIT 1`
			)
			.bind(userId)
			.first<DbOrganization>();
	}

	async getAllOrganizations(): Promise<Array<DbOrganization & { member_count: number }>> {
		return await this.db
			.prepare(
				`SELECT o.*, COUNT(om.user_id) as member_count
				FROM organizations o
				LEFT JOIN org_members om ON om.org_id = o.id
				GROUP BY o.id
				ORDER BY o.created_at DESC`
			)
			.all<DbOrganization & { member_count: number }>()
			.then((r) => r.results);
	}

	async getRecentOrganizations(
		limit = 5
	): Promise<Array<DbOrganization & { member_count: number }>> {
		return await this.db
			.prepare(
				`SELECT o.*, COUNT(om.user_id) as member_count
				FROM organizations o
				LEFT JOIN org_members om ON om.org_id = o.id
				GROUP BY o.id
				ORDER BY o.created_at DESC
				LIMIT ?`
			)
			.bind(limit)
			.all<DbOrganization & { member_count: number }>()
			.then((r) => r.results);
	}

	async getOrgsNeedingAttention(): Promise<
		Array<DbOrganization & { member_count: number; owner_count: number }>
	> {
		return await this.db
			.prepare(
				`SELECT o.*,
					COUNT(om.user_id) as member_count,
					SUM(CASE WHEN om.role = 'owner' THEN 1 ELSE 0 END) as owner_count
				FROM organizations o
				LEFT JOIN org_members om ON om.org_id = o.id
				GROUP BY o.id
				HAVING member_count = 0 OR owner_count = 0
				ORDER BY o.created_at DESC`
			)
			.all<DbOrganization & { member_count: number; owner_count: number }>()
			.then((r) => r.results);
	}

	async updateOrganization(
		id: string,
		updates: {
			name?: string;
			slug?: string;
			address?: string;
			superintendentEmail?: string;
			superintendentPhone?: string;
		}
	): Promise<void> {
		const fields: string[] = [];
		const values: string[] = [];

		if (updates.name !== undefined) {
			fields.push('name = ?');
			values.push(updates.name);
		}
		if (updates.slug !== undefined) {
			fields.push('slug = ?');
			values.push(updates.slug);
		}
		if (updates.address !== undefined) {
			fields.push('address = ?');
			values.push(updates.address);
		}
		if (updates.superintendentEmail !== undefined) {
			fields.push('superintendent_email = ?');
			values.push(updates.superintendentEmail);
		}
		if (updates.superintendentPhone !== undefined) {
			fields.push('superintendent_phone = ?');
			values.push(updates.superintendentPhone);
		}

		if (fields.length === 0) return;
		values.push(id);

		await this.db
			.prepare(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async setOrganizationArchived(id: string, archived: boolean): Promise<void> {
		const value = archived ? Math.floor(Date.now() / 1000) : null;
		await this.db
			.prepare('UPDATE organizations SET archived_at = ? WHERE id = ?')
			.bind(value, id)
			.run();
	}

	// ── Members ───────────────────────────────────────────────────────────

	async addOrgMember(userId: string, orgId: string, role: OrgRole): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				'INSERT INTO org_members (user_id, org_id, role, invited_at, accepted_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(userId, orgId, role, now, now)
			.run();
	}

	async getOrgMembersByOrgId(
		orgId: string
	): Promise<Array<DbOrgMember & { user_name: string; user_email: string }>> {
		return await this.db
			.prepare(
				`SELECT om.*, u.name as user_name, u.email as user_email
				FROM org_members om
				JOIN users u ON u.id = om.user_id
				WHERE om.org_id = ?
				ORDER BY om.invited_at DESC`
			)
			.bind(orgId)
			.all<DbOrgMember & { user_name: string; user_email: string }>()
			.then((r) => r.results);
	}

	async getUserRole(userId: string, orgId: string): Promise<string | null> {
		const result = await this.db
			.prepare('SELECT role FROM org_members WHERE user_id = ? AND org_id = ?')
			.bind(userId, orgId)
			.first<{ role: string }>();
		return result?.role || null;
	}

	async getUserMember(
		userId: string,
		orgId: string
	): Promise<{ role: string; preferred_view: string | null; preferred_units: string | null } | null> {
		return this.db
			.prepare('SELECT role, preferred_view, preferred_units FROM org_members WHERE user_id = ? AND org_id = ?')
			.bind(userId, orgId)
			.first<{ role: string; preferred_view: string | null; preferred_units: string | null }>();
	}

	async getUserMemberships(
		userId: string
	): Promise<
		Array<{
			org_id: string;
			org_name: string;
			role: string;
			invited_at: number;
			accepted_at: number | null;
		}>
	> {
		return await this.db
			.prepare(
				`SELECT om.org_id, o.name as org_name, om.role, om.invited_at, om.accepted_at
				FROM org_members om
				JOIN organizations o ON o.id = om.org_id
				WHERE om.user_id = ?
				ORDER BY om.invited_at ASC`
			)
			.bind(userId)
			.all<{
				org_id: string;
				org_name: string;
				role: string;
				invited_at: number;
				accepted_at: number | null;
			}>()
			.then((r) => r.results);
	}

	async removeOrgMember(userId: string, orgId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM org_members WHERE user_id = ? AND org_id = ?')
			.bind(userId, orgId)
			.run();
	}

	async updateOrgMemberRole(userId: string, orgId: string, role: OrgRole): Promise<void> {
		await this.db
			.prepare('UPDATE org_members SET role = ? WHERE user_id = ? AND org_id = ?')
			.bind(role, userId, orgId)
			.run();
	}

	// ── Settings ──────────────────────────────────────────────────────────

	async getOrgSettings(orgId: string): Promise<DbOrgSettings | null> {
		return await this.db
			.prepare('SELECT * FROM org_settings WHERE org_id = ?')
			.bind(orgId)
			.first<DbOrgSettings>();
	}

	async upsertOrgSettings(
		orgId: string,
		updates: {
			accentColor?: string | null;
			logoKey?: string | null;
			logoContentType?: string | null;
			overrides?: string | null;
			emailFromName?: string | null;
			emailReplyTo?: string | null;
			reportRecipients?: string | null;
			updatedBy?: string | null;
		}
	): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		const existing = await this.getOrgSettings(orgId);

		if (!existing) {
			await this.db
				.prepare(
					`INSERT INTO org_settings (org_id, accent_color, logo_key, logo_content_type, overrides, email_from_name, email_reply_to, report_recipients, updated_by, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					orgId,
					updates.accentColor ?? null,
					updates.logoKey ?? null,
					updates.logoContentType ?? null,
					updates.overrides ?? null,
					updates.emailFromName ?? null,
					updates.emailReplyTo ?? null,
					updates.reportRecipients ?? null,
					updates.updatedBy ?? null,
					now
				)
				.run();
			return;
		}

		const fields: string[] = [];
		const values: (string | number | null)[] = [];

		if (updates.accentColor !== undefined) {
			fields.push('accent_color = ?');
			values.push(updates.accentColor);
		}
		if (updates.logoKey !== undefined) {
			fields.push('logo_key = ?');
			values.push(updates.logoKey);
		}
		if (updates.logoContentType !== undefined) {
			fields.push('logo_content_type = ?');
			values.push(updates.logoContentType);
		}
		if (updates.overrides !== undefined) {
			fields.push('overrides = ?');
			values.push(updates.overrides);
		}
		if (updates.emailFromName !== undefined) {
			fields.push('email_from_name = ?');
			values.push(updates.emailFromName);
		}
		if (updates.emailReplyTo !== undefined) {
			fields.push('email_reply_to = ?');
			values.push(updates.emailReplyTo);
		}
		if (updates.reportRecipients !== undefined) {
			fields.push('report_recipients = ?');
			values.push(updates.reportRecipients);
		}
		if (updates.updatedBy !== undefined) {
			fields.push('updated_by = ?');
			values.push(updates.updatedBy);
		}

		fields.push('updated_at = ?');
		values.push(now);
		values.push(orgId);

		await this.db
			.prepare(`UPDATE org_settings SET ${fields.join(', ')} WHERE org_id = ?`)
			.bind(...values)
			.run();
	}

	// ── Invitations ───────────────────────────────────────────────────────

	async createInvitation(
		orgId: string,
		email: string,
		role: OrgRole,
		invitedBy: string
	): Promise<DbInvitation> {
		const id = crypto.randomUUID();
		const tokenBytes = new Uint8Array(32);
		crypto.getRandomValues(tokenBytes);
		const token = toHex(tokenBytes);
		const now = Math.floor(Date.now() / 1000);
		const expiresAt = now + 7 * 24 * 60 * 60; // 7 days

		await this.db
			.prepare(
				'INSERT INTO invitations (id, org_id, email, role, token, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(id, orgId, email, role, token, invitedBy, now, expiresAt)
			.run();

		return {
			id,
			org_id: orgId,
			email,
			role,
			token,
			invited_by: invitedBy,
			created_at: now,
			accepted_at: null,
			expires_at: expiresAt
		};
	}

	async getInvitationsByOrgId(
		orgId: string
	): Promise<Array<DbInvitation & { invited_by_name: string }>> {
		return await this.db
			.prepare(
				`SELECT i.*, u.name as invited_by_name
				FROM invitations i
				JOIN users u ON u.id = i.invited_by
				WHERE i.org_id = ? AND i.accepted_at IS NULL
				ORDER BY i.created_at DESC`
			)
			.bind(orgId)
			.all<DbInvitation & { invited_by_name: string }>()
			.then((r) => r.results);
	}

	async getInvitationByToken(token: string): Promise<DbInvitation | null> {
		return await this.db
			.prepare('SELECT * FROM invitations WHERE token = ?')
			.bind(token)
			.first<DbInvitation>();
	}

	async getInvitationById(id: string): Promise<DbInvitation | null> {
		return await this.db
			.prepare('SELECT * FROM invitations WHERE id = ?')
			.bind(id)
			.first<DbInvitation>();
	}

	async getInvitationByEmail(orgId: string, email: string): Promise<DbInvitation | null> {
		return await this.db
			.prepare(
				'SELECT * FROM invitations WHERE org_id = ? AND email = ? COLLATE NOCASE AND accepted_at IS NULL'
			)
			.bind(orgId, email)
			.first<DbInvitation>();
	}

	async acceptInvitation(token: string): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('UPDATE invitations SET accepted_at = ? WHERE token = ?')
			.bind(now, token)
			.run();
	}

	async deleteInvitation(id: string): Promise<void> {
		await this.db.prepare('DELETE FROM invitations WHERE id = ?').bind(id).run();
	}

	async cleanExpiredInvitations(): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare('DELETE FROM invitations WHERE expires_at < ? AND accepted_at IS NULL')
			.bind(now)
			.run();
	}

	// ── Admin Stats ───────────────────────────────────────────────────────

	async getAdminStats(): Promise<{
		totalOrgs: number;
		totalUsers: number;
		activeUsers: number;
		disabledUsers: number;
		unverifiedUsers: number;
		globalAdmins: number;
		totalJobSites: number;
		failedEmails: number;
	}> {
		const [orgs, users, jobSites, failed] = await Promise.all([
			this.db.prepare('SELECT COUNT(*) as c FROM organizations').first<{ c: number }>(),
			this.db
				.prepare(
					`SELECT
						COUNT(*) as total,
						SUM(CASE WHEN disabled = 1 THEN 1 ELSE 0 END) as disabled,
						SUM(CASE WHEN email_verified = 0 THEN 1 ELSE 0 END) as unverified,
						SUM(CASE WHEN is_global_admin = 1 THEN 1 ELSE 0 END) as admins
					FROM users`
				)
				.first<{ total: number; disabled: number; unverified: number; admins: number }>(),
			this.db
				.prepare('SELECT COUNT(*) as c FROM job_sites')
				.first<{ c: number }>()
				.catch(() => null),
			this.db
				.prepare("SELECT COUNT(*) as c FROM email_log WHERE status != 'sent'")
				.first<{ c: number }>()
				.catch(() => null)
		]);

		const totalUsers = users?.total ?? 0;
		const disabledUsers = users?.disabled ?? 0;
		return {
			totalOrgs: orgs?.c ?? 0,
			totalUsers,
			activeUsers: totalUsers - disabledUsers,
			disabledUsers,
			unverifiedUsers: users?.unverified ?? 0,
			globalAdmins: users?.admins ?? 0,
			totalJobSites: jobSites?.c ?? 0,
			failedEmails: failed?.c ?? 0
		};
	}

	// ── Equipment Templates ───────────────────────────────────────────────

	async getEquipmentTemplates(orgId: string): Promise<EquipmentTemplate[]> {
		const settings = await this.getOrgSettings(orgId);
		if (!settings || !settings.equipment_templates) {
			return [];
		}
		try {
			const parsed = JSON.parse(settings.equipment_templates);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	async upsertEquipmentTemplates(orgId: string, templates: EquipmentTemplate[]): Promise<void> {
		const serialized = JSON.stringify(templates);
		const now = Math.floor(Date.now() / 1000);
		const existing = await this.getOrgSettings(orgId);

		if (!existing) {
			await this.db
				.prepare(
					`INSERT INTO org_settings (org_id, equipment_templates, updated_at)
					VALUES (?, ?, ?)`
				)
				.bind(orgId, serialized, now)
				.run();
		} else {
			await this.db
				.prepare('UPDATE org_settings SET equipment_templates = ?, updated_at = ? WHERE org_id = ?')
				.bind(serialized, now, orgId)
				.run();
		}
	}
}

export interface EquipmentTemplate {
	id: string;
	name: string;
	items: Array<{
		equipment_type: string;
		name: string;
		capacity: string | null;
		notes: string | null;
	}>;
	created_at: number;
}
