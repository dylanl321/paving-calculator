import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type JobSiteContractMeta, type DbJobSiteConfig } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { deliverWebhook } from '$lib/server/webhooks';
import type { ParsedGdotJob } from '$lib/server/pdf/parse-gdot';

interface FromImportRequest {
	parsed: ParsedGdotJob;
	source_keys?: string[];
}

// Maps a derived scope tag to the legacy single scope_of_work enum where one
// exists, so the primary scope stays backward-compatible.
const SCOPE_TO_ENUM: Record<string, DbJobSiteConfig['scope_of_work']> = {
	milling: 'mill_and_fill',
	resurfacing: 'overlay',
	leveling: 'leveling',
	patching: 'patching',
	shoulder_rehab: 'widening'
};

function num(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
	if (v == null) return null;
	const s = String(v).trim();
	return s === '' ? null : s;
}

function isAsphaltMix(name: string): boolean {
	// Asphalt mixes are measured in tons and carry mix-like names; patching is
	// asphalt but its takeoff is small. We sum every TN mix takeoff for tonnage.
	return /OGI|SUPERPAVE|9\.5|12\.5|19|25|MM|RECYC|ASPH|LEVELING|PATCH/i.test(name);
}

/**
 * POST /api/job-sites/from-import
 * Creates a job site from a reviewed PDF-import object: job row, contract
 * metadata + scopes, paving config (primary scope/mix/tonnage), bid items
 * (with alternate/selected flags) and production mixes.
 */
export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const body = (await event.request.json()) as FromImportRequest;
		const parsed = body.parsed;
		if (!parsed) {
			return json({ error: 'Missing parsed data' }, { status: 400 });
		}

		const name = str(parsed.name);
		if (!name) {
			return json({ error: 'Job site name is required' }, { status: 400 });
		}

		const jobSite = await db.createJobSite(
			org.id,
			name,
			str(parsed.location_description),
			null,
			null
		);

		const scopes = Array.isArray(parsed.scopes) ? parsed.scopes.filter(Boolean) : [];

		// Contract / customer metadata + scopes.
		const meta: JobSiteContractMeta = {
			job_number: str(parsed.job_number),
			project_number: str(parsed.project_number),
			contract_id: str(parsed.contract_id),
			work_type: str(parsed.work_type),
			contract_type: str(parsed.contract_type),
			contract_amount: num(parsed.contract_amount),
			retainage_pct: num(parsed.retainage_pct),
			est_start_date: str(parsed.est_start_date),
			completion_date: str(parsed.completion_date),
			customer_name: str(parsed.customer_name),
			customer_address: str(parsed.customer_address),
			customer_contact: str(parsed.customer_contact),
			customer_phone: str(parsed.customer_phone),
			customer_email: str(parsed.customer_email),
			owner_name: str(parsed.owner_name),
			owner_address: str(parsed.owner_address),
			project_manager: str(parsed.project_manager),
			asphalt_supplier: str(parsed.asphalt_supplier),
			import_source_key: body.source_keys?.[0] ?? null,
			scopes_json: scopes.length ? JSON.stringify(scopes) : null
		};
		if (Object.values(meta).some((v) => v !== null)) {
			await db.setJobSiteContractMeta(jobSite.id, meta);
		}

		// Production mixes (insert first so we can derive primary mix + tonnage).
		const mixes = Array.isArray(parsed.production_mixes) ? parsed.production_mixes : [];
		const asphaltMixes = mixes.filter((m) => isAsphaltMix(m.mix_name));
		const primaryMix = asphaltMixes
			.slice()
			.sort((a, b) => (num(b.takeoff_tonnage) ?? 0) - (num(a.takeoff_tonnage) ?? 0))[0];
		const totalTonnage = asphaltMixes.reduce((sum, m) => sum + (num(m.takeoff_tonnage) ?? 0), 0);

		for (let i = 0; i < mixes.length; i++) {
			const m = mixes[i];
			const mixName = str(m.mix_name);
			if (!mixName) continue;
			const isActive = primaryMix != null && m === primaryMix ? 1 : 0;
			await db.createProductionMix(jobSite.id, {
				mix_name: mixName,
				unit: str(m.unit),
				bid_quantity: num(m.bid_quantity),
				takeoff_tonnage: num(m.takeoff_tonnage),
				quantity_per_day: num(m.quantity_per_day),
				est_days: num(m.est_days),
				mix_type: str(m.mix_type) ?? str(m.mix_name),
				target_thickness_in: null,
				target_spread_rate: null,
				tack_type: null,
				target_tack_rate: null,
				contract_unit_price: num(m.contract_unit_price),
				is_active: isActive,
				sort_order: i
			});
		}

		// Derive contract costs from the bid items where possible:
		//  - cost per ton  = primary asphalt mix's contract unit price
		//  - cost per SY   = milling item (432-xxxx, unit SY)
		//  - cost per mile = grading-per-mile item (210-xxxx, unit LM)
		const items = Array.isArray(parsed.bid_items) ? parsed.bid_items : [];
		const findUnitPrice = (test: (it: (typeof items)[number]) => boolean): number | null => {
			const hit = items.find((it) => it.selected && it.unit_price != null && test(it));
			return hit ? num(hit.unit_price) : null;
		};
		const costPerTon = primaryMix != null ? num(primaryMix.contract_unit_price) : null;
		const costPerSy = findUnitPrice(
			(it) => /^432-/.test(it.item_id ?? '') || /MILL ASPH/i.test(it.description)
		);
		const costPerMile = findUnitPrice(
			(it) => /^210-/.test(it.item_id ?? '') || /GRADING PER MILE/i.test(it.description)
		);

		// Paving config: primary scope (mapped enum), primary mix, total tonnage,
		// roadway length, and contract value (parsed total bid).
		let primaryScope: DbJobSiteConfig['scope_of_work'] = null;
		for (const tag of scopes) {
			if (SCOPE_TO_ENUM[tag]) {
				primaryScope = SCOPE_TO_ENUM[tag];
				break;
			}
		}

		const configPatch: Partial<DbJobSiteConfig> = {
			total_length_ft: num(parsed.total_length_ft),
			mix_type: primaryMix ? str(primaryMix.mix_name) : null,
			scope_of_work: primaryScope,
			total_tonnage: totalTonnage > 0 ? totalTonnage : null,
			cost_per_ton: costPerTon,
			cost_per_sy: costPerSy,
			cost_per_mile: costPerMile,
			total_contract_value: num(parsed.contract_amount)
		};
		if (Object.values(configPatch).some((v) => v !== null && v !== undefined)) {
			await db.upsertJobSiteConfig(jobSite.id, configPatch);
		}

		// Bid items (carry alternate / selected flags).
		let itemCount = 0;
		for (let i = 0; i < items.length; i++) {
			const it = items[i];
			const description = str(it.description);
			if (!description) continue;
			await db.createBidItem(jobSite.id, {
				line_number: str(it.line_number),
				item_id: str(it.item_id),
				description,
				quantity: num(it.quantity),
				unit: str(it.unit),
				unit_price: num(it.unit_price),
				bid_amount: num(it.bid_amount),
				section: str(it.section),
				is_alternate: it.is_alternate ? 1 : 0,
				selected: it.selected ? 1 : 0,
				sort_order: i
			});
			itemCount++;
		}

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'job_site',
			resourceId: jobSite.id,
			action: 'created',
			newValue: {
				name: jobSite.name,
				source: 'pdf_import',
				bid_items: itemCount,
				production_mixes: mixes.length,
				scopes
			},
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		void deliverWebhook(event.platform!.env.DB, {
			type: 'job_site.created',
			orgId: org.id,
			payload: {
				job_site_id: jobSite.id,
				name: jobSite.name,
				org_id: org.id
			},
			occurredAt: jobSite.created_at
		});

		return json({ id: jobSite.id, name: jobSite.name, bid_items: itemCount });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create job from import error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
