import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth, requireOrgRole } from '$lib/server/auth';
import { validateOverrides, type OrgOverrides } from '$lib/config/overrides';
import { recordAudit } from '$lib/server/audit';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseOverrides(raw: string | null): OrgOverrides {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as OrgOverrides;
	} catch {
		return {};
	}
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);
		const settings = await db.getOrgSettings(org.id);

		return json({
			org: { id: org.id, name: org.name, slug: org.slug },
			role,
			accentColor: settings?.accent_color ?? null,
			hasLogo: !!settings?.logo_key,
			emailFromName: settings?.email_from_name ?? null,
			emailReplyTo: settings?.email_reply_to ?? null,
			overrides: parseOverrides(settings?.overrides ?? null),
			updatedAt: settings?.updated_at ?? null
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get org settings error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function PUT(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		// Owner/admin only. requireOrgRole throws a 403 Response otherwise.
		await requireOrgRole(event, org.id, ['owner', 'admin']);

		const body = await event.request.json();

		const update: {
			accentColor?: string | null;
			emailFromName?: string | null;
			emailReplyTo?: string | null;
			overrides?: string | null;
			updatedBy: string;
		} = {
			updatedBy: user.id
		};

		if ('accentColor' in body) {
			const ac = body.accentColor;
			if (ac === null || ac === '') {
				update.accentColor = null;
			} else if (typeof ac === 'string' && HEX_COLOR.test(ac)) {
				update.accentColor = ac;
			} else {
				return json({ error: 'accentColor must be a hex color like #f2c037' }, { status: 400 });
			}
		}

		if ('emailFromName' in body) {
			const efn = body.emailFromName;
			if (efn === null || efn === '') {
				update.emailFromName = null;
			} else if (typeof efn === 'string') {
				const cleaned = efn.replace(/<[^>]*>/g, '').trim();
				if (cleaned.length > 100) {
					return json({ error: 'emailFromName must be 100 characters or less' }, { status: 400 });
				}
				update.emailFromName = cleaned;
			} else {
				return json({ error: 'emailFromName must be a string' }, { status: 400 });
			}
		}

		if ('emailReplyTo' in body) {
			const ert = body.emailReplyTo;
			if (ert === null || ert === '') {
				update.emailReplyTo = null;
			} else if (typeof ert === 'string') {
				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				if (!emailRegex.test(ert)) {
					return json({ error: 'emailReplyTo must be a valid email address' }, { status: 400 });
				}
				update.emailReplyTo = ert;
			} else {
				return json({ error: 'emailReplyTo must be a string' }, { status: 400 });
			}
		}

		if ('overrides' in body) {
			const result = validateOverrides(body.overrides);
			if (!result.ok) {
				return json({ error: result.error }, { status: 400 });
			}
			update.overrides = JSON.stringify(result.cleaned ?? {});
		}

		// Optional org name change (owner/admin), reuses existing helper.
		if ('name' in body && typeof body.name === 'string' && body.name.trim()) {
			await db.updateOrganization(org.id, { name: body.name.trim() });
		}

		await db.upsertOrgSettings(org.id, update);

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name || user.email,
			orgId: org.id,
			resourceType: 'settings',
			resourceId: org.id,
			action: 'updated',
			newValue: update,
			ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent')
		});

		const settings = await db.getOrgSettings(org.id);
		const updatedOrg = await db.getOrganizationById(org.id);

		return json({
			org: { id: org.id, name: updatedOrg?.name ?? org.name, slug: org.slug },
			accentColor: settings?.accent_color ?? null,
			hasLogo: !!settings?.logo_key,
			emailFromName: settings?.email_from_name ?? null,
			emailReplyTo: settings?.email_reply_to ?? null,
			overrides: parseOverrides(settings?.overrides ?? null),
			updatedAt: settings?.updated_at ?? null
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Update org settings error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
