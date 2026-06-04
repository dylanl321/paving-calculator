import type { D1Database } from '../../cloudflare';

interface AuditEvent {
	user_id?: string;
	org_id?: string;
	event_type: string;
	ip_address?: string;
	user_agent?: string;
	metadata?: Record<string, unknown>;
}

export async function logAuditEvent(db: D1Database, event: AuditEvent): Promise<void> {
	const id = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const metadataJson = event.metadata ? JSON.stringify(event.metadata) : null;

	await db
		.prepare(
			`INSERT INTO admin_audit_log (id, user_id, org_id, event_type, ip_address, user_agent, metadata, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			event.user_id ?? null,
			event.org_id ?? null,
			event.event_type,
			event.ip_address ?? null,
			event.user_agent ?? null,
			metadataJson,
			now
		)
		.run();
}
