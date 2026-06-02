import type { D1Database } from '../../cloudflare';

export interface AuditEntry {
	actorUserId?: string;
	actorName?: string;
	orgId: string;
	resourceType: string;
	resourceId: string;
	action: string;
	oldValue?: unknown;
	newValue?: unknown;
	ipAddress?: string;
	userAgent?: string;
}

export async function recordAudit(db: D1Database, entry: AuditEntry): Promise<void> {
	try {
		const id = Array.from(crypto.getRandomValues(new Uint8Array(16)))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

		await db
			.prepare(
				`INSERT INTO audit_log (
				id, actor_user_id, actor_name, org_id, resource_type, resource_id,
				action, old_value, new_value, ip_address, user_agent
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				entry.actorUserId || null,
				entry.actorName || null,
				entry.orgId,
				entry.resourceType,
				entry.resourceId,
				entry.action,
				entry.oldValue ? JSON.stringify(entry.oldValue) : null,
				entry.newValue ? JSON.stringify(entry.newValue) : null,
				entry.ipAddress || null,
				entry.userAgent || null
			)
			.run();
	} catch (error) {
		console.error('Failed to record audit log:', error);
	}
}
