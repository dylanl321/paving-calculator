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
import { runLlmFallback, needsLlmFallback, buildLlmDiagnostic, appendLlmFallbackWarning, type WorkersAi, type LlmFallbackDiagnostic, type LlmFallbackResult } from '$lib/server/pdf/llm-fallback';
import { buildImportRoutePreview, type ImportRoutePreview } from '$lib/server/gdot-geometry';
import { classifyDocument, getUnrecognizedMessage, type DocumentClassification } from '$lib/server/pdf/classify-document';
import { parseInspectionReport, type ParsedInspectionReport } from '$lib/server/pdf/parse-inspection';
import { parseChangeOrder, type ParsedChangeOrder } from '$lib/server/pdf/parse-change-order';
import {
	type AiExtractionDiagnostic,
	type EvidencePage
} from '$lib/server/pdf/ai-project-extractor';
import { type StructureContractDiagnostic } from '$lib/server/pdf/structure-contract';
import { readBedrockConfig } from '$lib/server/pdf/bedrock-structurer';
import { mergeStructuredContractIntoV2 } from '$lib/server/pdf/structured-contract-adapter';
import { runExtraction } from '$lib/server/extraction/engine';
import { pavingContractV1 } from '$lib/server/extraction/profiles/paving-contract-v1';
import type { FieldMeta, FieldConflict } from '$lib/server/extraction/types';
import { mapStructuredContractSegments, type MappedSegment } from '$lib/server/gdot-geometry';
import type { StructuredContract, SegmentKind, SegmentPavement } from '$lib/server/pdf/structured-contract';

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
	/** Diagnostic describing whether/why the LLM contract structurer ran. */
	structure_contract: StructureContractDiagnostic;
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
	/**
	 * First-class per-field provenance + confidence keyed by dotted field path
	 * (e.g. `county.name`, `route.designation`, `gross_length_mi`,
	 * `segments[0].length_mi`). Replaces the brittle flat `field_confidence` /
	 * `field_source` string maps (which remain populated for back-compat until the
	 * Phase 7 review UI consumes `field_meta`). Each entry:
	 * `{ confidence, source_pages, source_file, evidence_type }`.
	 */
	field_meta: Record<string, FieldMeta>;
	/**
	 * Structured AI-vs-validator disagreements (AI-primary: the AI value is kept,
	 * each entry is `{ field_path, ai_value, validator_value, resolution, severity }`).
	 * Replaces the warning-prose round-trip (`aiConflictFromWarning`) that only
	 * matched single-word labels. The legacy warning strings remain in
	 * `parsed.warnings` for back-compat until the Phase 7 UI consumes `conflicts`.
	 */
	conflicts: FieldConflict[];
	/** Parsed daily inspection report data (populated when an inspection report is detected). */
	inspection_report?: ParsedInspectionReport;
	/** Parsed change order data (populated when a change order is detected). */
	change_order?: ParsedChangeOrder;
	/** Structured parsing report with extracted/missing fields and suggestions. */
	parsing_report: ParsingReport;
	/**
	 * Structured-contract segments with their per-mile-range `pavement[]`
	 * typical-section specs, surfaced for the Phase 7 Pavement review section.
	 * The pavement scalars keep their {@link ParsedField} citation envelopes so
	 * the review UI can show confidence + source page; the page flattens them to
	 * plain values before persisting via `from-import`. Empty when the document
	 * states no per-segment pavement data.
	 */
	segments: ImportContractSegment[];
}

/**
 * One named segment surfaced to the review UI. Scalar identity fields are
 * unwrapped to plain values; `pavement[]` keeps its {@link SegmentPavement}
 * ParsedField envelopes (with per-field citations) so the review UI can render
 * confidence + source page per value.
 */
export interface ImportContractSegment {
	name: string | null;
	kind: SegmentKind | null;
	length_mi: number | null;
	begin_terminus: string | null;
	end_terminus: string | null;
	pavement: SegmentPavement[];
}

/**
 * Map the validated structured contract's segments to the client-facing
 * {@link ImportContractSegment} shape: unwrap the scalar identity fields and
 * carry each segment's `pavement[]` ParsedField envelopes through verbatim so
 * the Phase 7 review UI sees per-field confidence + source page.
 */
function toImportSegments(contract: StructuredContract | null): ImportContractSegment[] {
	if (!contract?.segments?.length) return [];
	return contract.segments.map((seg) => ({
		name: seg.name?.value ?? null,
		kind: seg.kind?.value ?? null,
		length_mi: seg.length_mi?.value ?? null,
		begin_terminus: seg.begin_terminus?.value ?? null,
		end_terminus: seg.end_terminus?.value ?? null,
		pavement: Array.isArray(seg.pavement) ? seg.pavement : []
	}));
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
	// Phase 1: the extraction engine ALWAYS runs (AI-primary over any layout), so
	// the import no longer gates on a GDOT-type whitelist. We attempt extraction
	// for every uploaded PDF; `is_supported` is reported true unless the document
	// is completely unrecognized (it then just yields fewer extractable fields).
	const is_supported = type !== 'unknown';

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
		suggestions.push('Upload a GDOT contract summary, job setup, or roadway-log PDF for the richest extraction.');
		suggestions.push('Scanned PDFs are read via the vision path — re-upload from the import page so page images are rendered.');
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
						image: uploadedImage?.bytes,
						image_mime_type: uploadedImage?.type
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
				const fileIndex = files.indexOf(file);
				// Phase 8 (scanned resilience): text extraction failed, but if the
				// client rendered page images for this file we can still route those
				// pages through the vision path instead of hard-failing. Build
				// image-only evidence pages (empty text -> profile.selectPages marks
				// them diagram/low-text -> Bedrock vision). Only 422 when NEITHER text
				// NOR images are available.
				const fileImages = upload.pageImages.filter(
					(img) => img.pdf_index === fileIndex && img.filename === file.name
				);
				if (fileImages.length === 0) {
					return json(
						{
							error: `Could not read "${file.name}". It has no selectable text and no page images were rendered, so it can't be processed. If it's a scanned PDF, re-upload it from the import page (which renders page images for the vision reader).`,
							detail
						},
						{ status: 422 }
					);
				}
				const imageOnlyPages = fileImages
					.sort((a, b) => a.page_number - b.page_number)
					.map(
						(img) =>
							({
								pdf_index: fileIndex,
								filename: file.name,
								page_number: img.page_number,
								page_label: `Sheet ${img.page_number}`,
								text: '',
								image: img.bytes,
								image_mime_type: img.type
							}) satisfies EvidencePage
					);
				allPageArrays.push([]);
				texts.push('');
				evidencePagesByFile.push(imageOnlyPages);
				documents.push({ filename: file.name, source_key: key, type: 'unknown' });
				documentInventory.push({
					filename: file.name,
					source_key: key,
					type: 'unknown',
					page_count: imageOnlyPages.length,
					pages: imageOnlyPages.map((p) => ({ page_number: p.page_number, label: p.page_label })),
					evidence: {
						contract_summary: false,
						job_setup: false,
						cover_sheet: false,
						index: false,
						location_sketch: false,
						roadway_log: false,
						detailed_estimate: false
					},
					classification: {
						type: 'scanned_image',
						confidence: 0,
						description: 'Scanned/Image PDF (vision path)',
						ai_used: false
					}
				});
			}
		}

		const parserStart = Date.now();
		const v2 = parseGdotDocumentsV2(texts, allPageArrays);
		let parser_duration_ms = Date.now() - parserStart;

		// The legacy flat-field AI extractor (runAiProjectExtraction) is SUPERSEDED
		// by the LLM-primary structurer below: the structurer + adapter produce the
		// same scalar fills (route/county/termini/bid_items/mixes) PLUS the
		// multi-segment structure, in a single AI pass. We keep the diagnostic field
		// for response back-compat, marked as superseded.
		const ai_extraction: AiExtractionDiagnostic = {
			attempted: false,
			applied: false,
			outcome: 'deterministic-fallback',
			model: null,
			duration_ms: 0,
			reason: 'superseded-by-structurer'
		};

		// --- AI-PRIMARY contract structurer (multi-segment), via the engine ---
		// The generic extraction engine, driven by the caller-selected
		// `paving-contract-v1` profile, structures the page-labeled evidence
		// (text + diagram page images) into one StructuredContract, validates it,
		// AI-primary cross-checks it against the regex parse (flag-only conflicts),
		// folds its scalar fields back into v2 (AI-primary), and maps each segment
		// to its own centerline. NO format gating: the profile ALWAYS runs (Phase 1)
		// — `detectDocumentType` is only an advisory hint, never a blocker. Best-
		// effort: a missing AI binding or unusable JSON leaves the deterministic
		// result untouched.
		let structuredContract: StructuredContract | null = null;
		let mappedSegments: MappedSegment[] = [];
		let field_meta: Record<string, FieldMeta> = {};
		let conflicts: FieldConflict[] = [];
		// Bedrock (Claude Sonnet 4) is the primary structurer when a key is
		// configured; it falls back to the Workers AI chain inside structureContract.
		const bedrock = readBedrockConfig(event.platform.env as Record<string, unknown>);
		const extraction = await runExtraction(pavingContractV1, evidencePagesByFile.flat(), {
			bedrock,
			ai,
			validatorInput: v2
		});
		const structure_contract: StructureContractDiagnostic =
			(extraction.diagnostics.structurer_diagnostic as StructureContractDiagnostic) ?? {
				attempted: true,
				applied: extraction.status === 'succeeded',
				outcome: extraction.status === 'succeeded' ? 'applied' : 'failed',
				engine: extraction.diagnostics.engine ?? null,
				model: extraction.diagnostics.model ?? null,
				duration_ms: extraction.diagnostics.duration_ms ?? 0,
				reason: String(extraction.diagnostics.structurer_reason ?? ''),
				segment_count: Number(extraction.diagnostics.segment_count ?? 0)
			};
		// The engine's validate stage already ran validateContract +
		// crossCheckWithRegex; its result is the validated/cross-checked contract,
		// and it surfaces first-class field_meta + structured conflicts.
		structuredContract = extraction.result;
		field_meta = extraction.field_meta;
		conflicts = extraction.conflicts;
		for (const w of extraction.warnings) {
			if (w && !v2.warnings.includes(w)) v2.warnings.push(w);
		}
		parser_duration_ms += structure_contract.duration_ms ?? 0;
		if (structuredContract) {
			// The AI engine processed the document, so the deterministic parser's
			// advisory "could not recognize this as a GDOT…" note is misleading —
			// drop it (regex is now a non-authoritative validator, Phase 1/5).
			v2.warnings = v2.warnings.filter(
				(w) => !/^Could not recognize this as a GDOT/i.test(w)
			);
			// Merge the validated/cross-checked contract's scalar fields into v2
			// (AI-primary), then map each segment to its own centerline.
			mergeStructuredContractIntoV2(v2, structuredContract);
			try {
				const mapped = await mapStructuredContractSegments(structuredContract);
				mappedSegments = mapped.segments;
				for (const w of mapped.lookup_warnings) {
					if (w && !v2.warnings.includes(w)) v2.warnings.push(w);
				}
			} catch (err) {
				console.error('Per-segment geometry mapping failed:', err);
			}
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

		// Phase 2 (optional, ONLY when the structurer did not apply): supplement
		// low-confidence geographic/identity fields with the narrow Workers AI
		// fallback. When the structurer succeeded it has already filled these
		// (null-only) via the adapter, so running the fallback too would be
		// redundant AI work — skip it. This is the consolidation that keeps the
		// import to a single heavy AI pass in the common case.
		//
		// Best-effort: fills ONLY low/null fields, never overrides medium/high
		// deterministic values, and degrades silently to the deterministic result
		// on any error or unmet JSON Mode. Workers AI bindings are frequently NOT
		// provided by the local `vite dev` platform proxy, so the fallback can
		// no-op without any signal; we capture and surface the outcome.
		const structurerApplied = structure_contract.outcome === 'applied';
		const attempted = !structurerApplied && needsLlmFallback(v2);
		const fallback = structurerApplied
			? ({ applied: false, reason: 'superseded-by-structurer' } satisfies LlmFallbackResult)
			: await runLlmFallback(ai, v2);
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
			grossLengthMi: parsed.gross_length_mi ?? null,
			projectId: parsed.project_number ?? null
		});
		// Attach per-segment mapped centerlines (multi-segment pipeline) without
		// disturbing the back-compat single-route preview fields above.
		if (mappedSegments.length > 0) {
			route_preview.mapped_segments = mappedSegments;
		}

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
			structure_contract,
			document_type: primaryClassification?.type ?? 'unknown',
			classification_confidence: primaryClassification?.confidence ?? 0,
			classification_description: primaryClassification?.description ?? 'Unknown Document Type',
			classification_message: classificationMessage,
			documents_found: v2.documents_found,
			field_source,
			parser_duration_ms,
			field_meta,
			conflicts,
			...(inspection_report !== undefined ? { inspection_report } : {}),
			...(change_order !== undefined ? { change_order } : {}),
			parsing_report,
			segments: toImportSegments(structuredContract)
		} satisfies ImportPdfResponse);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Import PDF error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
