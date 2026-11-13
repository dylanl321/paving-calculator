import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type DbJobSite, type JobSiteContractMeta } from '$lib/server/db';
import { canEditProject, requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(
	value: unknown,
	label: string,
	max: number
): { ok: true; value: string | null } | { ok: false; error: string } | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === '') return { ok: true, value: null };
	if (typeof value !== 'string') return { ok: false, error: `${label} must be text` };
	const trimmed = value.trim();
	if (trimmed.length > max) return { ok: false, error: `${label} must be ${max} characters or less` };
	return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

function optionalDate(
	value: unknown,
	label: string
): { ok: true; value: string | null } | { ok: false; error: string } | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === '') return { ok: true, value: null };
	if (typeof value !== 'string' || !ISO_DATE.test(value)) {
		return { ok: false, error: `${label} must be a YYYY-MM-DD date` };
	}
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return { ok: false, error: `${label} is not a real calendar date` };
	}
	return { ok: true, value };
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		return json({
			id: jobSite.id,
			org_id: jobSite.org_id,
			name: jobSite.name,
			location_description: jobSite.location_description,
			latitude: jobSite.latitude,
			longitude: jobSite.longitude,
			location_source: jobSite.location_source,
			location_precision: jobSite.location_precision,
			gdot_county: jobSite.gdot_county,
			gdot_district: jobSite.gdot_district,
			status: jobSite.status,
			job_number: jobSite.job_number,
			project_number: jobSite.project_number,
			contract_id: jobSite.contract_id,
			work_type: jobSite.work_type,
			contract_type: jobSite.contract_type,
			contract_amount: jobSite.contract_amount,
			retainage_pct: jobSite.retainage_pct,
			est_start_date: jobSite.est_start_date,
			completion_date: jobSite.completion_date,
			customer_name: jobSite.customer_name,
			customer_address: jobSite.customer_address,
			customer_contact: jobSite.customer_contact,
			customer_phone: jobSite.customer_phone,
			customer_email: jobSite.customer_email,
			owner_name: jobSite.owner_name,
			owner_address: jobSite.owner_address,
			project_manager: jobSite.project_manager,
			asphalt_supplier: jobSite.asphalt_supplier,
			scopes_json: jobSite.scopes_json,
			created_at: jobSite.created_at,
			updated_at: jobSite.updated_at
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get job site error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface UpdateJobSiteRequest {
	name?: string;
	location_description?: string | null;
	latitude?: number | null;
	longitude?: number | null;
	status?: 'active' | 'completed' | 'archived';
	job_number?: string | null;
	project_number?: string | null;
	customer_name?: string | null;
	project_manager?: string | null;
	work_type?: string | null;
	est_start_date?: string | null;
	completion_date?: string | null;
	contract_amount?: number | null;
}

export async function PATCH(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const role = await db.getUserRole(user.id, org.id);
		if (!canEditProject(role)) {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}

		const body = (await event.request.json()) as UpdateJobSiteRequest;

		const updates: Partial<
			Pick<
				DbJobSite,
				| 'name'
				| 'location_description'
				| 'latitude'
				| 'longitude'
				| 'location_source'
				| 'location_precision'
				| 'status'
			>
		> = {};

		if (body.name !== undefined) {
			if (typeof body.name !== 'string' || body.name.trim().length === 0) {
				return json({ error: 'Project name is required' }, { status: 400 });
			}
			if (body.name.trim().length > 200) {
				return json({ error: 'Project name must be 200 characters or less' }, { status: 400 });
			}
			updates.name = body.name.trim();
		}
		if (body.location_description !== undefined) {
			const location = optionalText(body.location_description, 'Location', 500);
			if (location && !location.ok) return json({ error: location.error }, { status: 400 });
			if (location) updates.location_description = location.value;
		}
		if (body.latitude !== undefined) updates.latitude = body.latitude;
		if (body.longitude !== undefined) updates.longitude = body.longitude;
		if (body.latitude !== undefined || body.longitude !== undefined) {
			const nextLat = body.latitude !== undefined ? body.latitude : jobSite.latitude;
			const nextLng = body.longitude !== undefined ? body.longitude : jobSite.longitude;
			updates.location_source = 'manual';
			updates.location_precision = nextLat != null && nextLng != null ? 'point' : 'none';
		}
		if (body.status !== undefined) {
			if (!['active', 'completed', 'archived'].includes(body.status)) {
				return json({ error: 'Invalid status' }, { status: 400 });
			}
			updates.status = body.status;
		}

		const contract: JobSiteContractMeta = {};
		const textFields: Array<['job_number' | 'project_number' | 'customer_name' | 'project_manager' | 'work_type', unknown, string, number]> = [
			['job_number', body.job_number, 'Job number', 80],
			['project_number', body.project_number, 'Project number', 80],
			['customer_name', body.customer_name, 'Customer', 200],
			['project_manager', body.project_manager, 'Project manager', 200],
			['work_type', body.work_type, 'Work type', 120]
		];
		for (const [key, raw, label, max] of textFields) {
			if (raw === undefined) continue;
			const parsed = optionalText(raw, label, max);
			if (!parsed || !parsed.ok) {
				return json({ error: parsed?.error ?? `Invalid ${label}` }, { status: 400 });
			}
			contract[key] = parsed.value;
		}
		const start = optionalDate(body.est_start_date, 'Start date');
		if (start) {
			if (!start.ok) return json({ error: start.error }, { status: 400 });
			contract.est_start_date = start.value;
		}
		const completion = optionalDate(body.completion_date, 'Completion date');
		if (completion) {
			if (!completion.ok) return json({ error: completion.error }, { status: 400 });
			contract.completion_date = completion.value;
		}
		if (body.contract_amount !== undefined) {
			const amount = body.contract_amount as unknown;
			if (amount === null || amount === '') {
				contract.contract_amount = null;
			} else if (
				typeof body.contract_amount !== 'number' ||
				!Number.isFinite(body.contract_amount) ||
				body.contract_amount < 0 ||
				body.contract_amount > 10_000_000_000
			) {
				return json({ error: 'Contract amount must be a non-negative number' }, { status: 400 });
			} else {
				contract.contract_amount = body.contract_amount;
			}
		}

		await db.updateJobSite(jobSiteId, updates);
		if (Object.keys(contract).length > 0) {
			await db.setJobSiteContractMeta(jobSiteId, contract);
		}

		const updatedJobSite = await db.getJobSiteById(jobSiteId);

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'job_site',
			resourceId: jobSiteId,
			action: 'updated',
			oldValue: {
				name: jobSite.name,
				location_description: jobSite.location_description,
				status: jobSite.status
			},
			newValue: {
				name: updatedJobSite!.name,
				location_description: updatedJobSite!.location_description,
				status: updatedJobSite!.status
			},
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({
			id: updatedJobSite!.id,
			org_id: updatedJobSite!.org_id,
			name: updatedJobSite!.name,
			location_description: updatedJobSite!.location_description,
			latitude: updatedJobSite!.latitude,
			longitude: updatedJobSite!.longitude,
			location_source: updatedJobSite!.location_source,
			location_precision: updatedJobSite!.location_precision,
			gdot_county: updatedJobSite!.gdot_county,
			gdot_district: updatedJobSite!.gdot_district,
			status: updatedJobSite!.status,
			job_number: updatedJobSite!.job_number,
			project_number: updatedJobSite!.project_number,
			work_type: updatedJobSite!.work_type,
			contract_amount: updatedJobSite!.contract_amount,
			est_start_date: updatedJobSite!.est_start_date,
			completion_date: updatedJobSite!.completion_date,
			customer_name: updatedJobSite!.customer_name,
			project_manager: updatedJobSite!.project_manager,
			created_at: updatedJobSite!.created_at,
			updated_at: updatedJobSite!.updated_at
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Update job site error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
