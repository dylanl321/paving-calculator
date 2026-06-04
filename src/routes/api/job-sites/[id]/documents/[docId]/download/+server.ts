import { error, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';

// Quotes a filename for the Content-Disposition header (strips control chars
// and escapes quotes/backslashes).
function safeFilename(name: string): string {
	const cleaned = name.replace(/[\r\n"\\]/g, '_').trim() || 'document.pdf';
	return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

// GET /api/job-sites/:id/documents/:docId/download — streams the original PDF
// from R2 as a download attachment.
export async function GET(event: RequestEvent) {
	if (!event.locals.user) throw error(401, 'Unauthorized');
	if (!event.platform?.env?.DB || !event.platform?.env?.ASSETS_BUCKET) {
		throw error(503, 'Storage not available');
	}
	const db = new DbHelper(event.platform.env.DB);

	const jobSite = await db.getJobSiteById(event.params.id!);
	if (!jobSite) throw error(404, 'Job site not found');
	const org = await db.getOrgByUserId(event.locals.user.id);
	if (!org || org.id !== jobSite.org_id) throw error(403, 'Access denied');

	const doc = await db.getJobDocument(event.params.docId!);
	if (!doc || doc.job_site_id !== jobSite.id) throw error(404, 'Document not found');

	const object = await event.platform.env.ASSETS_BUCKET.get(doc.r2_key);
	if (!object) throw error(404, 'File not found');

	return new Response(object.body, {
		headers: {
			'Content-Type': doc.content_type,
			'Content-Disposition': `attachment; filename="${safeFilename(doc.filename)}"`,
			'Cache-Control': 'private, max-age=3600',
			ETag: object.httpEtag
		}
	});
}
