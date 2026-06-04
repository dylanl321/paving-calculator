import { json, error, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';

// GET /api/job-sites/:id/documents — lists source documents (uploaded PDFs).
export async function GET(event: RequestEvent) {
	try {
		if (!event.locals.user) throw error(401, 'Unauthorized');
		if (!event.platform?.env?.DB) return json({ error: 'Storage not available' }, { status: 503 });
		const db = new DbHelper(event.platform.env.DB);

		const jobSite = await db.getJobSiteById(event.params.id!);
		if (!jobSite) throw error(404, 'Job site not found');
		const org = await db.getOrgByUserId(event.locals.user.id);
		if (!org || org.id !== jobSite.org_id) throw error(403, 'Access denied');

		const documents = await db.getJobDocuments(event.params.id!);
		return json({
			documents: documents.map((d) => ({
				id: d.id,
				filename: d.filename,
				doc_type: d.doc_type,
				created_at: d.created_at
			}))
		});
	} catch (err) {
		if (err instanceof Response) return err;
		console.error('List job documents error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
