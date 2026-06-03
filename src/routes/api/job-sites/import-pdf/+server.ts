import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { parseGdotDocuments, pdfToText, type ParsedGdotJob } from '$lib/server/pdf/parse-gdot';

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB per file

interface UploadedFile {
	name: string;
	type: string;
	bytes: ArrayBuffer;
}

// Reads uploaded PDF files from a multipart request. Prefers the native
// FormData parser (production on Workers); falls back to a minimal multipart
// parser because undici's FormData parsing can fail under `vite dev`.
async function readPdfUploads(request: Request): Promise<UploadedFile[]> {
	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('multipart/form-data')) return [];

	try {
		const form = await request.clone().formData();
		const files: UploadedFile[] = [];
		for (const value of form.getAll('files')) {
			if (value instanceof File) {
				files.push({ name: value.name, type: value.type, bytes: await value.arrayBuffer() });
			}
		}
		if (files.length > 0) return files;
	} catch {
		// fall through to manual parse
	}

	const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
	const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
	if (!boundary) return [];

	const raw = new Uint8Array(await request.arrayBuffer());
	return parseMultipartFiles(raw, boundary);
}

function parseMultipartFiles(raw: Uint8Array, boundary: string): UploadedFile[] {
	const text = new TextDecoder('latin1').decode(raw);
	const delimiter = `--${boundary}`;
	const parts = text.split(delimiter);
	const files: UploadedFile[] = [];

	for (const part of parts) {
		const headerEnd = part.indexOf('\r\n\r\n');
		if (headerEnd === -1) continue;
		const headers = part.slice(0, headerEnd);
		if (!/filename="?([^"]+)"?/i.test(headers)) continue;

		const nameMatch = /filename="?([^"\r\n]+)"?/i.exec(headers);
		const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);

		const bodyStart = headerEnd + 4;
		let bodyEnd = part.length;
		if (part.endsWith('\r\n')) bodyEnd -= 2;

		const partStart = text.indexOf(part);
		const slice = raw.slice(partStart + bodyStart, partStart + bodyEnd);
		files.push({
			name: nameMatch?.[1]?.trim() ?? 'upload.pdf',
			type: typeMatch?.[1]?.trim() ?? 'application/pdf',
			bytes: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)
		});
	}

	return files;
}

export interface ImportPdfResponse {
	parsed: ParsedGdotJob;
	source_keys: string[];
}

/**
 * POST /api/job-sites/import-pdf
 * Accepts one or more PDF documents (multipart field `files`), stores the
 * originals in R2, extracts and parses the GDOT job-setup / contract-summary
 * data, and returns a prefill object plus the R2 keys of the stored source PDFs.
 * Does NOT create a job site — the client reviews the prefill then commits via
 * /api/job-sites/from-import.
 */
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

		const files = await readPdfUploads(event.request);
		if (files.length === 0) {
			return json({ error: 'No PDF files provided' }, { status: 400 });
		}

		const texts: string[] = [];
		const sourceKeys: string[] = [];

		for (const file of files) {
			const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
			if (!isPdf) {
				return json({ error: `"${file.name}" is not a PDF` }, { status: 400 });
			}
			if (file.bytes.byteLength > MAX_PDF_BYTES) {
				return json({ error: `"${file.name}" exceeds the 15 MB limit` }, { status: 400 });
			}

			const key = `imports/${org.id}/${crypto.randomUUID()}.pdf`;
			await event.platform.env.ASSETS_BUCKET.put(key, file.bytes, {
				httpMetadata: { contentType: 'application/pdf' }
			});
			sourceKeys.push(key);

			try {
				texts.push(await pdfToText(file.bytes));
			} catch (err) {
				console.error('PDF text extraction failed for', file.name, err);
				return json(
					{ error: `Could not read text from "${file.name}". Is it a scanned image?` },
					{ status: 422 }
				);
			}
		}

		const parsed = parseGdotDocuments(texts);

		return json({ parsed, source_keys: sourceKeys } satisfies ImportPdfResponse);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Import PDF error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
