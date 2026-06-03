import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth, requireOrgRole } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

const MAX_LOGO_BYTES = 512 * 1024; // 512 KB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

function logoKey(orgId: string): string {
	return `org/${orgId}/logo`;
}

type ParsedLogo = { bytes: ArrayBuffer; type: string };

// Reads the uploaded logo from the request. Prefers the native FormData parser
// (used in production on Cloudflare Workers); falls back to a minimal multipart
// parser because undici's FormData parsing can fail under `vite dev`.
async function readLogoUpload(request: Request): Promise<ParsedLogo | null> {
	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('multipart/form-data')) {
		try {
			const form = await request.clone().formData();
			const file = form.get('logo');
			if (file instanceof File) {
				return { bytes: await file.arrayBuffer(), type: file.type };
			}
		} catch {
			// fall through to manual parse
		}

		const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
		const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
		if (!boundary) return null;

		const raw = new Uint8Array(await request.arrayBuffer());
		return parseMultipart(raw, boundary, 'logo');
	}

	return null;
}

function parseMultipart(raw: Uint8Array, boundary: string, field: string): ParsedLogo | null {
	const text = new TextDecoder('latin1').decode(raw);
	const delimiter = `--${boundary}`;
	const parts = text.split(delimiter);

	for (const part of parts) {
		const headerEnd = part.indexOf('\r\n\r\n');
		if (headerEnd === -1) continue;
		const headers = part.slice(0, headerEnd);
		if (!/name="?(?:logo)"?/i.test(headers)) continue;
		if (!new RegExp(`name="?${field}"?`, 'i').test(headers)) continue;

		const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);
		const type = typeMatch?.[1]?.trim() ?? 'application/octet-stream';

		// Body starts after the header terminator and ends before the trailing CRLF.
		const bodyStart = headerEnd + 4;
		let bodyEnd = part.length;
		if (part.endsWith('\r\n')) bodyEnd -= 2;

		const slice = raw.slice(byteOffset(text, part, bodyStart), byteOffset(text, part, bodyEnd));
		return { bytes: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength), type };
	}

	return null;
}

// Maps an index within a latin1-decoded part back to the absolute byte offset in
// the original buffer. Because latin1 is a 1:1 byte-to-char mapping, char indices
// equal byte indices, so we only need the part's offset within the whole text.
function byteOffset(fullText: string, part: string, indexInPart: number): number {
	const partStart = fullText.indexOf(part);
	return partStart + indexInPart;
}

// Public GET: streams an org's logo from R2.
// Resolved by ?org=<slug> (public) or, if absent, the current session's org.
export async function GET(event: RequestEvent) {
	try {
		if (!event.platform?.env?.DB || !event.platform?.env?.ASSETS_BUCKET) {
			return json({ error: 'Storage not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const slug = event.url.searchParams.get('org');
		let orgId: string | null = null;

		if (slug) {
			const org = await db.getOrgBySlug(slug);
			orgId = org?.id ?? null;
		} else {
			const user = await requireAuth(event);
			const org = await db.getOrgByUserId(user.id);
			orgId = org?.id ?? null;
		}

		if (!orgId) {
			return json({ error: 'Not found' }, { status: 404 });
		}

		const settings = await db.getOrgSettings(orgId);
		if (!settings?.logo_key) {
			return json({ error: 'No logo' }, { status: 404 });
		}

		const object = await event.platform.env.ASSETS_BUCKET.get(settings.logo_key);
		if (!object) {
			return json({ error: 'No logo' }, { status: 404 });
		}

		return new Response(object.body, {
			headers: {
				'Content-Type': settings.logo_content_type ?? 'application/octet-stream',
				'Cache-Control': 'private, max-age=300',
				ETag: object.httpEtag
			}
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get org logo error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB || !event.platform?.env?.ASSETS_BUCKET) {
			return json({ error: 'Storage not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		await requireOrgRole(event, org.id, ['owner', 'admin']);

		const upload = await readLogoUpload(event.request);
		if (!upload) {
			return json({ error: 'No logo file provided' }, { status: 400 });
		}
		if (!ALLOWED_TYPES.has(upload.type)) {
			return json({ error: 'Logo must be PNG, JPEG, WebP, or SVG' }, { status: 400 });
		}
		if (upload.bytes.byteLength > MAX_LOGO_BYTES) {
			return json({ error: 'Logo must be 512 KB or smaller' }, { status: 400 });
		}

		const key = logoKey(org.id);
		await event.platform.env.ASSETS_BUCKET.put(key, upload.bytes, {
			httpMetadata: { contentType: upload.type }
		});

		await db.upsertOrgSettings(org.id, {
			logoKey: key,
			logoContentType: upload.type,
			updatedBy: user.id
		});

		// Record audit log
		recordAudit(event.platform.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'org_branding',
			resourceId: org.id,
			action: 'logo_uploaded',
			ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ success: true, hasLogo: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Upload org logo error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB || !event.platform?.env?.ASSETS_BUCKET) {
			return json({ error: 'Storage not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		await requireOrgRole(event, org.id, ['owner', 'admin']);

		const settings = await db.getOrgSettings(org.id);
		if (settings?.logo_key) {
			await event.platform.env.ASSETS_BUCKET.delete(settings.logo_key);
		}

		await db.upsertOrgSettings(org.id, {
			logoKey: null,
			logoContentType: null,
			updatedBy: user.id
		});

		// Record audit log
		recordAudit(event.platform.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'org_branding',
			resourceId: org.id,
			action: 'logo_removed',
			ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ success: true, hasLogo: false });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Delete org logo error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
