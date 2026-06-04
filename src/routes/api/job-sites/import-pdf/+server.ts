import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { parseGdotDocumentsV2, toV1, pdfToText, detectDocumentType, type ParsedGdotJob, type ParsedGdotJobV2, type GdotDocumentType } from '$lib/server/pdf/parse-gdot';
import type { FieldConfidence } from '$lib/server/pdf/confidence';
import { runLlmFallback, type WorkersAi } from '$lib/server/pdf/llm-fallback';

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

	const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
	const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];

	let nativeFiles: UploadedFile[] | null = null;
	try {
		const form = await request.clone().formData();
		const files: UploadedFile[] = [];
		for (const value of form.getAll('files')) {
			if (value instanceof File) {
				files.push({ name: value.name, type: value.type, bytes: await value.arrayBuffer() });
			}
		}
		if (files.length > 0) nativeFiles = files;
	} catch {
		// fall through to manual parse
	}

	// If the native parser produced clean PDF bytes (every file starts with the
	// %PDF signature), trust it. Otherwise fall back to the manual byte parser —
	// undici's FormData under `vite dev` can mangle binary uploads.
	if (nativeFiles && nativeFiles.every((f) => looksLikePdf(f.bytes))) {
		return nativeFiles;
	}

	if (boundary) {
		const raw = new Uint8Array(await request.arrayBuffer());
		const manual = parseMultipartFiles(raw, boundary);
		if (manual.length > 0) return manual;
	}

	return nativeFiles ?? [];
}

// Checks for the "%PDF" magic bytes at the start of the buffer.
function looksLikePdf(bytes: ArrayBuffer): boolean {
	const head = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
	// Some PDFs have leading whitespace; scan the first few bytes.
	for (let i = 0; i < head.length - 3; i++) {
		if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) {
			return true;
		}
	}
	return false;
}

function parseMultipartFiles(raw: Uint8Array, boundary: string): UploadedFile[] {
	const files: UploadedFile[] = [];
	const enc = new TextEncoder();
	const delimiter = enc.encode(`--${boundary}`);
	const crlfcrlf = enc.encode('\r\n\r\n');

	// Find every delimiter offset at the byte level (no string round-trip, so
	// binary PDF bytes are never mangled).
	const bounds: number[] = [];
	for (let i = 0; i <= raw.length - delimiter.length; i++) {
		let match = true;
		for (let j = 0; j < delimiter.length; j++) {
			if (raw[i + j] !== delimiter[j]) {
				match = false;
				break;
			}
		}
		if (match) {
			bounds.push(i);
			i += delimiter.length - 1;
		}
	}

	for (let b = 0; b < bounds.length - 1; b++) {
		// Part spans from just after this delimiter to just before the next one.
		let partStart = bounds[b] + delimiter.length;
		const partEnd = bounds[b + 1];
		// Skip the CRLF that follows the delimiter.
		if (raw[partStart] === 0x0d && raw[partStart + 1] === 0x0a) partStart += 2;

		// Locate the header/body separator (\r\n\r\n) within the part.
		let headerEnd = -1;
		for (let i = partStart; i <= partEnd - crlfcrlf.length; i++) {
			if (
				raw[i] === 0x0d &&
				raw[i + 1] === 0x0a &&
				raw[i + 2] === 0x0d &&
				raw[i + 3] === 0x0a
			) {
				headerEnd = i;
				break;
			}
		}
		if (headerEnd === -1) continue;

		const headers = new TextDecoder('latin1').decode(raw.subarray(partStart, headerEnd));
		if (!/filename="?([^"]+)"?/i.test(headers)) continue;

		const nameMatch = /filename="?([^"\r\n]+)"?/i.exec(headers);
		const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);

		const bodyStart = headerEnd + 4;
		let bodyEnd = partEnd;
		// Strip the trailing CRLF before the next delimiter.
		if (raw[bodyEnd - 2] === 0x0d && raw[bodyEnd - 1] === 0x0a) bodyEnd -= 2;

		const slice = raw.subarray(bodyStart, bodyEnd);
		files.push({
			name: nameMatch?.[1]?.trim() ?? 'upload.pdf',
			type: typeMatch?.[1]?.trim() ?? 'application/pdf',
			bytes: slice.slice().buffer
		});
	}

	return files;
}

export interface ImportedDocument {
	filename: string;
	source_key: string;
	type: GdotDocumentType;
}

/** Flat map of field name -> confidence level, for the review UI. */
export type FieldConfidenceMap = Record<string, FieldConfidence>;

export interface ImportPdfResponse {
	parsed: ParsedGdotJob;
	source_keys: string[];
	documents: ImportedDocument[];
	/** Per-field confidence from the V2 parser. Keys match ParsedGdotJob field names. */
	field_confidence: FieldConfidenceMap;
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
		const documents: ImportedDocument[] = [];

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
				const text = await pdfToText(file.bytes);
				texts.push(text);
				documents.push({ filename: file.name, source_key: key, type: detectDocumentType(text) });
			} catch (err) {
				console.error('PDF text extraction failed for', file.name, err);
				const detail = err instanceof Error ? err.message : String(err);
				return json(
					{
						error: `Could not read text from "${file.name}". It may be a scanned image or an unsupported PDF.`,
						detail
					},
					{ status: 422 }
				);
			}
		}

		const v2 = parseGdotDocumentsV2(texts);

		// Phase 2 (optional): supplement low-confidence geographic/identity fields
		// with the Workers AI fallback. Best-effort — fills ONLY low/null fields,
		// never overrides medium/high deterministic values, and degrades silently
		// to the deterministic result on any error or unmet JSON Mode.
		const ai = event.platform.env.AI as WorkersAi | undefined;
		await runLlmFallback(ai, v2);

		const parsed = toV1(v2);

		// Build a flat field_confidence map for the UI (scalar fields only).
		const scalarFields: (keyof ParsedGdotJobV2)[] = [
			'name', 'job_number', 'project_number', 'contract_id', 'county',
			'work_type', 'contract_type', 'contract_amount', 'retainage_pct',
			'est_start_date', 'completion_date', 'customer_name', 'customer_address',
			'customer_contact', 'customer_phone', 'customer_email', 'owner_name',
			'owner_address', 'project_manager', 'asphalt_supplier', 'total_length_ft',
			'location_description', 'route_designation', 'begin_terminus', 'end_terminus'
		];
		const field_confidence: FieldConfidenceMap = {};
		for (const k of scalarFields) {
			const f = v2[k] as { confidence: FieldConfidence };
			if (f && 'confidence' in f) field_confidence[k] = f.confidence;
		}

		return json({ parsed, source_keys: sourceKeys, documents, field_confidence } satisfies ImportPdfResponse);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Import PDF error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
