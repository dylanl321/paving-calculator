import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface PlanSheetBounds {
  ne: { lat: number; lng: number };
  sw: { lat: number; lng: number };
}

interface PlanSheetRecord {
  id: number;
  job_site_id: string;
  title: string;
  pdf_url: string;
  thumbnail_url: string | null;
  bounds_ne_lat: number | null;
  bounds_ne_lng: number | null;
  bounds_sw_lat: number | null;
  bounds_sw_lng: number | null;
  created_at: number;
  updated_at: number;
}

interface PlanSheetResponse {
  id: number;
  title: string;
  pdf_url: string;
  thumbnail_url: string | null;
  bounds: PlanSheetBounds | null;
}

function transformRecord(record: PlanSheetRecord): PlanSheetResponse {
  const hasBounds =
    record.bounds_ne_lat !== null &&
    record.bounds_ne_lng !== null &&
    record.bounds_sw_lat !== null &&
    record.bounds_sw_lng !== null;

  return {
    id: record.id,
    title: record.title,
    pdf_url: record.pdf_url,
    thumbnail_url: record.thumbnail_url,
    bounds: hasBounds
      ? {
          ne: { lat: record.bounds_ne_lat!, lng: record.bounds_ne_lng! },
          sw: { lat: record.bounds_sw_lat!, lng: record.bounds_sw_lng! }
        }
      : null
  };
}

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!platform?.env?.DB) throw error(500, 'Database not available');

  const db = platform.env.DB;
  const jobSiteId = params.id;

  const results = await db
    .prepare('SELECT * FROM plan_sheet_georef WHERE job_site_id = ? ORDER BY created_at DESC')
    .bind(jobSiteId)
    .all<PlanSheetRecord>();

  const planSheets = results.results.map(transformRecord);

  return json(planSheets);
};

interface CreatePlanSheetBody {
  title: string;
  pdf_url: string;
  thumbnail_url?: string;
  bounds?: PlanSheetBounds;
}

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!platform?.env?.DB) throw error(500, 'Database not available');

  const db = platform.env.DB;
  const jobSiteId = params.id;

  const body = (await request.json()) as CreatePlanSheetBody;

  if (!body.title || !body.title.trim()) {
    return json({ error: 'Title is required' }, { status: 400 });
  }
  if (!body.pdf_url || !body.pdf_url.trim()) {
    return json({ error: 'PDF URL is required' }, { status: 400 });
  }

  const bounds = body.bounds;

  const result = await db
    .prepare(
      `INSERT INTO plan_sheet_georef
       (job_site_id, title, pdf_url, thumbnail_url, bounds_ne_lat, bounds_ne_lng, bounds_sw_lat, bounds_sw_lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .bind(
      jobSiteId,
      body.title.trim(),
      body.pdf_url.trim(),
      body.thumbnail_url?.trim() ?? null,
      bounds?.ne?.lat ?? null,
      bounds?.ne?.lng ?? null,
      bounds?.sw?.lat ?? null,
      bounds?.sw?.lng ?? null
    )
    .first<PlanSheetRecord>();

  if (!result) {
    throw error(500, 'Failed to create plan sheet');
  }

  return json(transformRecord(result), { status: 201 });
};
