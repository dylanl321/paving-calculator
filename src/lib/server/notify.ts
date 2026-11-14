import type { D1Database } from '../../cloudflare';

export type NoticeType =
	| 'daily_log_submitted'
	| 'low_tonnage'
	| 'document_review'
	| 'crew_assigned';

export interface OutboundNotice {
	to: string;
	userId: string;
	role: string;
	subject: string;
	text: string;
	eventType: NoticeType;
}

export interface MailSender {
	send(message: OutboundNotice): Promise<void>;
}

/** Does not call Resend or any network. Tests pass their own sender. */
export const quietSender: MailSender = {
	async send() {
		return;
	}
};

const ROLE_FOR: Record<NoticeType, Set<string>> = {
	daily_log_submitted: new Set(['owner', 'admin', 'office']),
	low_tonnage: new Set(['owner', 'admin', 'office', 'foreman']),
	document_review: new Set(['owner', 'admin', 'office']),
	crew_assigned: new Set(['owner', 'admin', 'foreman', 'operator', 'laborer', 'screed_man', 'member'])
};

const PREF_FOR: Record<NoticeType, string> = {
	daily_log_submitted: 'email_daily_summary',
	low_tonnage: 'email_job_updates',
	document_review: 'email_document_review',
	crew_assigned: 'email_crew_assigned'
};

interface MemberRow {
	user_id: string;
	email: string;
	role: string;
}

/**
 * Choose recipients and record the dispatch once.
 * A missing preference counts as on, so a new account hears operational mail
 * until they turn it off. Returns an empty list when this event_key was already sent.
 */
export async function notifyOrg(
	db: D1Database,
	input: {
		orgId: string;
		eventKey: string;
		eventType: NoticeType;
		subject: string;
		text: string;
		/** When set, only these user ids are eligible (for example a crew). */
		onlyUserIds?: string[];
	},
	sender: MailSender
): Promise<{ sent: OutboundNotice[]; skipped: 'duplicate' | null }> {
	const existing = await db
		.prepare('SELECT event_key FROM notification_dispatches WHERE event_key = ?')
		.bind(input.eventKey)
		.first<{ event_key: string }>();
	if (existing) return { sent: [], skipped: 'duplicate' };

	const members = await db
		.prepare(
			`SELECT om.user_id, u.email, om.role
			 FROM org_members om
			 JOIN users u ON u.id = om.user_id
			 WHERE om.org_id = ?`
		)
		.bind(input.orgId)
		.all<MemberRow>()
		.then((r) => r.results ?? []);

	let prefRows: Array<{ user_id: string; enabled: number }> = [];
	if (members.length > 0) {
		prefRows = await db
			.prepare(
				`SELECT user_id, enabled FROM user_notification_prefs
				 WHERE pref_key = ? AND user_id IN (${members.map(() => '?').join(', ')})`
			)
			.bind(PREF_FOR[input.eventType], ...members.map((m) => m.user_id))
			.all<{ user_id: string; enabled: number }>()
			.then((r) => r.results ?? []);
	}

	const prefByUser = new Map(prefRows.map((row) => [row.user_id, row.enabled]));
	const only = input.onlyUserIds ? new Set(input.onlyUserIds) : null;
	const roles = ROLE_FOR[input.eventType];
	const sent: OutboundNotice[] = [];

	for (const member of members) {
		if (!roles.has(member.role)) continue;
		if (only && !only.has(member.user_id)) continue;
		const pref = prefByUser.get(member.user_id);
		if (pref === 0) continue;
		sent.push({
			to: member.email,
			userId: member.user_id,
			role: member.role,
			subject: input.subject,
			text: input.text,
			eventType: input.eventType
		});
	}

	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare(
			`INSERT INTO notification_dispatches (event_key, org_id, event_type, payload, created_at)
			 VALUES (?, ?, ?, ?, ?)`
		)
		.bind(input.eventKey, input.orgId, input.eventType, JSON.stringify({ subject: input.subject, to: sent.map((m) => m.to) }), now)
		.run();

	for (const message of sent) {
		await sender.send(message);
	}
	return { sent, skipped: null };
}
