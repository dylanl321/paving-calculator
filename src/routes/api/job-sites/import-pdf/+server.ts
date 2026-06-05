import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import {
	parseGdotDocumentsV2,
	toV1,
	pdfToPositionedText,
	detectDocumentType,
	type ParsedGdotJob,
	type ParsedGdotJobV2,
	type GdotDocumentType,
	type PdfPositionedTextPage
} from '$lib/server/pdf/parse-gdot';
import type { FieldConfidence } from '$lib/server/pdf/confidence';
import { runLlmFallback, needsLlmFallback, buildLlmDiagnostic, appendLlmFallbackWarning, type WorkersAi, type LlmFallbackDiagnostic } from '$lib/server/pdf/llm-fallback';
import { buildImportRoutePreview, type ImportRoutePreview } from '$lib/server/gdot-geometry';
import { classifyDocument, getUnrecognizedMessage, type DocumentClassification } from '$lib/server/pdf/classify-document';
import { parseInspectionReport, type ParsedInspectionReport } from '$lib/server/pdf/parse-inspection';
import { parseChangeOrder, type ParsedChangeOrder } from '$lib/server/pdf/parse-change-order';
import {
	runAiProjectExtraction,
	type AiExtractionDiagnostic,
	type EvidencePage
} from '$lib/server/pdf/ai-project-extractor';

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB per file

interface UploadedFile {
	name: string;
	type: string;
	bytes: ArrayBuffer;
}

interface UploadedPageImage {
	pdf_index: number;
	filename: string;
	page_number: number;
	bytes: ArrayBuffer;
	type: string;
}

interface UploadBundle {
	files: UploadedFile[];
	pageImages: UploadedPageImage[];
}

// Reads uploaded PDF files from a multipart request. Prefers the native
// FormData parser (production on Workers); falls back to a minimal multipart
// parser because undici's FormData parsing can fail under `vite dev`.
async function readPdfUploadBundle(request: Request): Promise<UploadBundle> {
	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('multipart/form-data')) return { files: [], pageImages: [] };

	const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
	const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];

	let nativeBundle: UploadBundle | null = null;
	try {
		const form = await request.clone().formData();
		const files: UploadedFile[] = [];
		for (const value of form.getAll('files')) {
			if (value instanceof File) {
				files.push({ name: value.name, type: value.type, bytes: await value.arrayBuffer() });
			}
		}
		const pageImages = await readPageImages(form);
		if (files.length > 0) nativeBundle = { files, pageImages };
	} catch {
		// fall through to manual parse
	}

	// If the native parser produced clean PDF bytes (every file starts with the
	// %PDF signature), trust it. Otherwise fall back to the manual byte parser —
	// undici's FormData under `vite dev` can mangle binary uploads.
	if (nativeBundle && nativeBundle.files.every((f) => looksLikePdf(f.bytes))) {
		return nativeBundle;
	}

	if (boundary) {
		const raw = new Uint8Array(await request.arrayBuffer());
		const manual = parseMultipartFiles(raw, boundary);
		if (manual.length > 0) return { files: manual, pageImages: [] };
	}

	return nativeBundle ?? { files: [], pageImages: [] };
}

async function readPageImages(form: FormData): Promise<UploadedPageImage[]> {
	const rawMeta = form.get('page_image_meta');
	if (typeof rawMeta !== 'string' || !rawMeta.trim()) return [];

	let meta: Array<{ field: string; pdf_index: number; filename: string; page_number: number }> = [];
	try {
		meta = JSON.parse(rawMeta) as typeof meta;
	} catch {
		return [];
	}

	const images: UploadedPageImage[] = [];
	for (const item of meta) {
		if (
			typeof item.field !== 'string' ||
			typeof item.pdf_index !== 'number' ||
			typeof item.filename !== 'string' ||
			typeof item.page_number !== 'number'
		) {
			continue;
		}
		const file = form.get(item.field);
		if (!(file instanceof File)) continue;
		images.push({
			pdf_index: item.pdf_index,
			filename: item.filename,
			page_number: item.page_number,
			type: file.type || 'image/jpeg',
			bytes: await file.arrayBuffer()
		});
	}
	return images;
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

export interface DocumentInventory {
	filename: string;
	source_key: string;
	type: GdotDocumentType;
	page_count: number;
	pages: Array<{ page_number: number; label: string }>;
	evidence: {
		contract_summary: boolean;
		job_setup: boolean;
		cover_sheet: boolean;
		index: boolean;
		location_sketch: boolean;
		roadway_log: boolean;
		detailed_estimate: boolean;
	};
	/** AI/regex classification result for this document. */
	classification?: {
		type: string;
		confidence: number;
		description: string;
		ai_used: boolean;
	};
}

/** Flat map of field name -> confidence level, for the review UI. */
export type FieldConfidenceMap = Record<string, FieldConfidence>;

/** Actionable parsing report returned for every uploaded document. */
export interface ParsingReport {
	/** Document type detected (null when completely unrecognized). */
	detected_type: string | null;
	/** Classifier confidence 0–1. */
	confidence: number;
	/** Fields we successfully extracted from the document. */
	extractable_fields: string[];
	/** Fields we expected to find but could not locate. */
	missing_fields: string[];
	/** User-facing suggestions for improving the import. */
	suggestions: string[];
	/** Whether we have full parsing support for this document type. */
	is_supported: boolean;
}

export interface ImportPdfResponse {
	parsed: ParsedGdotJob;
	source_keys: string[];
	documents: ImportedDocument[];
	document_inventory: DocumentInventory[];
	route_preview: ImportRoutePreview;
	/** Per-field confidence from the V2 parser. Keys match ParsedGdotJob field names. */
	field_confidence: FieldConfidenceMap;
	/** Diagnostic describing whether/why the Workers AI fallback ran. */
	llm_fallback: LlmFallbackDiagnostic;
	/** Diagnostic describing whether/why the primary AI extraction ran. */
	ai_extraction: AiExtractionDiagnostic;
	/** Primary document classification type (first uploaded file). */
	document_type: string;
	/** Classification confidence 0–1. */
	classification_confidence: number;
	/** Human-readable label for the classified document type. */
	classification_description: string;
	/** Helpful message for unrecognized or unsupported document types (optional). */
	classification_message?: string;
	/** Per-file multi-document section breakdown (populated when a file has 2+ detected sections). */
	documents_found: Array<{
		file_index: number;
		sections: Array<{
			type: string;
			pages: number[];
			startPage: number;
			endPage: number;
			confidence: number;
		}>;
	}>;
	field_source: Record<string, string>;
	parser_duration_ms: number;
	/** Parsed daily inspection report data (populated when an inspection report is detected). */
	inspection_report?: ParsedInspectionReport;
	/** Parsed change order data (populated when a change order is detected). */
	change_order?: ParsedChangeOrder;
	/** Structured parsing report with extracted/missing fields and suggestions. */
	parsing_report: ParsingReport;
}

function labelForPage(text: string, pageNumber: number): string {
	const t = text.toUpperCase();
	if (/SCHEDULE OF ITEMS|CONTRACT SCHEDULE|PROPOSAL\s+LINE\s+NUMBER|UNIT PRICE\s+BID AMOUNT/.test(t))
		return 'Schedule of Items';
	if (/DETAILED ESTIMATE/.test(t)) return 'Detailed Estimate';
	if (/ROADWAY\s+LOG|\bLOG\b.*WIDTH|ROADWAY\s+[\s\S]{0,80}\bLOG\s+WIDTH/.test(t))
		return 'Roadway Log';
	if (/TYPICAL SECTION/.test(t)) return 'Typical Section';
	if (/GENERAL NOTES/.test(t)) return 'General Notes';
	if (/EROSION CONTROL/.test(t)) return 'Erosion Control Plan';
	if (/LOCATION SKETCH/.test(t)) return 'Location Sketch';
	if (/SPECIAL PROVISION/.test(t)) return 'Special Provision';
	if (/PROPOSAL INDEX|^\s*INDEX\b|\bINDEX\b\s+\d/.test(t)) return 'Index';
	if (/COVER SHEET|PLAN OF PROPOSED|DEPARTMENT OF TRANSPORTATION/.test(t) && pageNumber <= 2)
		return 'Cover Sheet';
	if (/NOTICE TO|BIDDERS|PROPOSAL/.test(t) && pageNumber <= 2) return 'Proposal';
	return `Sheet ${pageNumber}`;
}

function evidenceFromPages(type: GdotDocumentType, pages: PdfPositionedTextPage[]): DocumentInventory['evidence'] {
	const pageLabels = pages.map((page) => labelForPage(page.text, page.page_number));
	return {
		contract_summary: type === 'contract_summary',
		job_setup: type === 'job_setup',
		cover_sheet: pageLabels.includes('Cover Sheet'),
		index: pageLabels.includes('Index'),
		location_sketch: pageLabels.includes('Location Sketch'),
		roadway_log: pageLabels.includes('Roadway Log'),
		detailed_estimate: pageLabels.includes('Detailed Estimate')
	};
}

/**
 * Build a structured parsing report summarising what we extracted vs what's
 * missing, plus actionable suggestions for the user.
 */
function buildParsingReport(
	classification: DocumentClassification | null,
	v2: ParsedGdotJobV2,
	field_confidence: FieldConfidenceMap
): ParsingReport {
	const type = classification?.type ?? 'unknown';
	const confidence = classification?.confidence ?? 0;
	const is_supported =
		type === 'gdot_contract_summary' ||
		type === 'gdot_job_setup' ||
		type === 'gdot_roadway_log';

	// Which fields did we successfully extract (non-null value, any confidence)?
	const ALL_FIELDS = [
		'name', 'job_number', 'project_number', 'contract_id', 'county',
		'work_type', 'contract_type', 'contract_amount', 'retainage_pct',
		'est_start_date', 'completion_date', 'customer_name',
		'customer_contact', 'customer_phone', 'total_length_ft',
		'location_description', 'route_designation', 'begin_terminus', 'end_terminus'
	];

	const FRIENDLY: Record<string, string> = {
		name: 'Project Name', job_number: 'Job Number', project_number: 'Project Number',
		contract_id: 'Contract ID', county: 'County', work_type: 'Work Type',
		contract_type: 'Contract Type', contract_amount: 'Contract Amount',
		retainage_pct: 'Retainage %', est_start_date: 'Start Date',
		completion_date: 'Completion Date', customer_name: 'Customer Name',
		customer_contact: 'Customer Contact', customer_phone: 'Customer Phone',
		total_length_ft: 'Total Length', location_description: 'Location',
		route_designation: 'Route', begin_terminus: 'Begin Terminus',
		end_terminus: 'End Terminus'
	};

	const extractable_fields: string[] = [];
	const missing_fields: string[] = [];

	for (const key of ALL_FIELDS) {
		const raw = v2[key as keyof ParsedGdotJobV2] as { value?: unknown } | null | undefined;
		if (raw && typeof raw === 'object' && 'value' in raw && raw.value !== null && raw.value !== undefined && raw.value !== '') {
			extractable_fields.push(FRIENDLY[key] ?? key);
		} else if (is_supported) {
			missing_fields.push(FRIENDLY[key] ?? key);
		}
	}

	// Build actionable suggestions.
	const suggestions: string[] = [];

	if (type === 'unknown') {
		suggestions.push('Try uploading the Contract Summary page from your GDOT bid package.');
		suggestions.push('Ensure the PDF contains selectable text (not a scanned image).');
	} else if (!is_supported) {
		const supportSoon: Partial<Record<string, string>> = {
			weight_ticket: 'Weight ticket import is coming soon — check back next release.',
			material_certification: 'Material cert import is planned — upload alongside a contract summary for now.',
			inspection_report: 'Inspection reports are not yet supported for import.',
			change_order: 'Change order import is coming soon.',
			daily_report: 'Daily report import is not yet supported.'
		};
		suggestions.push(supportSoon[type] ?? `${classification?.description ?? 'This document type'} is not yet supported.`);
	} else {
		// Supported type — suggest based on missing fields.
		if (missing_fields.includes('Project Name') || missing_fields.includes('Job Number')) {
			suggestions.push('Upload the Job Setup document alongside the Contract Summary for best results.');
		}
		if (missing_fields.includes('Route') || missing_fields.includes('Begin Terminus')) {
			suggestions.push('Include the Roadway Log page to improve location data extraction.');
		}
		if (missing_fields.length > 5) {
			suggestions.push('Make sure you uploaded the full GDOT bid package, not just a single page.');
		}
	}

	return { detected_type: type === 'unknown' ? null : type, confidence, extractable_fields, missing_fields, suggestions, is_supported };
}

/**
 * POST /api/job-sites/import-pdf
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

		const upload = await readPdfUploadBundle(event.request);
		const files = upload.files;
		if (files.length === 0) {
			return json({ error: 'No PDF files provided' }, { status: 400 });
		}

		const texts: string[] = [];
		const sourceKeys: string[] = [];
		const documents: ImportedDocument[] = [];
		const documentInventory: DocumentInventory[] = [];
		const allPageArrays: PdfPositionedTextPage[][] = [];
		const evidencePagesByFile: EvidencePage[][] = [];
		// Classification of the primary (first) uploaded document.
		let primaryClassification: DocumentClassification | null = null;

		// Workers AI binding — may be undefined in local dev. Needed for both
		// document classification and LLM fallback field-filling.
		const ai = event.platform.env.AI as WorkersAi | undefined;

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
				const pages = await pdfToPositionedText(file.bytes);
				allPageArrays.push(pages);
				const text = pages.map((page) => page.text).join('\n\f\n');
				const type = detectDocumentType(text);
				texts.push(text);
				const fileIndex = files.indexOf(file);
				const evidencePages = pages.map((page) => {
					const uploadedImage = upload.pageImages.find(
						(img) =>
							img.pdf_index === fileIndex &&
							img.filename === file.name &&
							img.page_number === page.page_number
					);
					return {
						pdf_index: fileIndex,
						filename: file.name,
						page_number: page.page_number,
						page_label: labelForPage(page.text, page.page_number),
						text: page.text,
						image: uploadedImage?.bytes
					} satisfies EvidencePage;
				});
				evidencePagesByFile.push(evidencePages);

				// Classify the document (AI slow-path when regex returns unknown).
				// Run for all files; track the primary (first) document classification.
				const fileClassification = await classifyDocument(
					ai,
					pages.map((page) => page.text)
				);
				if (primaryClassification === null) {
					primaryClassification = fileClassification;
				}

				documents.push({ filename: file.name, source_key: key, type });
				documentInventory.push({
					filename: file.name,
					source_key: key,
					type,
					page_count: pages.length,
					pages: pages.map((page) => ({
						page_number: page.page_number,
						label: labelForPage(page.text, page.page_number)
					})),
					evidence: evidenceFromPages(type, pages),
					classification: {
						type: fileClassification.type,
						confidence: fileClassification.confidence,
						description: fileClassification.description,
						ai_used: fileClassification.ai_used
					}
				});
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

		const parserStart = Date.now();
		const v2 = parseGdotDocumentsV2(texts, allPageArrays);
		let parser_duration_ms = Date.now() - parserStart;

		const projectImportCandidate = documentInventory.some((doc) => {
			if (doc.type === 'contract_summary' || doc.type === 'job_setup') return true;
			const classifiedType = doc.classification?.type;
			return (
				classifiedType === 'gdot_contract_summary' ||
				classifiedType === 'gdot_job_setup' ||
				classifiedType === 'gdot_roadway_log' ||
				classifiedType === 'plan_sheet'
			);
		});

		const ai_extraction = projectImportCandidate
			? await runAiProjectExtraction(ai, evidencePagesByFile.flat(), v2)
			: ({
					attempted: false,
					applied: false,
					outcome: 'deterministic-fallback',
					model: null,
					duration_ms: 0,
					reason: 'not-project-import-document'
				} satisfies AiExtractionDiagnostic);
		parser_duration_ms += ai_extraction.duration_ms ?? 0;
		if (ai_extraction.outcome === 'binding-unavailable') {
			v2.warnings.push(
				'AI extraction was not available in this environment; deterministic PDF parsing was used.'
			);
		} else if (ai_extraction.outcome === 'failed') {
			v2.warnings.push(
				`AI extraction could not complete (${ai_extraction.reason}); deterministic PDF parsing was used.`
			);
		}

		// --- Inspection report / change order parsers ---
		// Run if any uploaded document was classified as that type.
		let inspection_report: ParsedInspectionReport | undefined;
		let change_order: ParsedChangeOrder | undefined;
		for (let i = 0; i < texts.length; i++) {
			const docType = detectDocumentType(texts[i]);
			if (docType === 'inspection_report' && !inspection_report) {
				inspection_report = parseInspectionReport(texts[i]);
			} else if (docType === 'change_order' && !change_order) {
				change_order = parseChangeOrder(texts[i]);
			}
		}

		// Phase 2 (optional): supplement low-confidence geographic/identity fields
		// with the Workers AI fallback. Best-effort — fills ONLY low/null fields,
		// never overrides medium/high deterministic values, and degrades silently
		// to the deterministic result on any error or unmet JSON Mode.
		//
		// Workers AI bindings are frequently NOT provided by the local `vite dev`
		// platform proxy, so the fallback can no-op without any signal. We capture
		// the outcome and surface it (diagnostic field + parsed.warnings) so the
		// behaviour is observable rather than silent.
		const attempted = needsLlmFallback(v2);
		const fallback = await runLlmFallback(ai, v2);
		const llm_fallback = buildLlmDiagnostic(attempted, !!ai, fallback);
		appendLlmFallbackWarning(v2.warnings, llm_fallback);

		const parsed = toV1(v2);
		const route_preview = await buildImportRoutePreview({
			routeDesignation: parsed.route_designation ?? null,
			county: parsed.county ?? null,
			locationDescription: parsed.location_description ?? null,
			totalLengthFt: parsed.total_length_ft ?? null,
			beginTerminus: parsed.begin_terminus ?? null,
			endTerminus: parsed.end_terminus ?? null,
			roadwayLogEvents: parsed.roadway_log_events ?? [],
			countyNumber: parsed.county_number ?? null,
			midpointEasting: parsed.midpoint_easting ?? null,
			midpointNorthing: parsed.midpoint_northing ?? null,
			midpointZoneLabel: parsed.midpoint_zone_label ?? null,
			grossLengthMi: parsed.gross_length_mi ?? null
		});

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

		const field_source: Record<string, string> = {};
		for (const k of scalarFields) {
			const f = v2[k] as { source?: string } | null | undefined;
			if (f && typeof f === 'object' && f.source) field_source[k] = f.source;
		}

		// Build classification message for unrecognized or low-confidence types.
		const classificationMessage =
			primaryClassification &&
			(primaryClassification.type === 'unknown' || primaryClassification.confidence < 0.5)
				? getUnrecognizedMessage(primaryClassification)
				: undefined;

		// Build parsing report: enumerate extracted vs missing fields and suggestions.
		const parsing_report = buildParsingReport(primaryClassification, v2, field_confidence);

		return json({
			parsed,
			source_keys: sourceKeys,
			documents,
			document_inventory: documentInventory,
			route_preview,
			field_confidence,
			llm_fallback,
			ai_extraction,
			document_type: primaryClassification?.type ?? 'unknown',
			classification_confidence: primaryClassification?.confidence ?? 0,
			classification_description: primaryClassification?.description ?? 'Unknown Document Type',
			classification_message: classificationMessage,
			documents_found: v2.documents_found,
			field_source,
			parser_duration_ms,
			...(inspection_report !== undefined ? { inspection_report } : {}),
			...(change_order !== undefined ? { change_order } : {}),
			parsing_report
		} satisfies ImportPdfResponse);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Import PDF error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
