<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { config, constant } from '$lib/config';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import DocumentFeedback from '$lib/components/DocumentFeedback.svelte';
	import {
		PROJECT_FIELDS,
		LOCATION_FIELDS,
		CUSTOMER_FIELDS,
		ALL_REVIEW_FIELDS,
		countNeedsAttention,
		displayedConfidence,
		fieldState,
		isEmptyValue,
		type FieldConfidence,
		type FieldConfidenceMap,
		type FieldState
	} from '$lib/utils/review-confidence';
	import type {
		ParsedBidItem,
		ParsedMix,
		ParsedRoadwayLogEvent,
		PreviewRoadwayLogEvent,
		DocumentInventory,
		ParsedJob,
		ParsedTerminus,
		RoutePreview,
		ImportPdfResponse,
		FieldMeta,
		FieldConflict,
		ImportContractSegment,
		ImportSegmentPavement,
		ParsedFieldEnvelope
	} from '$lib/types/import-pdf';

	let step = $state<'upload' | 'parsing' | 'review' | 'creating'>('upload');
	let files = $state<File[]>([]);
	let dragOver = $state(false);
	let parseError = $state('');
	let parsed = $state<ParsedJob | null>(null);
	let sourceKeys = $state<string[]>([]);
	let documents = $state<Array<{ filename: string; source_key: string; type: string }>>([]);
	let documentInventory = $state<DocumentInventory[]>([]);
	let schematicProgress = $state('');
	let parseStatus = $state('');
	let renderedPageCount = $state(0);
	let totalRenderPages = $state(0);
	let parseStartedAt = $state<number | null>(null);
	let parseNow = $state(Date.now());
	let fieldConf = $state<FieldConfidenceMap>({});
	let fieldSource = $state<Record<string, string>>({});
	let parserDurationMs = $state<number | null>(null);
	let routePreview = $state<RoutePreview | null>(null);
	let routePreviewLoading = $state(false);
	/** First-class per-field provenance + confidence keyed by dotted field path. */
	let fieldMeta = $state<Record<string, FieldMeta>>({});
	/** Structured AI-vs-validator disagreements (AI value kept). */
	let conflicts = $state<FieldConflict[]>([]);
	/** Structured-contract segments + their per-mile-range pavement specs. */
	let segments = $state<ImportContractSegment[]>([]);

	/**
	 * Fallback map center for multi-segment imports where no single representative
	 * route/midpoint was resolved (segments still carry real geometry). Uses the
	 * first drawable segment's midpoint so the overlay map can still render.
	 */
	const segmentFallbackCenter = $derived.by<{ lat: number; lng: number } | null>(() => {
		const segs = routePreview?.mapped_segments ?? [];
		for (const s of segs) {
			const coords = s.geometry?.coordinates;
			if (coords && coords.length >= 2) {
				const mid = coords[Math.floor(coords.length / 2)];
				return { lat: mid[1], lng: mid[0] };
			}
		}
		return null;
	});
	const previewLat = $derived(routePreview?.latitude ?? segmentFallbackCenter?.lat ?? null);
	const previewLng = $derived(routePreview?.longitude ?? segmentFallbackCenter?.lng ?? null);
	/** Diagnostic for whether the Workers AI fallback ran (observability). */
	let llmFallback = $state<{
		attempted: boolean;
		applied: boolean;
		reason: string;
		binding_available: boolean;
		outcome: 'applied' | 'not-needed' | 'binding-unavailable' | 'failed';
	} | null>(null);
	let aiExtraction = $state<{
		attempted: boolean;
		applied: boolean;
		outcome: 'applied' | 'deterministic-fallback' | 'binding-unavailable' | 'failed';
		model: string | null;
		duration_ms: number | null;
		reason: string;
	} | null>(null);
	/** Set of fields that were manually corrected by the user. */
	let correctedFields = $state<Set<string>>(new Set());
	let confirmedFields = $state<Set<string>>(new Set());
	/** Per-file multi-document section breakdown from the parser. */
	let documentsFound = $state<Array<{
		file_index: number;
		sections: Array<{
			type: string;
			pages: number[];
			startPage: number;
			endPage: number;
			confidence: number;
		}>;
	}>>([]);
	/** AI/regex document classification result for the primary uploaded document. */
	let classification = $state<{
		type: string;
		confidence: number;
		description: string;
		ai_used: boolean;
		message?: string;
	} | null>(null);
	/** Structured parsing report with field-level detail and suggestions. */
	let parsingReport = $state<{
		detected_type: string | null;
		confidence: number;
		extractable_fields: string[];
		missing_fields: string[];
		suggestions: string[];
		is_supported: boolean;
	} | null>(null);
	/** Filename of the primary uploaded document (for feedback submission). */
	let primaryFilename = $state('');

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const dropped = e.dataTransfer?.files;
		if (dropped) addFiles(dropped);
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) addFiles(input.files);
	}

	function addFiles(fileList: FileList) {
		const pdfs = Array.from(fileList).filter(
			(f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
		);
		if (pdfs.length === 0) {
			toastStore.error('Please select PDF files');
			return;
		}
		files = [...files, ...pdfs];
	}

	function removeFile(idx: number) {
		files = files.filter((_, i) => i !== idx);
	}

	async function uploadAndParse() {
		if (files.length === 0) return;
		step = 'parsing';
		parseError = '';
		parseStatus = 'Preparing upload';
		renderedPageCount = 0;
		totalRenderPages = 0;
		parseStartedAt = Date.now();
		parseNow = Date.now();

		const formData = new FormData();
		for (const f of files) {
			formData.append('files', f);
		}
		parseStatus = 'Rendering page evidence';
		await appendPageImageEvidence(formData, files);

		try {
			parseStatus = 'Uploading PDFs and extracting project data';
			const res = await fetch('/api/job-sites/import-pdf', {
				method: 'POST',
				body: formData,
				credentials: 'include'
			});

			parseStatus = 'Preparing review';
			const data = (await res.json()) as ImportPdfResponse;

			if (!res.ok) {
				parseError = data.error || 'Failed to parse PDF';
				parseStatus = '';
				parseStartedAt = null;
				step = 'upload';
				return;
			}

			parsed = data.parsed ?? null;
			sourceKeys = data.source_keys ?? [];
			documents = data.documents ?? [];
			documentInventory = data.document_inventory ?? [];
			fieldConf = data.field_confidence ?? {};
			fieldSource = (data as Record<string, unknown>).field_source as Record<string, string> ?? {};
			fieldMeta = data.field_meta ?? {};
			conflicts = data.conflicts ?? [];
			segments = data.segments ?? [];
			parserDurationMs = typeof (data as Record<string, unknown>).parser_duration_ms === 'number' ? (data as Record<string, unknown>).parser_duration_ms as number : null;
			routePreview = data.route_preview ?? null;
			llmFallback = data.llm_fallback ?? null;
			aiExtraction = data.ai_extraction ?? null;
			documentsFound = data.documents_found ?? [];
			if (data.document_type) {
				classification = {
					type: data.document_type,
					confidence: data.classification_confidence ?? 0,
					description: data.classification_description ?? data.document_type,
					ai_used: false,
					message: data.classification_message
				};
			} else {
				classification = null;
			}
			correctedFields = new Set();
			confirmedFields = new Set();
			resolvedConflicts = new Set();
			parsingReport = data.parsing_report ?? null;
			primaryFilename = files[0]?.name ?? '';
			parseStatus = '';
			parseStartedAt = null;
			step = 'review';
		} catch {
			parseError = 'Network error — check your connection';
			parseStatus = '';
			parseStartedAt = null;
			step = 'upload';
		}
	}

	async function appendPageImageEvidence(formData: FormData, pdfFiles: File[]) {
		if (!browser) return;
		const meta: Array<{ field: string; pdf_index: number; filename: string; page_number: number }> = [];

		try {
			const { getDocument, VerbosityLevel } = await import('pdfjs-serverless');
			for (let pdfIndex = 0; pdfIndex < pdfFiles.length; pdfIndex++) {
				const file = pdfFiles[pdfIndex];
				const data = new Uint8Array(await file.arrayBuffer());
				const pdf = await getDocument({ data, useSystemFonts: true, verbosity: VerbosityLevel.ERRORS }).promise;
				const maxPages = Math.min(pdf.numPages, 40);
				totalRenderPages += maxPages;
				for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
					parseStatus = `Rendering page evidence ${renderedPageCount + 1}/${totalRenderPages}`;
					const page = await pdf.getPage(pageNum);
					const viewport = page.getViewport({ scale: 1 });
					const longestSide = Math.max(viewport.width, viewport.height);
					const scale = Math.min(2, 1600 / Math.max(1, longestSide));
					const renderViewport = page.getViewport({ scale });
					const canvas = document.createElement('canvas');
					canvas.width = Math.floor(renderViewport.width);
					canvas.height = Math.floor(renderViewport.height);
					const ctx = canvas.getContext('2d');
					if (!ctx) continue;
					await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;
					const blob = await new Promise<Blob | null>((resolve) =>
						canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.75)
					);
					if (!blob) continue;
					const field = `page_image_${pdfIndex}_${pageNum}`;
					formData.append(field, blob, `${file.name}-page-${pageNum}.jpg`);
					meta.push({ field, pdf_index: pdfIndex, filename: file.name, page_number: pageNum });
					renderedPageCount += 1;
				}
			}
		} catch (err) {
			console.warn('Page image evidence rendering failed:', err);
		}

		if (meta.length > 0) {
			formData.append('page_image_meta', JSON.stringify(meta));
		}
	}

	function toggleItemSelected(idx: number) {
		if (!parsed) return;
		parsed.bid_items[idx].selected = !parsed.bid_items[idx].selected;
	}

	/**
	 * Mark a field as manually corrected. Called on input events for review fields.
	 * Tracks which fields the user changed for future model improvement.
	 */
	function markCorrected(fieldName: string) {
		correctedFields = new Set([...correctedFields, fieldName]);
	}

	/**
	 * Maps a flat review-field key (V1 ParsedJob shape) to its dotted
	 * `field_meta` path (structured-contract shape). Only the fields the
	 * structurer emits provenance for are listed; others fall back to the flat
	 * `field_confidence`/`field_source` maps.
	 */
	const FIELD_META_PATH: Record<string, string> = {
		county: 'county.name',
		county_number: 'county.fips',
		route_designation: 'route.designation',
		total_length_ft: 'gross_length_mi',
		gross_length_mi: 'gross_length_mi'
	};

	/** Resolve the FieldMeta for a flat review-field key, when one exists. */
	function getMeta(key: string): FieldMeta | null {
		const path = FIELD_META_PATH[key] ?? key;
		return fieldMeta[path] ?? null;
	}

	/** Page-number → human label lookup, built from the document inventory. */
	const pageLabelByNumber = $derived.by<Map<number, string>>(() => {
		const map = new Map<number, string>();
		for (const doc of documentInventory) {
			for (const page of doc.pages) {
				if (!map.has(page.page_number)) map.set(page.page_number, page.label);
			}
		}
		return map;
	});

	/** Human evidence-type label for a field's provenance line. */
	function evidenceTypeLabel(evidence: FieldMeta['evidence_type']): string {
		if (evidence === 'vision') return 'read from diagram';
		if (evidence === 'ocr') return 'OCR';
		if (evidence === 'mixed') return 'text + diagram';
		if (evidence === 'text') return 'text';
		return '';
	}

	/**
	 * One-line source provenance for a field, e.g. "from Page 10 (Typical
	 * Section), read from diagram". Empty when no source page is known.
	 */
	function provenanceLabel(meta: FieldMeta | null): string {
		if (!meta || meta.source_pages.length === 0) return '';
		const pages = meta.source_pages;
		const labels = pages.map((p) => {
			const label = pageLabelByNumber.get(p);
			return label ? `Page ${p} (${label})` : `Page ${p}`;
		});
		const evidence = evidenceTypeLabel(meta.evidence_type);
		const from = `from ${labels.join(', ')}`;
		return evidence ? `${from}, ${evidence}` : from;
	}

	/** True when a field's value was read by the vision model from a diagram. */
	function isVisionSourced(meta: FieldMeta | null): boolean {
		return meta?.evidence_type === 'vision';
	}

	/**
	 * Effective confidence for a field: a manual correction always reads high,
	 * otherwise prefer the first-class `field_meta` confidence and fall back to
	 * the flat `field_confidence` map (then 'medium' when the server scored
	 * neither). field_meta is the Phase 4 first-class source.
	 */
	function effectiveConfidence(key: string): FieldConfidence {
		if (correctedFields.has(key)) return 'high';
		return getMeta(key)?.confidence ?? fieldConf[key] ?? 'medium';
	}

	/**
	 * Inverse of {@link FIELD_META_PATH}: maps a structured-contract dotted
	 * `field_path` (as carried on a conflict) back to the flat ParsedJob key the
	 * review form edits, so "use deterministic value" can write the value.
	 */
	const CONFLICT_FIELD_KEY: Record<string, keyof ParsedJob> = {
		'county.name': 'county',
		'county.fips': 'county_number',
		'route.designation': 'route_designation',
		gross_length_mi: 'gross_length_mi',
		total_length_ft: 'total_length_ft'
	};

	/** Conflicts the user has resolved this session (by field_path). */
	let resolvedConflicts = $state<Set<string>>(new Set());

	/** Only the conflicts that still need a human decision and aren't dismissed. */
	const openConflicts = $derived(
		conflicts.filter((c) => c.resolution === 'needs_review' && !resolvedConflicts.has(c.field_path))
	);

	/** Human label for a conflict's field path (last dotted segment, spaced). */
	function conflictLabel(fieldPath: string): string {
		const last = fieldPath.split('.').pop() ?? fieldPath;
		return last.replace(/_/g, ' ').replace(/\[(\d+)\]/g, ' $1');
	}

	/** Render a conflict value (string/number/null) for display. */
	function conflictValue(value: unknown): string {
		if (value == null || value === '') return '—';
		return String(value);
	}

	/**
	 * Apply the deterministic (validator) value for a conflict, overriding the
	 * AI-primary value the form currently holds. The inverse of the old
	 * "use AI value" affordance — AI is now primary, so this lets the reviewer
	 * fall back to the validator's reading. Dismisses the conflict once applied.
	 */
	function useValidatorValue(conflict: FieldConflict) {
		const key = CONFLICT_FIELD_KEY[conflict.field_path];
		if (parsed && key) {
			const current = (parsed as unknown as Record<string, unknown>)[key];
			const next =
				typeof current === 'number'
					? Number(String(conflict.validator_value).replace(/[$,\s]/g, ''))
					: (conflict.validator_value as string | number | null);
			if (!(typeof current === 'number' && !Number.isFinite(next as number))) {
				(parsed as unknown as Record<string, unknown>)[key] = next;
				markCorrected(key as string);
			}
		}
		dismissConflict(conflict.field_path);
	}

	/** Keep the AI (current) value and clear the conflict flag. */
	function keepAiValue(conflict: FieldConflict) {
		const key = CONFLICT_FIELD_KEY[conflict.field_path];
		if (key) confirmField(key as string);
		dismissConflict(conflict.field_path);
	}

	function dismissConflict(fieldPath: string) {
		resolvedConflicts = new Set([...resolvedConflicts, fieldPath]);
	}

	// ── Pavement / Typical-Section review ────────────────────────────────────
	// The structured contract surfaces per-segment `pavement[]` typical-section
	// specs (lift thickness / mill depth / spread rate / mix / roadway width /
	// applicability mile range). Each scalar arrives as a ParsedField envelope
	// with its own confidence + source page (field_meta carries the same under a
	// dotted path). Null values render as empty editable fields — never guessed.

	/** True when any surfaced segment carries at least one pavement range. */
	const hasPavement = $derived(segments.some((s) => s.pavement.length > 0));

	/** The numeric pavement scalars rendered per range, in display order. */
	const PAVEMENT_NUMBER_FIELDS: Array<{
		key: 'lift_thickness_in' | 'mill_depth_in' | 'spread_rate_lbs_sy';
		label: string;
		step: string;
	}> = [
		{ key: 'lift_thickness_in', label: 'Lift Thickness (in)', step: '0.25' },
		{ key: 'mill_depth_in', label: 'Mill Depth (in)', step: '0.25' },
		{ key: 'spread_rate_lbs_sy', label: 'Spread Rate (lbs/yd²)', step: 'any' }
	];

	/** FieldMeta for a pavement scalar via its dotted field path. */
	function pavementMeta(
		segIdx: number,
		pvIdx: number,
		field: string
	): FieldMeta | null {
		return fieldMeta[`segments[${segIdx}].pavement[${pvIdx}].${field}`] ?? null;
	}

	/** Confidence for a pavement scalar (field_meta path, then the field's own envelope). */
	function pavementConfidence(
		env: ParsedFieldEnvelope<unknown> | null | undefined,
		segIdx: number,
		pvIdx: number,
		field: string
	): FieldConfidence {
		return pavementMeta(segIdx, pvIdx, field)?.confidence ?? env?.confidence ?? 'medium';
	}

	/** Provenance line for a pavement scalar, preferring its own citation envelope. */
	function pavementProvenance(
		env: ParsedFieldEnvelope<unknown> | null | undefined,
		segIdx: number,
		pvIdx: number,
		field: string
	): string {
		const meta = pavementMeta(segIdx, pvIdx, field);
		if (meta) return provenanceLabel(meta);
		if (env?.source_page != null) {
			return provenanceLabel({
				confidence: env.confidence,
				source_pages: [env.source_page],
				source_file: env.source_file ?? null,
				evidence_type: env.evidence_type ?? null
			});
		}
		return '';
	}

	/** Write a numeric edit back into the segment's pavement envelope. */
	function setPavementNumber(
		segIdx: number,
		pvIdx: number,
		field: 'lift_thickness_in' | 'mill_depth_in' | 'spread_rate_lbs_sy',
		raw: string
	) {
		const next = parseFloat(raw);
		segments[segIdx].pavement[pvIdx][field].value = Number.isFinite(next) ? next : null;
		markCorrected(`segments[${segIdx}].pavement[${pvIdx}].${field}`);
	}

	/** Write a mix (string) edit back into the segment's pavement envelope. */
	function setPavementMix(segIdx: number, pvIdx: number, raw: string) {
		segments[segIdx].pavement[pvIdx].mix.value = raw.trim() === '' ? null : raw;
		markCorrected(`segments[${segIdx}].pavement[${pvIdx}].mix`);
	}

	/** Write a roadway-width bound edit back into the segment's pavement envelope. */
	function setPavementWidth(
		segIdx: number,
		pvIdx: number,
		bound: 'min' | 'max',
		raw: string
	) {
		const next = parseFloat(raw);
		segments[segIdx].pavement[pvIdx].roadway_width_ft[bound].value = Number.isFinite(next)
			? next
			: null;
		markCorrected(`segments[${segIdx}].pavement[${pvIdx}].roadway_width_ft.${bound}`);
	}

	/** Human label for a pavement range's applicability (mile range or "full segment"). */
	function pavementRangeLabel(pv: ImportSegmentPavement): string {
		const from = pv.applies_from_mi?.value;
		const to = pv.applies_to_mi?.value;
		if (from != null && to != null) return `Mile ${fmtNum(from, 3)} → ${fmtNum(to, 3)}`;
		if (from != null) return `From mile ${fmtNum(from, 3)}`;
		if (to != null) return `To mile ${fmtNum(to, 3)}`;
		return 'Applies to the full segment';
	}

	/** The strongest (most-confident) citation across a pavement range's scalars. */
	function rangeSourcePage(pv: ImportSegmentPavement): number | null {
		const envs: Array<ParsedFieldEnvelope<unknown> | undefined> = [
			pv.lift_thickness_in,
			pv.mill_depth_in,
			pv.spread_rate_lbs_sy,
			pv.mix,
			pv.roadway_width_ft?.min,
			pv.roadway_width_ft?.max
		];
		for (const e of envs) {
			if (e?.source_page != null) return e.source_page;
		}
		return null;
	}

	/** Lowest confidence across a pavement range's stated scalars (the cautious read). */
	function rangeConfidence(pv: ImportSegmentPavement): 'high' | 'medium' | 'low' | null {
		const order = { low: 0, medium: 1, high: 2 } as const;
		let worst: 'high' | 'medium' | 'low' | null = null;
		const envs = [pv.lift_thickness_in, pv.mill_depth_in, pv.spread_rate_lbs_sy, pv.mix];
		for (const e of envs) {
			if (e?.value == null) continue;
			if (worst == null || order[e.confidence] < order[worst]) worst = e.confidence;
		}
		return worst;
	}

	/**
	 * Flatten the reviewed/edited structured segments into the plain-value shape
	 * `from-import` persists (its `ImportSegment[]` body). The structured contract
	 * carries each pavement scalar as a ParsedField envelope; we unwrap to plain
	 * values here (the page is the documented flattening point) — null values stay
	 * null, never fabricated. Empty when no per-segment pavement was surfaced.
	 */
	function flattenSegmentsForImport() {
		return segments
			.filter((seg) => seg.pavement.length > 0)
			.map((seg) => ({
				name: seg.name ?? '',
				kind: seg.kind,
				begin_terminus: seg.begin_terminus,
				end_terminus: seg.end_terminus,
				length_mi: seg.length_mi,
				pavement: seg.pavement.map((pv) => ({
					lift_thickness_in: pv.lift_thickness_in?.value ?? null,
					mill_depth_in: pv.mill_depth_in?.value ?? null,
					spread_rate_lbs_sy: pv.spread_rate_lbs_sy?.value ?? null,
					mix: pv.mix?.value ?? null,
					width_ft_min: pv.roadway_width_ft?.min?.value ?? null,
					width_ft_max: pv.roadway_width_ft?.max?.value ?? null,
					applies_from_mi: pv.applies_from_mi?.value ?? null,
					applies_to_mi: pv.applies_to_mi?.value ?? null,
					source_page: rangeSourcePage(pv),
					confidence: rangeConfidence(pv)
				}))
			}));
	}

	async function refreshRoutePreview() {
		if (!parsed) return;
		routePreviewLoading = true;
		try {
			const res = await fetch('/api/job-sites/import-route-preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					route_designation: parsed.route_designation,
					county: parsed.county,
					location_description: parsed.location_description,
					begin_terminus: parsed.begin_terminus,
					end_terminus: parsed.end_terminus,
					total_length_ft: parsed.total_length_ft,
					county_number: parsed.county_number,
					midpoint_easting: parsed.midpoint_easting,
					midpoint_northing: parsed.midpoint_northing,
					midpoint_zone_label: parsed.midpoint_zone_label,
					gross_length_mi: parsed.gross_length_mi,
					roadway_log_events: parsed.roadway_log_events ?? []
				}),
				credentials: 'include'
			});
			const body = (await res.json()) as { route_preview?: RoutePreview; error?: string };
			if (!res.ok || !body.route_preview) {
				toastStore.error(body.error || 'Failed to refresh route preview');
				return;
			}
			routePreview = body.route_preview;
		} catch {
			toastStore.error('Failed to refresh route preview');
		} finally {
			routePreviewLoading = false;
		}
	}

	async function createProject() {
		if (!parsed) return;
		step = 'creating';

		// Include correction metadata so the server can log it for future improvement.
		const correctionsMeta = [...correctedFields].map((f) => ({
			field: f,
			originalConfidence: fieldConf[f] ?? 'unknown'
		}));
		// Fields the user reviewed and accepted as-is (value unchanged).
		const confirmationsMeta = [...confirmedFields].map((f) => ({
			field: f,
			originalConfidence: fieldConf[f] ?? 'unknown'
		}));

		try {
			const reviewedRoute =
				routePreview &&
				(routePreview.waypoints.length >= 2 ||
					(routePreview.latitude != null && routePreview.longitude != null))
					? routePreview
					: null;
			const res = await fetch('/api/job-sites/from-import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					parsed,
					source_keys: sourceKeys,
					documents,
					paving_setup: pavingSetup,
					segments: flattenSegmentsForImport(),
					route_override: reviewedRoute
						? {
								accepted: true,
								latitude: reviewedRoute.latitude,
								longitude: reviewedRoute.longitude,
								waypoints: reviewedRoute.waypoints,
								source: reviewedRoute.source,
								location_precision: reviewedRoute.location_precision,
								events_anchored: reviewedRoute.events_anchored
							}
						: undefined,
					corrections: correctionsMeta,
					confirmations: confirmationsMeta
				}),
				credentials: 'include'
			});

			const result = await res.json() as { id?: string; error?: string };

			if (!res.ok || !result.id) {
				toastStore.error(result.error || 'Failed to create project');
				step = 'review';
				return;
			}

			// Render contract-summary plan sheets to images (client-side; the
			// Workers runtime can't render PDF pages). Best-effort — never blocks
			// project creation.
			await renderAndUploadSchematics(result.id);

			toastStore.success('Project created from PDF import');
			await goto(`/dashboard/job-sites/${result.id}`);
		} catch {
			toastStore.error('Network error — check your connection');
			step = 'review';
		}
	}

	function flipRoutePreview() {
		if (!routePreview?.waypoints?.length) return;
		// Reverse the route AND drop the baked marker coordinates so they no longer
		// reflect the old (mirrored) direction. Mirrors the onRouteSave pattern:
		// emptying projected_log_events makes the markers re-project from the
		// reversed waypoints when the project is created (source 'manual' keeps the
		// user-chosen direction through persistence).
		routePreview = {
			...routePreview,
			source: 'manual',
			location_precision: 'route',
			waypoints: [...routePreview.waypoints].reverse(),
			projected_log_events: [],
			message: 'Route direction flipped. Save this route if the roadway log runs the opposite way.'
		};
	}

	function anchorLabel(preview: RoutePreview | null): string {
		if (!preview) return 'No route anchor yet';
		if (preview.events_anchored) return 'Roadway log markers will plot on this route';
		if (preview.anchor_message === 'route-needs-trimming') return 'Trim this route to the project limits before plotting markers';
		if (preview.anchor_message === 'route-too-short') return routeTooShortLabel(preview);
		if (preview.anchor_message === 'missing-route') return 'No route available for roadway log markers';
		return 'Roadway log markers will stay list-only until the route is confirmed';
	}

	// Builds a concrete, numeric explanation for the "route is shorter than the
	// roadway log" case: actual route length vs the span implied by the furthest
	// parsed milepost, the shortfall, and what to do about it. Falls back to the
	// terse message only when the underlying numbers are unavailable.
	function routeTooShortLabel(preview: RoutePreview): string {
		const routeFt = preview.route_length_ft ?? null;
		const logFt = preview.log_span_ft ?? null;
		if (routeFt == null || logFt == null || logFt <= 0 || routeFt >= logFt) {
			return 'Route is shorter than the roadway log';
		}
		const shortFt = logFt - routeFt;
		const pct = Math.round((shortFt / logFt) * 100);
		const logMi = logFt / constant('CONST.FT_PER_MILE');
		return (
			`Route is ${fmtNum(routeFt, 0)} ft but the roadway log spans ~${fmtNum(logFt, 0)} ft ` +
			`(${fmtNum(logMi, 2)} mi of mileposts) — about ${fmtNum(shortFt, 0)} ft (${pct}%) short. ` +
			`Mileposts past the route end can't be placed; extend or redraw the route, ` +
			`or flip its direction, to cover the full log.`
		);
	}

	function routeSourceBadge(source: RoutePreview['source'] | undefined): { label: string; color: string } {
		if (source === 'gdot_lrs') return { label: 'GDOT LRS', color: '#15803d' };
		if (source === 'gdot_route') return { label: 'GDOT Authoritative', color: '#16a34a' };
		if (source === 'osm_termini_route') return { label: 'OSM Routed', color: '#2563eb' };
		if (source === 'osm_overpass') return { label: 'OSM Overpass', color: '#0891b2' };
		if (source === 'geocode') return { label: 'Geocoded Pin', color: '#d97706' };
		if (source === 'county_centroid') return { label: 'County Center', color: '#ea580c' };
		if (source === 'manual') return { label: 'User Defined', color: '#7c3aed' };
		return { label: 'No Route', color: '#6b7280' };
	}

	const evidenceSummary = $derived.by(() => {
		const evidence = documentInventory.reduce(
			(acc, doc) => {
				for (const key of Object.keys(acc) as Array<keyof DocumentInventory['evidence']>) {
					acc[key] ||= doc.evidence[key];
				}
				return acc;
			},
			{
				contract_summary: false,
				job_setup: false,
				cover_sheet: false,
				index: false,
				location_sketch: false,
				roadway_log: false,
				detailed_estimate: false
			}
		);
		return evidence;
	});

	const evidenceMissing = $derived.by(() => {
		const evidence = evidenceSummary;
		const missing: string[] = [];
		if (!evidence.contract_summary) missing.push('Contract Summary');
		if (!evidence.job_setup) missing.push('Job Setup');
		if (!evidence.location_sketch) missing.push('Location Sketch');
		if (!evidence.roadway_log) missing.push('Roadway Log');
		if (!evidence.detailed_estimate) missing.push('Detailed Estimate');
		return missing;
	});

	// Classifies a plan-sheet page from its extracted text into a human label.
	function labelForPage(text: string, pageNum: number): string {
		const t = text.toUpperCase();
		if (/SCHEDULE OF ITEMS|CONTRACT SCHEDULE|PROPOSAL\s+LINE\s+NUMBER|UNIT PRICE\s+BID AMOUNT/.test(t))
			return 'Schedule of Items';
		if (/DETAILED ESTIMATE/.test(t)) return 'Detailed Estimate';
		if (/ROADWAY\s+LOG|\bLOG\b.*WIDTH/.test(t)) return 'Roadway Log';
		if (/TYPICAL SECTION/.test(t)) return 'Typical Section';
		if (/GENERAL NOTES/.test(t)) return 'General Notes';
		if (/EROSION CONTROL/.test(t)) return 'Erosion Control Plan';
		if (/LOCATION SKETCH/.test(t)) return 'Location Sketch';
		if (/SPECIAL PROVISION/.test(t)) return 'Special Provision';
		if (/PROPOSAL INDEX|^\s*INDEX\b|\bINDEX\b\s+\d/.test(t)) return 'Index';
		if (/COVER SHEET|PLAN OF PROPOSED|DEPARTMENT OF TRANSPORTATION/.test(t) && pageNum <= 2)
			return 'Cover Sheet';
		if (/NOTICE TO|BIDDERS|PROPOSAL/.test(t) && pageNum <= 2) return 'Proposal';
		return `Sheet ${pageNum}`;
	}

	// Renders each page of the uploaded Contract Summary PDF to a PNG and uploads
	// it as a schematic. Uses the browser's canvas via pdfjs-serverless.
	async function renderAndUploadSchematics(jobSiteId: string) {
		const contractDoc = documents.find((d) => d.type === 'contract_summary');
		if (!contractDoc) return;
		const file = files.find((f) => f.name === contractDoc.filename);
		if (!file) return;

		try {
			const { getDocument, VerbosityLevel } = await import('pdfjs-serverless');
			const data = new Uint8Array(await file.arrayBuffer());
			const pdf = await getDocument({ data, useSystemFonts: true, verbosity: VerbosityLevel.ERRORS }).promise;
			const maxPages = Math.min(pdf.numPages, 40);

			for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
				schematicProgress = `Rendering plan sheet ${pageNum} of ${maxPages}…`;
				const page = await pdf.getPage(pageNum);

				// Pull the page text so we can give it a meaningful label.
				let label = `Sheet ${pageNum}`;
				try {
					const content = await page.getTextContent();
					const pageText = content.items
						.map((it: unknown) =>
							it && typeof it === 'object' && 'str' in it ? (it as { str: string }).str : ''
						)
						.join(' ');
					label = labelForPage(pageText, pageNum);
				} catch {
					// keep default label
				}

				const viewport = page.getViewport({ scale: 2 });
				const canvas = document.createElement('canvas');
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				const ctx = canvas.getContext('2d');
				if (!ctx) continue;
				await page.render({ canvasContext: ctx, viewport, canvas }).promise;

				const blob: Blob | null = await new Promise((resolve) =>
					canvas.toBlob((b) => resolve(b), 'image/png')
				);
				if (!blob) continue;

				const fd = new FormData();
				fd.append('image', blob, `page-${pageNum}.png`);
				fd.append('page_number', String(pageNum));
				fd.append('label', label);
				await fetch(`/api/job-sites/${jobSiteId}/schematics`, {
					method: 'POST',
					body: fd,
					credentials: 'include'
				});
			}
		} catch (err) {
			// Schematic rendering is best-effort; the project is already created.
			console.error('Schematic render failed', err);
		} finally {
			schematicProgress = '';
		}
	}

	function sourceLabel(fieldName: string): string {
		const src = fieldSource[fieldName];
		if (!src) return '';
		if (src.includes('deterministic+ai')) return 'Parser + AI';
		if (src.startsWith('ai:')) return src.replace(/^ai:/, 'AI ');
		if (src.includes('llm')) return 'AI fallback';
		if (src.includes('table')) return 'Table parser';
		if (src.includes('regex')) return 'Regex parser';
		if (src.includes('zone')) return 'Zone extractor';
		return src;
	}

	function fmtDollars(v: number | null): string {
		if (v == null) return '—';
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
	}

	function fmtNum(v: number | null, decimals = 1): string {
		if (v == null) return '—';
		return v.toLocaleString('en-US', { maximumFractionDigits: decimals });
	}

	const bidTotal = $derived(
		parsed?.bid_items
			.filter((it) => it.selected)
			.reduce((sum, it) => sum + (it.bid_amount ?? 0), 0) ?? 0
	);

	type ContractReconcile = {
		status: 'match' | 'over' | 'under' | 'unknown';
		deltaAbs: number;
		deltaPct: number;
	};

	const contractReconcile = $derived.by((): ContractReconcile => {
		const contract = parsed?.contract_amount ?? null;
		if (contract == null) {
			return { status: 'unknown', deltaAbs: 0, deltaPct: 0 };
		}
		const diff = bidTotal - contract;
		const deltaAbs = Math.abs(diff);
		const deltaPct = contract !== 0 ? (deltaAbs / contract) * 100 : 0;
		// Presentation tolerance: ignore rounding noise — within $1 or 0.5% of the contract amount.
		const tolerance = Math.max(1, contract * 0.005);
		if (deltaAbs <= tolerance) {
			return { status: 'match', deltaAbs, deltaPct };
		}
		return { status: diff > 0 ? 'over' : 'under', deltaAbs, deltaPct };
	});

	const groupedItems = $derived.by(() => {
		if (!parsed) return new Map<string, ParsedBidItem[]>();
		const map = new Map<string, ParsedBidItem[]>();
		for (const it of parsed.bid_items) {
			const key = it.section || 'Other';
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(it);
		}
		return map;
	});

	/** Current parsed value for a field key, for filled-vs-empty decisions. */
	function fieldValue(key: string): unknown {
		if (!parsed) return null;
		return (parsed as unknown as Record<string, unknown>)[key];
	}

	/** Map of every rendered review field key -> its current parsed value. */
	const reviewValues = $derived.by<Record<string, unknown>>(() => {
		const out: Record<string, unknown> = {};
		for (const f of ALL_REVIEW_FIELDS) out[f.key] = fieldValue(f.key);
		return out;
	});

	/**
	 * How many fields still need the user's attention: low-confidence-and-empty
	 * (needs input) plus low-confidence-and-filled-but-unconfirmed (verify).
	 * Drops to zero once the user fills or confirms them.
	 */
	const needsAttentionCount = $derived.by(() => {
		if (!parsed) return 0;
		return countNeedsAttention(mergedFieldConf, reviewValues, correctedFields, confirmedFields);
	});

	/**
	 * Confidence map that drives the review states. First-class `field_meta`
	 * (Phase 4) supplements the flat `field_confidence` map: where the structurer
	 * emitted provenance for a field, its confidence wins; otherwise the flat map
	 * value is kept. Keyed by the flat review-field key so the existing
	 * needs-input / verify / ok logic consumes it unchanged.
	 */
	const mergedFieldConf = $derived.by<FieldConfidenceMap>(() => {
		const merged: FieldConfidenceMap = { ...fieldConf };
		for (const f of ALL_REVIEW_FIELDS) {
			const meta = getMeta(f.key);
			if (meta) merged[f.key] = meta.confidence;
		}
		return merged;
	});

	/**
	 * Get confidence for a field. If user has corrected it, treat as high
	 * so the indicator reflects their manual override.
	 */
	function getConf(fieldName: string): FieldConfidence {
		return displayedConfidence(fieldName, mergedFieldConf, correctedFields);
	}

	/** Resolved review state (needs-input | verify | ok) for a rendered field. */
	function getState(fieldName: string): FieldState {
		return fieldState(fieldName, fieldValue(fieldName), mergedFieldConf, correctedFields, confirmedFields);
	}

	/** Confirm a filled low-confidence field WITHOUT changing its value. */
	function confirmField(fieldName: string) {
		confirmedFields = new Set([...confirmedFields, fieldName]);
	}

	/** Confirm every remaining filled-but-unverified field in one action. */
	function confirmAllRemaining() {
		const next = new Set(confirmedFields);
		for (const f of ALL_REVIEW_FIELDS) {
			if (getState(f.key) === 'verify') next.add(f.key);
		}
		confirmedFields = next;
	}

	$effect(() => {
		if (step !== 'parsing') return;
		const id = window.setInterval(() => {
			parseNow = Date.now();
		}, 1000);
		return () => window.clearInterval(id);
	});

	const parseElapsedSeconds = $derived(
		parseStartedAt == null ? 0 : Math.max(0, Math.floor((parseNow - parseStartedAt) / 1000))
	);

	const parsePhase = $derived.by(() => {
		if (parseStatus.includes('Preparing')) return 0;
		if (parseStatus.includes('Rendering')) return 1;
		if (parseStatus.includes('Uploading')) {
			if (parseElapsedSeconds < 12) return 2;
			if (parseElapsedSeconds < 28) return 3;
			if (parseElapsedSeconds < 45) return 4;
			return 5;
		}
		if (parseStatus.includes('Preparing review')) return 6;
		return 2;
	});

	const parsePhaseLabel = $derived.by(() => {
		if (parsePhase === 0) return 'Preparing upload';
		if (parsePhase === 1) return parseStatus || 'Rendering page evidence';
		if (parsePhase === 2) return 'Reading PDF text and page evidence';
		if (parsePhase === 3) return 'Running AI extraction on project fields and tables';
		if (parsePhase === 4) return 'Comparing AI results with deterministic parser output';
		if (parsePhase === 5) return 'Resolving route, county, and map preview';
		return 'Preparing review';
	});

	const parsePhaseDetail = $derived.by(() => {
		if (parsePhase === 1 && totalRenderPages > 0) {
			return `${renderedPageCount} of ${totalRenderPages} pages rendered for AI evidence`;
		}
		if (parsePhase === 3) return 'This is usually the longest step for multi-page contract summaries.';
		if (parsePhase === 4) return 'Conflicts will be shown on the review screen so you can choose the better value.';
		if (parsePhase === 5) return 'External GDOT and geocoding services can add time here.';
		return 'Keep this tab open while the import finishes.';
	});

	const parseSteps = $derived([
		'Prepare',
		'Render pages',
		'Read PDF',
		'AI extraction',
		'Validate',
		'Route lookup',
		'Review'
	]);

	// ── Paving Setup (import review) ─────────────────────────────────────────
	// Road Type, Number of Lanes, Lane Width, Target Thickness and Target Spread
	// Rate are completeness-required config fields that contracts/plans don't
	// reliably carry. The deterministic parser only extracts lane count / width /
	// spread rate when a roadway-log sheet is present, and road type / target
	// thickness are never in the document at all. So instead of leaving every
	// imported project mysteriously incomplete, the user fills these here during
	// review — pre-filled from parsed values where the document had them, and
	// otherwise from the org's remembered defaults. Nothing is fabricated: when no
	// value can be sourced the input is simply left empty for the user to enter.
	interface PavingSetupForm {
		road_type: string | null;
		num_lanes: number | null;
		lane_width_ft: number | null;
		target_thickness_in: number | null;
		target_spread_rate: number | null;
	}

	const PAVING_ROAD_TYPES: Array<{ value: string; label: string }> = [
		{ value: 'highway', label: 'Highway' },
		{ value: 'state_route', label: 'State Route' },
		{ value: 'county_road', label: 'County Road' },
		{ value: 'city_street', label: 'City Street' },
		{ value: 'subdivision', label: 'Subdivision' },
		{ value: 'parking_lot', label: 'Parking Lot' },
		{ value: 'other', label: 'Other' }
	];

	let pavingSetup = $state<PavingSetupForm>({
		road_type: null,
		num_lanes: null,
		lane_width_ft: null,
		target_thickness_in: null,
		target_spread_rate: null
	});
	let pavingSetupSeeded = $state(false);

	/**
	 * Map the parsed contract route_designation to a sensible default road type
	 * (only when the document clearly implies one). Never guesses beyond the
	 * naming convention — falls back to null so the user picks.
	 */
	function roadTypeFromDesignation(designation: string | null | undefined): string | null {
		if (!designation) return null;
		const d = designation.trim().toUpperCase();
		if (/^I[- ]?\d/.test(d) || /\bINTERSTATE\b/.test(d)) return 'highway';
		if (/^(SR|GA|US)[- ]?\d/.test(d) || /\bSTATE ROUTE\b/.test(d) || /\bUS \d/.test(d)) return 'state_route';
		if (/^(CR|CO)[- ]?\d/.test(d) || /\bCOUNTY (ROAD|RD)\b/.test(d)) return 'county_road';
		return null;
	}

	/**
	 * Seed the Paving Setup form once review is reached: parsed roadway-log values
	 * first, then org-remembered defaults, then a thickness→spread-rate derivation
	 * (THICK_MULT lbs/SY per inch) so the active mix has a starting spread target.
	 */
	function seedPavingSetup() {
		if (pavingSetupSeeded || !parsed) return;
		const p = parsed as unknown as Record<string, unknown>;
		const orgDefaults = orgSettingsStore.resolvedDefaults as Record<string, unknown>;

		const parsedNum = (key: string): number | null => {
			const v = p[key];
			return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
		};

		const laneWidth =
			parsedNum('lane_width_ft') ??
			(typeof orgDefaults.roadWidthFt === 'number' ? orgDefaults.roadWidthFt : null) ??
			config.defaults.roadWidthFt ??
			null;
		const thickness =
			typeof orgDefaults.liftThicknessIn === 'number' && orgDefaults.liftThicknessIn > 0
				? orgDefaults.liftThicknessIn
				: null;
		const spread =
			parsedNum('spread_rate_lbs_sy') ??
			(thickness != null ? Math.round(thickness * constant('CONST.THICK_MULT')) : null);
		// Variable-depth mill-and-fill jobs (e.g. SR 7 ALT) state a spread rate but
		// no fixed lift thickness. When we have a real parsed/derived spread rate
		// but no org-default thickness, back-derive thickness from spread via the
		// same THICK_MULT relationship so the field reflects the document instead
		// of asking the user blank. Not fabricated — it's the inverse of the
		// spread = thickness * THICK_MULT derivation used above.
		const thicknessSeed =
			thickness ??
			(spread != null ? Math.round((spread / constant('CONST.THICK_MULT')) * 10) / 10 : null);

		pavingSetup = {
			road_type: roadTypeFromDesignation(parsed.route_designation),
			num_lanes: parsedNum('num_lanes'),
			lane_width_ft: laneWidth,
			target_thickness_in: thicknessSeed,
			target_spread_rate: spread
		};
		pavingSetupSeeded = true;
	}

	$effect(() => {
		if (step === 'review' && parsed && !pavingSetupSeeded) {
			seedPavingSetup();
		}
	});

	const pavingSetupComplete = $derived(
		Boolean(pavingSetup.road_type) &&
			pavingSetup.num_lanes != null &&
			pavingSetup.num_lanes > 0 &&
			pavingSetup.lane_width_ft != null &&
			pavingSetup.lane_width_ft > 0 &&
			pavingSetup.target_thickness_in != null &&
			pavingSetup.target_thickness_in > 0 &&
			pavingSetup.target_spread_rate != null &&
			pavingSetup.target_spread_rate > 0
	);
</script>

<svelte:head>
	<title>Import from PDF — {config.app.name}</title>
</svelte:head>

<div class="dashboard import-page">
	<div class="breadcrumb">
		<a href="/dashboard">Projects</a>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
		<span>Import from PDF</span>
	</div>

	{#if step === 'upload' || step === 'parsing'}
		<div class="page-header">
			<h2 class="page-title">Import Project from PDF</h2>
			<p class="page-subtitle">Upload a GDOT Contract Summary and/or Job Setup form to auto-fill a new project.</p>
		</div>

		{#if parseError}
			<div class="error-banner">{parseError}</div>
		{/if}

		<div
			class="drop-zone"
			class:drag-over={dragOver}
			role="group"
			aria-label="PDF file drop zone"
			ondragover={(e) => { e.preventDefault(); dragOver = true; }}
			ondragleave={() => (dragOver = false)}
			ondrop={handleDrop}
		>
			<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
				<line x1="12" y1="18" x2="12" y2="12"></line>
				<line x1="9" y1="15" x2="12" y2="12"></line>
				<line x1="15" y1="15" x2="12" y2="12"></line>
			</svg>
			<p class="drop-text">Drag & drop PDF files here</p>
			<p class="drop-sub">or</p>
			<label class="btn btn-primary file-btn">
				Choose Files
				<input type="file" accept=".pdf,application/pdf" multiple onchange={handleFileInput} hidden />
			</label>
		</div>

		{#if files.length > 0}
			<div class="file-list">
				{#each files as file, i}
					<div class="file-item">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
						</svg>
						<span class="file-name">{file.name}</span>
						<span class="file-size">{(file.size / 1024).toFixed(0)} KB</span>
						<button class="file-remove" onclick={() => removeFile(i)} aria-label="Remove">×</button>
					</div>
				{/each}
			</div>

			<button class="btn btn-primary parse-btn" onclick={uploadAndParse} disabled={step === 'parsing'}>
				{step === 'parsing' ? 'Parsing…' : 'Upload & Parse'}
			</button>
		{/if}

	{:else if step === 'review' && parsed}
		{#snippet fieldVisionIndicator(key: string)}
			{@const meta = getMeta(key)}
			{#if isVisionSourced(meta)}
				<span class="vision-field-icon" title="AI read this from a diagram image (vision)" aria-label="read from diagram">&#x1F441;</span>
			{:else if fieldSource[key]?.includes('llm') || fieldSource[key]?.includes('ai:')}
				<span class="ai-field-icon" title="Value filled by AI extraction" aria-label="AI filled">&#x2736;</span>
			{/if}
		{/snippet}
		{#snippet fieldProvenance(key: string)}
			{@const meta = getMeta(key)}
			{@const provenance = provenanceLabel(meta)}
			{#if provenance}
				<span class="field-provenance">{provenance}</span>
			{/if}
		{/snippet}
		<div class="page-header">
			<h2 class="page-title">Review Import</h2>
			<p class="page-subtitle">Verify the parsed data before creating the project.</p>
		</div>

		{#if classification}
			<div class="classification-badge" class:low-conf={classification.confidence < 0.5}>
				{#if classification.confidence >= 0.5}
					<span class="badge-icon">📄</span>
					<span class="badge-label">
						Identified as: <strong>{classification.description}</strong>
						({Math.round(classification.confidence * 100)}% confident){#if classification.ai_used}<span class="ai-tag">AI</span>{/if}
					</span>
				{:else}
					<span class="badge-icon">⚠️</span>
					<span class="badge-label">
						{classification.message ?? "We couldn't identify this document type."}
					</span>
				{/if}
			</div>
		{/if}

		{#if parsed}
		<details class="extraction-report">
			<summary>Extraction Report</summary>
			<div class="extraction-report-body">
				{#snippet reportContent()}
					{@const totalFields = ALL_REVIEW_FIELDS.length}
					{@const extractedCount = ALL_REVIEW_FIELDS.filter(f => !isEmptyValue((parsed as unknown as Record<string, unknown>)[f.key])).length}
					{@const highCount = ALL_REVIEW_FIELDS.filter(f => (fieldConf[f.key] ?? 'medium') === 'high').length}
					{@const medCount = ALL_REVIEW_FIELDS.filter(f => (fieldConf[f.key] ?? 'medium') === 'medium').length}
					{@const lowCount = ALL_REVIEW_FIELDS.filter(f => (fieldConf[f.key] ?? 'medium') === 'low').length}
					{@const totalPages = documentInventory.reduce((sum, d) => sum + d.page_count, 0)}
					{@const aiStatus = aiExtraction?.outcome ?? 'deterministic-fallback'}
					<div class="report-grid">
					<div class="report-stat">
						<span class="stat-label">Fields extracted</span>
						<span class="stat-value">{extractedCount}/{totalFields}</span>
					</div>
					<div class="report-stat">
						<span class="stat-label">High confidence</span>
						<span class="stat-value stat-high">{highCount}</span>
					</div>
					<div class="report-stat">
						<span class="stat-label">Medium confidence</span>
						<span class="stat-value stat-medium">{medCount}</span>
					</div>
					<div class="report-stat">
						<span class="stat-label">Low confidence</span>
						<span class="stat-value stat-low">{lowCount}</span>
					</div>
					<div class="report-stat">
						<span class="stat-label">Pages analyzed</span>
						<span class="stat-value">{totalPages}</span>
					</div>
					{#if parserDurationMs != null}
					<div class="report-stat">
						<span class="stat-label">Parse time</span>
						<span class="stat-value">{parserDurationMs}ms</span>
					</div>
					{/if}
					<div class="report-stat">
						<span class="stat-label">AI extraction</span>
						<span class="stat-value"
							class:stat-high={aiStatus === 'applied'}
							class:stat-medium={aiStatus === 'deterministic-fallback'}
							class:stat-low={aiStatus === 'failed'}>
							{aiStatus === 'applied' ? 'Applied' : aiStatus === 'deterministic-fallback' ? 'Fallback' : aiStatus === 'binding-unavailable' ? 'Unavailable' : 'Failed'}
						</span>
					</div>
					</div>
				{/snippet}
				{@render reportContent()}
			</div>
		</details>
		{/if}

		{#if parsingReport}
			<DocumentFeedback
				report={parsingReport}
				filename={primaryFilename}
			/>
		{/if}

		<div class="doc-status">
			<span class="doc-chip" class:present={parsed.has_contract_summary}>
				{parsed.has_contract_summary ? '✓' : '○'} Contract Summary
			</span>
			<span class="doc-chip" class:present={parsed.has_job_setup}>
				{parsed.has_job_setup ? '✓' : '○'} Job Setup
			</span>
			{#if aiExtraction?.attempted}
				<span
					class="doc-chip"
					class:present={aiExtraction.applied}
					title={aiExtraction.applied
						? 'Workers AI extracted sourced project fields'
						: aiExtraction.outcome === 'deterministic-fallback'
							? 'Deterministic parsing was used for the project fields'
							: aiExtraction.outcome === 'binding-unavailable'
								? 'Workers AI is not available in this environment'
								: `AI extraction failed (${aiExtraction.reason})`}
				>
					{#if aiExtraction.applied}
						✓ AI extraction applied
					{:else if aiExtraction.outcome === 'deterministic-fallback'}
						✓ Deterministic fallback
					{:else if aiExtraction.outcome === 'binding-unavailable'}
						○ AI extraction unavailable
					{:else}
						○ AI extraction failed
					{/if}
				</span>
			{/if}
		</div>

		{#if needsAttentionCount > 0}
			<div class="conf-alert">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"></circle>
					<line x1="12" y1="8" x2="12" y2="12"></line>
					<line x1="12" y1="16" x2="12.01" y2="16"></line>
				</svg>
				<span>
					<strong>{needsAttentionCount} field{needsAttentionCount === 1 ? '' : 's'} need a look</strong>
					— empty fields are marked <span class="inline-badge conf-low" aria-label="needs input">!</span>
					(needs input); filled-but-unsure fields are marked
					<span class="inline-badge conf-verify" aria-label="verify">?</span> — confirm or edit them.
				</span>
				<button type="button" class="btn btn-ghost btn-sm confirm-all-btn" onclick={confirmAllRemaining}>
					Confirm all
				</button>
			</div>
		{:else if Object.keys(fieldConf).length > 0}
			<div class="conf-ok">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="20 6 9 17 4 12"></polyline>
				</svg>
				All fields reviewed.
			</div>
		{/if}

		{#if !parsed.has_contract_summary || !parsed.has_job_setup}
			<div class="missing-doc-banner">
				<strong>Heads up — you're missing a document.</strong>
				<span>
					{#if !parsed.has_contract_summary && !parsed.has_job_setup}
						Neither the Contract Summary nor the Job Setup was recognized.
					{:else if !parsed.has_contract_summary}
						The <b>Contract Summary</b> wasn't included — bid items, contract value and project geometry will be incomplete. Add it for a full picture.
					{:else}
						The <b>Job Setup</b> wasn't included — production goals, customer/owner and asphalt supplier will be incomplete. Add it for a full picture.
					{/if}
				</span>
				<button class="btn btn-ghost btn-sm" onclick={() => { step = 'upload'; }}>Add more PDFs</button>
			</div>
		{/if}

		{#if documentInventory.length > 0}
			<section class="review-section document-inventory">
				<div class="route-preview-head">
					<div>
						<h3>Import Evidence</h3>
						<p>PDFs and plan sheets detected during import review.</p>
					</div>
					{#if evidenceMissing.length > 0}
						<span class="evidence-warn">{evidenceMissing.length} missing</span>
					{:else}
						<span class="evidence-ok">Complete</span>
					{/if}
				</div>
				<div class="evidence-chips">
					<span class:present={evidenceSummary.contract_summary}>Contract Summary</span>
					<span class:present={evidenceSummary.job_setup}>Job Setup</span>
					<span class:present={evidenceSummary.location_sketch}>Location Sketch</span>
					<span class:present={evidenceSummary.roadway_log}>Roadway Log</span>
					<span class:present={evidenceSummary.detailed_estimate}>Detailed Estimate</span>
				</div>
				{#if evidenceMissing.length > 0}
					<p class="section-hint">
						Missing evidence will not block creation, but route/log markers stay review-only until the route is confirmed.
					</p>
				{/if}
				<div class="document-list">
					{#each documentInventory as doc}
						<div class="document-card">
							<div>
								<strong>{doc.filename}</strong>
								<span>{doc.type.replace(/_/g, ' ')} · {doc.page_count} page{doc.page_count === 1 ? '' : 's'}</span>
							</div>
							<div class="page-labels">
								{#each doc.pages.slice(0, 8) as page}
									<span>{page.page_number}: {page.label}</span>
								{/each}
								{#if doc.pages.length > 8}
									<span>+{doc.pages.length - 8} more</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if openConflicts.length > 0}
			<div class="conflicts-panel">
				<div class="conflicts-head">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
						<line x1="12" y1="9" x2="12" y2="13"></line>
						<line x1="12" y1="17" x2="12.01" y2="17"></line>
					</svg>
					<span>
						<strong>{openConflicts.length} value{openConflicts.length === 1 ? '' : 's'} to verify</strong>
						— the AI reading is kept as primary; review where the deterministic parser disagreed.
					</span>
				</div>
				{#each openConflicts as conflict (conflict.field_path)}
					<div class="conflict-review">
						<div class="conflict-info">
							<strong>{conflictLabel(conflict.field_path)}</strong>
							<span class="conflict-ai">AI value (kept): {conflictValue(conflict.ai_value)}</span>
							<span class="conflict-validator">Parser read: {conflictValue(conflict.validator_value)}</span>
						</div>
						<div class="conflict-actions">
							<button
								type="button"
								class="btn btn-ghost btn-small"
								onclick={() => useValidatorValue(conflict)}
								disabled={!CONFLICT_FIELD_KEY[conflict.field_path]}
								title={CONFLICT_FIELD_KEY[conflict.field_path]
									? 'Replace the AI value with the deterministic parser value'
									: 'This field is reviewed in its own section below'}
							>
								Use parser value
							</button>
							<button type="button" class="btn btn-ghost btn-small conflict-keep" onclick={() => keepAiValue(conflict)}>
								Keep AI value
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if parsed.warnings.length > 0}
			<div class="warnings">
				{#each parsed.warnings as w}
					<div class="warning-item">{w}</div>
				{/each}
			</div>
		{/if}

		<!-- Confidence legend -->
		{#if Object.keys(fieldConf).length > 0}
			<div class="conf-legend">
				<span class="legend-item">
					<span class="conf-dot conf-high" aria-hidden="true"></span> High confidence
				</span>
				<span class="legend-item">
					<span class="conf-dot conf-medium" aria-hidden="true"></span> Medium — verify
				</span>
				<span class="legend-item">
					<span class="conf-badge conf-verify" aria-hidden="true">?</span> Verify — filled, confirm it
				</span>
				<span class="legend-item">
					<span class="conf-badge conf-low" aria-hidden="true">!</span> Needs input — empty
				</span>
				{#if correctedFields.size > 0 || confirmedFields.size > 0}
					<span class="legend-item corrected-count">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<polyline points="20 6 9 17 4 12"></polyline>
						</svg>
						{correctedFields.size + confirmedFields.size} reviewed
					</span>
				{/if}
			</div>
		{/if}

		{#if documentsFound.some(f => f.sections.length > 1)}
			<section class="review-section multi-doc-section">
				<h3>Multi-Document PDF Detected</h3>
				{#each documentsFound.filter(f => f.sections.length > 1) as fileDoc}
					{@const filename = documents[fileDoc.file_index]?.filename ?? `File ${fileDoc.file_index + 1}`}
					<div class="multi-doc-file">
						<div class="multi-doc-filename">{filename}</div>
						<p class="multi-doc-hint">Found {fileDoc.sections.length} document sections in this file:</p>
						<div class="multi-doc-chips">
							{#each fileDoc.sections as section}
								<span class="multi-doc-chip">
									<span class="multi-doc-type">{section.type === 'contract_summary' ? 'Contract Summary' : section.type === 'job_setup' ? 'Job Setup' : 'Unknown'}</span>
									<span class="multi-doc-pages">pp. {section.startPage}–{section.endPage}</span>
									<span class="multi-doc-conf">{Math.round(section.confidence * 100)}%</span>
								</span>
							{/each}
						</div>
					</div>
				{/each}
			</section>
		{/if}

		<section class="review-section">
			<h3>Project Information</h3>
			<div class="review-grid">
				<!-- Fields needing attention first -->
				{#each PROJECT_FIELDS.slice().sort((a, b) => {
					const rank = { 'needs-input': 0, verify: 1, ok: 2 } as const;
					return rank[getState(a.key)] - rank[getState(b.key)];
				}) as f}
					{@const conf = getConf(f.key)}
					{@const state = getState(f.key)}
					<div class="review-field" class:field-low={state === 'needs-input'} class:field-verify={state === 'verify'} class:field-corrected={state === 'ok' && (correctedFields.has(f.key) || confirmedFields.has(f.key))}>
						<div class="field-label-row">
							<label for="field-{f.key}">{f.label}</label>
							{#if state === 'needs-input'}
								<span class="conf-badge conf-low" title="Empty — needs input" aria-label="needs input">!</span>
							{:else if state === 'verify'}
								<span class="conf-badge conf-verify" title={sourceLabel(f.key) ? 'Filled but unverified — confirm or edit • Source: ' + sourceLabel(f.key) : 'Filled but unverified — confirm or edit'} aria-label="verify">?</span>
							{:else if conf === 'medium'}
								<span class="conf-dot conf-medium" title={sourceLabel(f.key) ? 'Medium confidence — verify this value • Source: ' + sourceLabel(f.key) : 'Medium confidence — verify this value'} aria-label="medium confidence"></span>
							{:else}
								<span class="conf-dot conf-high" title={sourceLabel(f.key) ? 'High confidence • Source: ' + sourceLabel(f.key) : 'High confidence'} aria-label="high confidence"></span>
							{/if}
							{@render fieldVisionIndicator(f.key)}
							{#if state === 'verify'}
								<button type="button" class="confirm-field-btn" title="Looks right" aria-label="Confirm {f.label}" onclick={() => confirmField(f.key)}>✓</button>
							{/if}
						</div>
						{#if f.type === 'number'}
							<input
								id="field-{f.key}"
								type="number"
								step="0.01"
								value={(parsed as unknown as Record<string, unknown>)[f.key] as number | null}
								oninput={(e) => {
									(parsed as unknown as Record<string, unknown>)[f.key] = parseFloat((e.target as HTMLInputElement).value) || null;
									markCorrected(f.key);
								}}
								class:input-low={state === 'needs-input'}
							/>
						{:else}
							<input
								id="field-{f.key}"
								type="text"
								value={(parsed as unknown as Record<string, unknown>)[f.key] as string | null ?? ''}
								oninput={(e) => {
									(parsed as unknown as Record<string, unknown>)[f.key] = (e.target as HTMLInputElement).value || null;
									markCorrected(f.key);
								}}
								class:input-low={state === 'needs-input'}
							/>
						{/if}
						{@render fieldProvenance(f.key)}
					</div>
				{/each}
			</div>

			{#if parsed.roadway_log_events?.length}
				<div class="roadway-log-preview">
					<div class="route-preview-head">
						<div>
							<h4>Imported Roadway Log</h4>
							<p>These mile markers will be placed on the confirmed road route after project creation.</p>
						</div>
						<span class="log-count">{parsed.roadway_log_events.length} events</span>
					</div>
					<div class="roadway-log-table">
						{#each parsed.roadway_log_events as event}
							<div class="roadway-log-row" class:reference={event.is_reference}>
								<span class="log-mile">{event.milepost.toFixed(3)}</span>
								<span class="log-type">{event.event_type.replace(/_/g, ' ')}</span>
								<span class="log-desc">{event.description}</span>
								{#if event.roadway_width_ft}
									<span class="log-width">{event.roadway_width_ft} ft</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<section class="review-section">
			<h3>Location &amp; Route</h3>
			<p class="section-hint">Route designation drives automatic map/route lookup. Verify or fill it so Work Zones get coordinates.</p>
			<div class="review-grid">
				{#each LOCATION_FIELDS.slice().sort((a, b) => {
					const rank = { 'needs-input': 0, verify: 1, ok: 2 } as const;
					return rank[getState(a.key)] - rank[getState(b.key)];
				}) as f}
					{@const conf = getConf(f.key)}
					{@const state = getState(f.key)}
					<div class="review-field" class:field-low={state === 'needs-input'} class:field-verify={state === 'verify'} class:field-corrected={state === 'ok' && (correctedFields.has(f.key) || confirmedFields.has(f.key))}>
						<div class="field-label-row">
							<label for="field-{f.key}">{f.label}</label>
							{#if state === 'needs-input'}
								<span class="conf-badge conf-low" title="Empty — needs input" aria-label="needs input">!</span>
							{:else if state === 'verify'}
								<span class="conf-badge conf-verify" title={sourceLabel(f.key) ? 'Filled but unverified — confirm or edit • Source: ' + sourceLabel(f.key) : 'Filled but unverified — confirm or edit'} aria-label="verify">?</span>
							{:else if conf === 'medium'}
								<span class="conf-dot conf-medium" title={sourceLabel(f.key) ? 'Medium confidence — verify this value • Source: ' + sourceLabel(f.key) : 'Medium confidence — verify this value'} aria-label="medium confidence"></span>
							{:else}
								<span class="conf-dot conf-high" title={sourceLabel(f.key) ? 'High confidence • Source: ' + sourceLabel(f.key) : 'High confidence'} aria-label="high confidence"></span>
							{/if}
							{@render fieldVisionIndicator(f.key)}
							{#if state === 'verify'}
								<button type="button" class="confirm-field-btn" title="Looks right" aria-label="Confirm {f.label}" onclick={() => confirmField(f.key)}>✓</button>
							{/if}
						</div>
						<input
							id="field-{f.key}"
							type="text"
							value={(parsed as unknown as Record<string, unknown>)[f.key] as string | null ?? ''}
							oninput={(e) => {
								(parsed as unknown as Record<string, unknown>)[f.key] = (e.target as HTMLInputElement).value || null;
								markCorrected(f.key);
							}}
							class:input-low={state === 'needs-input'}
						/>
						{@render fieldProvenance(f.key)}
					</div>
				{/each}
			</div>

			<div class="route-preview">
				<div class="route-preview-head">
					<div>
						<h4>Route Preview</h4>
						<p>{routePreview?.message ?? 'No route preview has been resolved yet.'}</p>
						<div class="route-status-row">
							<span class="route-source-badge" style="background:{routeSourceBadge(routePreview?.source).color}; color:#fff; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600">{routeSourceBadge(routePreview?.source).label}</span>
							{#if parsed.route_designation}
								<span>Parsed route: {parsed.route_designation}</span>
							{/if}
							{#if routePreview?.route_length_ft}
								<span>{fmtNum(routePreview.route_length_ft, 0)} ft route</span>
							{/if}
						</div>
						{#if parsed.roadway_log_events?.length}
							<p class="anchor-status" class:anchored={routePreview?.events_anchored}>
								{anchorLabel(routePreview)}
							</p>
						{:else}
							<p class="anchor-status">No roadway-log mileposts were parsed from these PDFs.</p>
						{/if}
						{#if routePreview?.route_source_detail}
							<p class="lrs-detail">
								LRS {routePreview.route_source_detail.routeCode}
								{#if routePreview.route_source_detail.county}
									· county {routePreview.route_source_detail.county}
								{/if}
								· {routePreview.route_source_detail.crs}
								· mid-point {routePreview.route_source_detail.offcenterM} m off centerline
								{#if routePreview.route_source_detail.calibrationOffsetMi !== 0}
									· offset {routePreview.route_source_detail.calibrationOffsetMi} mi
								{/if}
							</p>
						{/if}
						{#if routePreview?.lookup_warnings?.length}
							<div class="route-warnings">
								{#each routePreview.lookup_warnings as warning}
									<span>{warning}</span>
								{/each}
							</div>
						{/if}
					</div>
					<div class="route-preview-actions">
						{#if routePreview?.waypoints?.length}
							<button type="button" class="btn btn-ghost btn-sm" onclick={flipRoutePreview}>
								Flip Direction
							</button>
						{/if}
						<button type="button" class="btn btn-ghost btn-sm" onclick={refreshRoutePreview} disabled={routePreviewLoading}>
							{routePreviewLoading ? 'Refreshing...' : 'Refresh'}
						</button>
					</div>
				</div>
				{#if routePreview != null && routePreview.source !== 'manual'}
					<button class="btn btn-secondary" style="margin-top:8px; min-height:48px" onclick={() => {
						routePreview = null;
						toastStore.success('Route cleared — draw manually after creating the project');
					}}>Clear &amp; redraw manually</button>
					<p style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">After creating the project, draw the route on the map.</p>
				{/if}
				{#if previewLat != null && previewLng != null && routePreview != null && parsed != null && browser}
					{#await import('$lib/components/RouteAlignmentMap.svelte')}
						<div class="map-mini-loading">Loading route preview...</div>
					{:then { default: RouteAlignmentMap }}
						<RouteAlignmentMap
							site={{
								id: 'import-preview',
								name: parsed.name ?? 'Import preview',
								status: 'active',
								latitude: previewLat,
								longitude: previewLng,
								location_description: parsed.location_description
							}}
							initialWaypoints={routePreview.waypoints}
							roadwayLogEvents={routePreview.projected_log_events ?? []}
							segments={routePreview.mapped_segments ?? []}
							locationPrecision={routePreview.location_precision}
							countyBoundaryGeojson={routePreview.county_boundary_geojson ?? null}
							countyBounds={routePreview.county_bounds ?? null}
							countyName={parsed.county}
							height="360px"
							onRouteSave={async (waypoints) => {
								const center = waypoints[Math.floor(waypoints.length / 2)];
								routePreview = {
									...routePreview!,
									source: 'manual',
									location_precision: 'route',
									waypoints,
									latitude: center?.lat ?? routePreview!.latitude,
									longitude: center?.lng ?? routePreview!.longitude,
									message: 'Edited route preview will be used when the project is created.',
									events_anchored: waypoints.length >= 2 && (parsed?.roadway_log_events?.length ?? 0) > 0,
									anchor_message: 'anchored-manual-route',
									projected_log_events: []
								};
								toastStore.success('Route preview updated');
							}}
						/>
					{/await}
				{:else}
					<div class="route-preview-empty">
						No map candidate yet. Fill route, county, or location fields and refresh.
					</div>
				{/if}
			</div>
		</section>

		<section class="review-section">
			<h3>Customer / Owner</h3>
			<div class="review-grid">
				{#each CUSTOMER_FIELDS.slice().sort((a, b) => {
					const rank = { 'needs-input': 0, verify: 1, ok: 2 } as const;
					return rank[getState(a.key)] - rank[getState(b.key)];
				}) as f}
					{@const conf = getConf(f.key)}
					{@const state = getState(f.key)}
					<div class="review-field" class:field-low={state === 'needs-input'} class:field-verify={state === 'verify'} class:field-corrected={state === 'ok' && (correctedFields.has(f.key) || confirmedFields.has(f.key))}>
						<div class="field-label-row">
							<label for="field-{f.key}">{f.label}</label>
							{#if state === 'needs-input'}
								<span class="conf-badge conf-low" title="Empty — needs input" aria-label="needs input">!</span>
							{:else if state === 'verify'}
								<span class="conf-badge conf-verify" title={sourceLabel(f.key) ? 'Filled but unverified — confirm or edit • Source: ' + sourceLabel(f.key) : 'Filled but unverified — confirm or edit'} aria-label="verify">?</span>
							{:else if conf === 'medium'}
								<span class="conf-dot conf-medium" title={sourceLabel(f.key) ? 'Medium confidence — verify this value • Source: ' + sourceLabel(f.key) : 'Medium confidence — verify this value'} aria-label="medium confidence"></span>
							{:else}
								<span class="conf-dot conf-high" title={sourceLabel(f.key) ? 'High confidence • Source: ' + sourceLabel(f.key) : 'High confidence'} aria-label="high confidence"></span>
							{/if}
							{@render fieldVisionIndicator(f.key)}
							{#if state === 'verify'}
								<button type="button" class="confirm-field-btn" title="Looks right" aria-label="Confirm {f.label}" onclick={() => confirmField(f.key)}>✓</button>
							{/if}
						</div>
						<input
							id="field-{f.key}"
							type="text"
							value={(parsed as unknown as Record<string, unknown>)[f.key] as string | null ?? ''}
							oninput={(e) => {
								(parsed as unknown as Record<string, unknown>)[f.key] = (e.target as HTMLInputElement).value || null;
								markCorrected(f.key);
							}}
							class:input-low={state === 'needs-input'}
						/>
						{@render fieldProvenance(f.key)}
					</div>
				{/each}
			</div>
		</section>

		{#if parsed.scopes.length > 0}
			<section class="review-section">
				<h3>Scope of Work</h3>
				<div class="scope-tags">
					{#each parsed.scopes as scope}
						<span class="scope-tag">{scope.replace(/_/g, ' ')}</span>
					{/each}
				</div>
			</section>
		{/if}

		<section class="review-section paving-setup-section">
			<h3>
				Paving Setup
				{#if !pavingSetupComplete}
					<span class="setup-needs-badge" title="Fill these so the project opens complete">Needed for setup</span>
				{/if}
			</h3>
			<p class="paving-setup-hint">
				Contracts rarely state these. We pre-fill from the document and your org defaults where we
				can — confirm or adjust so the new project isn't flagged incomplete.
				{#if hasPavement}
					Per-segment typical-section specs were detected — review them in the
					<strong>Pavement / Typical Section</strong> section below; these project-level values
					are the single-spec fallback.
				{/if}
			</p>

			<div class="paving-setup-field">
				<span class="paving-setup-label">Road Type</span>
				<div class="road-type-grid" class:setup-empty={!pavingSetup.road_type}>
					{#each PAVING_ROAD_TYPES as rt}
						<button
							type="button"
							class="road-type-card"
							class:active={pavingSetup.road_type === rt.value}
							onclick={() => (pavingSetup.road_type = rt.value)}
						>
							{rt.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="paving-setup-grid">
				<div class="paving-setup-field">
					<label for="paving-num-lanes">Number of Lanes</label>
					<input
						id="paving-num-lanes"
						type="number"
						min="1"
						step="1"
						placeholder="e.g. 2"
						bind:value={pavingSetup.num_lanes}
						class:input-low={pavingSetup.num_lanes == null || pavingSetup.num_lanes <= 0}
					/>
				</div>
				<div class="paving-setup-field">
					<label for="paving-lane-width">Lane Width (ft)</label>
					<input
						id="paving-lane-width"
						type="number"
						min="1"
						step="0.5"
						placeholder="e.g. 12"
						bind:value={pavingSetup.lane_width_ft}
						class:input-low={pavingSetup.lane_width_ft == null || pavingSetup.lane_width_ft <= 0}
					/>
				</div>
				<div class="paving-setup-field">
					<label for="paving-thickness">Target Thickness (in)</label>
					<input
						id="paving-thickness"
						type="number"
						min="0"
						step="0.25"
						placeholder="e.g. 1.5"
						bind:value={pavingSetup.target_thickness_in}
						oninput={() => {
							if (
								pavingSetup.target_thickness_in != null &&
								pavingSetup.target_thickness_in > 0 &&
								(pavingSetup.target_spread_rate == null || pavingSetup.target_spread_rate <= 0)
							) {
								pavingSetup.target_spread_rate = Math.round(
									pavingSetup.target_thickness_in * constant('CONST.THICK_MULT')
								);
							}
						}}
						class:input-low={pavingSetup.target_thickness_in == null || pavingSetup.target_thickness_in <= 0}
					/>
				</div>
				<div class="paving-setup-field">
					<label for="paving-spread">Target Spread Rate (lbs/yd²)</label>
					<input
						id="paving-spread"
						type="number"
						min="0"
						step="any"
						placeholder="e.g. 165"
						bind:value={pavingSetup.target_spread_rate}
						class:input-low={pavingSetup.target_spread_rate == null || pavingSetup.target_spread_rate <= 0}
					/>
				</div>
			</div>
		</section>

		{#if hasPavement}
			<section class="review-section pavement-section">
				<h3>Pavement / Typical Section</h3>
				<p class="section-hint">
					Per-segment typical-section specs read from the plans. Each value shows its
					confidence and source page — confirm or edit. Blank values weren't stated in the
					document; fill them only if you have the figure.
				</p>
				{#each segments as seg, segIdx}
					{#if seg.pavement.length > 0}
						<div class="pavement-segment">
							<div class="pavement-segment-head">
								<strong>{seg.name ?? `Segment ${segIdx + 1}`}</strong>
								{#if seg.length_mi != null}
									<span class="pavement-seg-len">{fmtNum(seg.length_mi, 3)} mi</span>
								{/if}
							</div>
							{#each seg.pavement as pv, pvIdx}
								{@const mixConf = pavementConfidence(pv.mix, segIdx, pvIdx, 'mix')}
								{@const mixProv = pavementProvenance(pv.mix, segIdx, pvIdx, 'mix')}
								{@const wConf = pavementConfidence(pv.roadway_width_ft?.min, segIdx, pvIdx, 'roadway_width_ft.min')}
								{@const wProv = pavementProvenance(pv.roadway_width_ft?.min, segIdx, pvIdx, 'roadway_width_ft.min')}
								<div class="pavement-range">
									<div class="pavement-range-head">
										<span class="pavement-range-label">{pavementRangeLabel(pv)}</span>
									</div>
									<div class="pavement-grid">
										{#each PAVEMENT_NUMBER_FIELDS as pf}
											{@const env = pv[pf.key]}
											{@const conf = pavementConfidence(env, segIdx, pvIdx, pf.key)}
											{@const provenance = pavementProvenance(env, segIdx, pvIdx, pf.key)}
											{@const visioned = isVisionSourced(pavementMeta(segIdx, pvIdx, pf.key))}
											<div class="pavement-field">
												<div class="field-label-row">
													<label for="pv-{segIdx}-{pvIdx}-{pf.key}">{pf.label}</label>
													{#if conf === 'low'}
														<span class="conf-dot conf-low-dot" title="Low confidence — verify" aria-label="low confidence"></span>
													{:else if conf === 'medium'}
														<span class="conf-dot conf-medium" title="Medium confidence — verify" aria-label="medium confidence"></span>
													{:else}
														<span class="conf-dot conf-high" title="High confidence" aria-label="high confidence"></span>
													{/if}
													{#if visioned}
														<span class="vision-field-icon" title="AI read this from a diagram image (vision)" aria-label="read from diagram">&#x1F441;</span>
													{/if}
												</div>
												<input
													id="pv-{segIdx}-{pvIdx}-{pf.key}"
													type="number"
													min="0"
													step={pf.step}
													value={env?.value ?? null}
													oninput={(e) => setPavementNumber(segIdx, pvIdx, pf.key, (e.target as HTMLInputElement).value)}
												/>
												{#if provenance}
													<span class="field-provenance">{provenance}</span>
												{/if}
											</div>
										{/each}

										<div class="pavement-field">
											<div class="field-label-row">
												<label for="pv-{segIdx}-{pvIdx}-mix">Mix</label>
												{#if mixConf === 'low'}
													<span class="conf-dot conf-low-dot" title="Low confidence — verify" aria-label="low confidence"></span>
												{:else if mixConf === 'medium'}
													<span class="conf-dot conf-medium" title="Medium confidence — verify" aria-label="medium confidence"></span>
												{:else}
													<span class="conf-dot conf-high" title="High confidence" aria-label="high confidence"></span>
												{/if}
												{#if isVisionSourced(pavementMeta(segIdx, pvIdx, 'mix'))}
													<span class="vision-field-icon" title="AI read this from a diagram image (vision)" aria-label="read from diagram">&#x1F441;</span>
												{/if}
											</div>
											<input
												id="pv-{segIdx}-{pvIdx}-mix"
												type="text"
												value={pv.mix?.value ?? ''}
												oninput={(e) => setPavementMix(segIdx, pvIdx, (e.target as HTMLInputElement).value)}
											/>
											{#if mixProv}
												<span class="field-provenance">{mixProv}</span>
											{/if}
										</div>

										<div class="pavement-field pavement-width">
											<div class="field-label-row">
												<label for="pv-{segIdx}-{pvIdx}-wmin">Roadway Width (ft)</label>
												{#if wConf === 'low'}
													<span class="conf-dot conf-low-dot" title="Low confidence — verify" aria-label="low confidence"></span>
												{:else if wConf === 'medium'}
													<span class="conf-dot conf-medium" title="Medium confidence — verify" aria-label="medium confidence"></span>
												{:else}
													<span class="conf-dot conf-high" title="High confidence" aria-label="high confidence"></span>
												{/if}
											</div>
											<div class="pavement-width-inputs">
												<input
													id="pv-{segIdx}-{pvIdx}-wmin"
													type="number"
													min="0"
													step="0.5"
													placeholder="min"
													value={pv.roadway_width_ft?.min?.value ?? null}
													oninput={(e) => setPavementWidth(segIdx, pvIdx, 'min', (e.target as HTMLInputElement).value)}
												/>
												<span class="pavement-width-sep">–</span>
												<input
													id="pv-{segIdx}-{pvIdx}-wmax"
													type="number"
													min="0"
													step="0.5"
													placeholder="max"
													value={pv.roadway_width_ft?.max?.value ?? null}
													oninput={(e) => setPavementWidth(segIdx, pvIdx, 'max', (e.target as HTMLInputElement).value)}
												/>
											</div>
											{#if wProv}
												<span class="field-provenance">{wProv}</span>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{/each}
			</section>
		{/if}

		{#if parsed.production_mixes.length > 0}
			<section class="review-section">
				<h3>Production Goals / Mixes</h3>
				<div class="table-wrap">
					<table class="data-table">
						<thead>
							<tr>
								<th>Mix</th>
								<th>Type</th>
								<th>Unit</th>
								<th>Allotted</th>
								<th>Target</th>
								<th>$/Unit</th>
								<th>Qty/Day</th>
								<th>Est Days</th>
							</tr>
						</thead>
						<tbody>
							{#each parsed.production_mixes as mix}
								<tr>
									<td class="mix-name">{mix.mix_name}</td>
									<td>{mix.mix_type ?? '—'}</td>
									<td>{mix.unit ?? '—'}</td>
									<td>{fmtNum(mix.bid_quantity, 0)}</td>
									<td>{fmtNum(mix.takeoff_tonnage, 0)}</td>
									<td>{mix.contract_unit_price != null ? fmtDollars(mix.contract_unit_price) : '—'}</td>
									<td>{fmtNum(mix.quantity_per_day, 0)}</td>
									<td>{fmtNum(mix.est_days)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="table-note">"Allotted" is the contract/state quantity; "Target" is our internal production goal.</p>
			</section>
		{/if}

		<section class="review-section">
			<h3>
				Bid Items
				<span class="item-count">{parsed.bid_items.length} items</span>
				<span class="bid-total">{fmtDollars(bidTotal)}</span>
			</h3>

			{#if contractReconcile.status === 'match'}
				<p class="reconcile reconcile-match">
					Matches parsed contract amount {fmtDollars(parsed.contract_amount)}.
				</p>
			{:else if contractReconcile.status === 'over' || contractReconcile.status === 'under'}
				<p class="reconcile reconcile-diff">
					Bid items total {fmtDollars(bidTotal)} is {fmtDollars(contractReconcile.deltaAbs)}
					{contractReconcile.status === 'under' ? 'under' : 'over'} the parsed contract amount
					{fmtDollars(parsed.contract_amount)} ({fmtNum(contractReconcile.deltaPct)}%).
				</p>
			{:else}
				<p class="reconcile reconcile-none">No contract total parsed to reconcile against.</p>
			{/if}

			{#each groupedItems as [section, items]}
				<div class="bid-section">
					<h4 class="section-name">{section}</h4>
					<div class="table-wrap">
						<table class="data-table bid-table">
							<thead>
								<tr>
									<th class="col-sel"></th>
									<th>Line</th>
									<th>Item</th>
									<th>Description</th>
									<th>Qty</th>
									<th>Unit</th>
									<th>Unit Price</th>
									<th>Amount</th>
								</tr>
							</thead>
							<tbody>
								{#each items as it}
									{@const globalIdx = parsed.bid_items.indexOf(it)}
									<tr class:alternate={it.is_alternate} class:unselected={!it.selected}>
										<td class="col-sel">
											<input
												type="checkbox"
												checked={it.selected}
												onchange={() => toggleItemSelected(globalIdx)}
												title={it.is_alternate ? 'Include this alternate in project' : 'Include in project'}
											/>
										</td>
										<td>{it.line_number ?? ''}</td>
										<td class="mono">{it.item_id ?? ''}</td>
										<td class="desc">{it.description}</td>
										<td class="num">{fmtNum(it.quantity)}</td>
										<td>{it.unit ?? ''}</td>
										<td class="num">{fmtDollars(it.unit_price)}</td>
										<td class="num">{fmtDollars(it.bid_amount)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/each}
		</section>

		<div class="review-actions">
			<button class="btn btn-ghost" onclick={() => { step = 'upload'; files = []; parsed = null; routePreview = null; documentsFound = []; aiExtraction = null; llmFallback = null; fieldMeta = {}; conflicts = []; segments = []; resolvedConflicts = new Set(); }}>
				Start Over
			</button>
			<button class="btn btn-primary" onclick={createProject} disabled={!parsed.name}>
				Create Project
			</button>
		</div>

	{:else if step === 'creating'}
		<div class="creating-state">
			<div class="spinner"></div>
			<p>{schematicProgress || 'Creating project…'}</p>
		</div>
	{/if}

	{#if step === 'parsing'}
		<div class="import-modal-backdrop" role="presentation">
			<div
				class="import-modal"
				role="dialog"
				aria-modal="true"
				aria-live="polite"
				aria-label="PDF import in progress"
			>
				<div class="paver-loader" aria-hidden="true">
					<div class="paver-machine">
						<div class="paver-cab"></div>
						<div class="paver-bed"></div>
						<div class="paver-screed"></div>
						<div class="paver-wheel left"></div>
						<div class="paver-wheel right"></div>
					</div>
					<div class="road-strip">
						<span></span>
						<span></span>
						<span></span>
					</div>
				</div>

				<div class="import-modal-copy">
					<p class="modal-kicker">Importing project PDFs</p>
					<h3>{parsePhaseLabel}</h3>
					<p>{parsePhaseDetail}</p>
					<span class="elapsed-time">{parseElapsedSeconds}s elapsed</span>
				</div>

				<div class="import-steps" aria-hidden="true">
					{#each parseSteps as label, i}
						<div class="import-step" class:done={i < parsePhase} class:active={i === parsePhase}>
							<span></span>
							<small>{label}</small>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.import-page {
		max-width: 1000px;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 16px;
	}

	.breadcrumb a {
		color: var(--text-muted);
		transition: color 0.2s;
	}

	.breadcrumb a:hover {
		color: var(--accent);
	}

	.page-header {
		margin-bottom: 24px;
	}

	.page-title {
		font-size: 1.5rem;
		margin: 0 0 4px;
	}

	.page-subtitle {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin: 0;
	}

	.error-banner {
		background: color-mix(in srgb, var(--bad) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--bad) 30%, transparent);
		color: var(--bad);
		padding: 12px 16px;
		border-radius: var(--radius);
		margin-bottom: 16px;
		font-size: 0.9rem;
	}

	/* Confidence alert banner */
	.conf-alert {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		background: color-mix(in srgb, var(--bad) 7%, transparent);
		border: 1px solid color-mix(in srgb, var(--bad) 30%, transparent);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 12px 16px;
		margin-bottom: 16px;
		font-size: 0.88rem;
		color: var(--text);
	}

	.conf-alert svg {
		flex-shrink: 0;
		color: var(--bad);
		margin-top: 1px;
	}

	.conf-ok {
		display: flex;
		align-items: center;
		gap: 8px;
		background: color-mix(in srgb, var(--good) 7%, transparent);
		border: 1px solid color-mix(in srgb, var(--good) 30%, transparent);
		border-radius: var(--radius);
		padding: 10px 14px;
		margin-bottom: 16px;
		font-size: 0.85rem;
		color: var(--good);
	}

	/* Inline badge in text */
	.inline-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		font-size: 0.65rem;
		font-weight: 800;
		line-height: 1;
		vertical-align: middle;
	}

	/* Confidence legend */
	.conf-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		margin-bottom: 12px;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.corrected-count {
		color: var(--good);
		font-weight: 600;
	}

	/* Confidence indicators */
	.conf-dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.conf-dot.conf-high {
		background: var(--good);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--good) 20%, transparent);
	}

	.conf-dot.conf-medium {
		background: var(--warn);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--warn) 20%, transparent);
	}

	.conf-badge,
	.conf-badge.conf-low,
	.inline-badge.conf-low {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--bad);
		color: #fff;
		font-size: 0.65rem;
		font-weight: 800;
		line-height: 1;
		flex-shrink: 0;
	}

	/* Verify badge — filled but unconfirmed (amber, not red) */
	.conf-badge.conf-verify,
	.inline-badge.conf-verify {
		background: var(--warn);
		color: var(--accent-text);
	}

	/* Per-field confirm ("looks right") button shown for verify-state fields */
	.confirm-field-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 22px;
		height: 22px;
		margin-left: auto;
		padding: 0 6px;
		border: 1px solid color-mix(in srgb, var(--warn) 50%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, var(--warn) 12%, transparent);
		color: var(--text);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		line-height: 1;
	}

	.confirm-field-btn:hover {
		background: color-mix(in srgb, var(--good) 18%, transparent);
		border-color: color-mix(in srgb, var(--good) 50%, transparent);
	}

	.confirm-all-btn {
		margin-left: auto;
		flex-shrink: 0;
	}

	/* Field label row with confidence icon */
	.field-label-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.field-label-row label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		font-weight: 600;
		margin: 0;
	}

	/* Low-confidence field highlight */
	.review-field.field-low {
		background: color-mix(in srgb, var(--bad) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--bad) 25%, transparent);
		border-radius: var(--radius);
		padding: 8px 10px;
	}

	/* Corrected field highlight */
	.review-field.field-corrected {
		background: color-mix(in srgb, var(--good) 4%, transparent);
		border: 1px solid color-mix(in srgb, var(--good) 20%, transparent);
		border-radius: var(--radius);
		padding: 8px 10px;
	}

	/* Verify field highlight — filled but unconfirmed (amber) */
	.review-field.field-verify {
		background: color-mix(in srgb, var(--warn) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 28%, transparent);
		border-radius: var(--radius);
		padding: 8px 10px;
	}

	/* Input with low-confidence border */
	.review-field input.input-low {
		border-color: color-mix(in srgb, var(--bad) 50%, transparent);
	}

	.review-field input.input-low:focus {
		border-color: var(--bad);
		outline: none;
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--bad) 15%, transparent);
	}

	/* Drop zone */
	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 48px 24px;
		border: 2px dashed var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		transition: border-color 0.2s, background 0.2s;
		cursor: pointer;
	}

	.drop-zone.drag-over {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 5%, var(--surface));
	}

	.drop-zone svg {
		color: var(--text-muted);
	}

	.drop-text {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
	}

	.drop-sub {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0;
	}

	.file-btn {
		cursor: pointer;
	}

	.file-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 16px;
	}

	.file-item {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 10px 14px;
	}

	.file-name {
		flex: 1;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.file-size {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.file-remove {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.3rem;
		cursor: pointer;
		padding: 4px 8px;
		min-height: 48px;
		min-width: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.file-remove:hover {
		color: var(--bad);
	}

	.parse-btn {
		margin-top: 16px;
	}

	.parse-progress {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 14px;
		padding: 12px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
	}

	.parse-progress strong {
		display: block;
		font-size: 0.9rem;
	}

	.parse-progress p {
		margin: 3px 0 0;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.import-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(10, 16, 20, 0.72);
		backdrop-filter: blur(3px);
	}

	.import-modal {
		width: min(520px, 100%);
		padding: 24px;
		border-radius: 10px;
		border: 1px solid rgba(242, 192, 55, 0.28);
		background: var(--surface);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
	}

	.paver-loader {
		position: relative;
		height: 108px;
		margin-bottom: 18px;
		overflow: hidden;
		border-radius: 8px;
		background:
			linear-gradient(180deg, rgba(46, 59, 70, 0.35), rgba(20, 27, 33, 0.8)),
			linear-gradient(90deg, rgba(242, 192, 55, 0.08), transparent 58%);
		border: 1px solid var(--border);
	}

	.paver-machine {
		position: absolute;
		left: 50%;
		bottom: 34px;
		width: 142px;
		height: 50px;
		transform: translateX(-50%);
		animation: paver-bob 1.7s ease-in-out infinite;
	}

	.paver-cab {
		position: absolute;
		left: 18px;
		bottom: 26px;
		width: 42px;
		height: 28px;
		border-radius: 5px 9px 2px 2px;
		background: #f2c037;
		box-shadow: inset -10px 0 rgba(0, 0, 0, 0.14);
	}

	.paver-cab::after {
		content: '';
		position: absolute;
		right: 7px;
		top: 6px;
		width: 16px;
		height: 10px;
		border-radius: 2px;
		background: rgba(46, 59, 70, 0.75);
	}

	.paver-bed {
		position: absolute;
		left: 6px;
		right: 18px;
		bottom: 13px;
		height: 24px;
		border-radius: 4px;
		background: #2e3b46;
		border: 2px solid rgba(242, 192, 55, 0.55);
	}

	.paver-screed {
		position: absolute;
		right: 0;
		bottom: 10px;
		width: 42px;
		height: 10px;
		border-radius: 2px;
		background: #cbd5e1;
		transform: skewX(-16deg);
	}

	.paver-wheel {
		position: absolute;
		bottom: 0;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #111827;
		border: 5px solid #475569;
		animation: wheel-spin 0.9s linear infinite;
	}

	.paver-wheel.left { left: 28px; }
	.paver-wheel.right { right: 42px; }

	.road-strip {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 30px;
		background: #111827;
		border-top: 3px solid rgba(242, 192, 55, 0.68);
		overflow: hidden;
	}

	.road-strip span {
		position: absolute;
		top: 13px;
		width: 58px;
		height: 4px;
		border-radius: 99px;
		background: rgba(242, 192, 55, 0.95);
		animation: lane-slide 1.15s linear infinite;
	}

	.road-strip span:nth-child(1) { left: -60px; }
	.road-strip span:nth-child(2) { left: 100px; animation-delay: -0.38s; }
	.road-strip span:nth-child(3) { left: 260px; animation-delay: -0.76s; }

	.import-modal-copy {
		text-align: center;
	}

	.modal-kicker {
		margin: 0 0 6px;
		color: var(--accent);
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.import-modal-copy h3 {
		margin: 0;
		font-size: 1.12rem;
	}

	.import-modal-copy p:not(.modal-kicker) {
		margin: 8px auto 0;
		max-width: 390px;
		color: var(--text-muted);
		font-size: 0.88rem;
		line-height: 1.45;
	}

	.elapsed-time {
		display: inline-flex;
		margin-top: 12px;
		padding: 4px 9px;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 700;
	}

	.import-steps {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
		margin-top: 20px;
	}

	.import-step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		min-width: 0;
		color: var(--text-muted);
	}

	.import-step span {
		width: 100%;
		height: 4px;
		border-radius: 99px;
		background: var(--border);
	}

	.import-step small {
		font-size: 0.68rem;
		font-weight: 700;
		line-height: 1.1;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.import-step.done span,
	.import-step.active span {
		background: var(--accent);
	}

	.import-step.active {
		color: var(--accent);
	}

	.import-step.active span {
		animation: active-step-pulse 1s ease-in-out infinite;
	}

	@media (max-width: 520px) {
		.import-modal {
			padding: 18px;
		}

		.import-steps {
			gap: 4px;
		}

		.import-step small {
			display: none;
		}
	}

	/* Review */
	.warnings {
		margin-bottom: 16px;
	}

	.doc-status {
		display: flex;
		gap: 10px;
		margin-bottom: 12px;
	}

	/* Classification badge — shown at top of review step */
	.classification-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.3);
		color: #93c5fd;
		font-size: 0.8125rem;
		margin-bottom: 0.75rem;
	}

	.classification-badge.low-conf {
		background: color-mix(in srgb, var(--warn) 10%, transparent);
		border-color: color-mix(in srgb, var(--warn) 30%, transparent);
		color: var(--warn);
	}

	.classification-badge .badge-icon {
		font-size: 1rem;
		flex-shrink: 0;
		line-height: 1;
	}

	.classification-badge .badge-label {
		flex: 1;
	}

	.classification-badge .ai-tag {
		display: inline-block;
		padding: 0.1em 0.4em;
		border-radius: 4px;
		background: rgba(139, 92, 246, 0.2);
		color: #c4b5fd;
		font-size: 0.75rem;
		font-weight: 600;
		margin-left: 0.25rem;
		vertical-align: middle;
	}


	.doc-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}

	.doc-chip.present {
		border-color: var(--accent);
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 10%, var(--surface));
	}

	.missing-doc-banner {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
		background: color-mix(in srgb, var(--warn) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 14px 16px;
		margin-bottom: 16px;
	}

	.missing-doc-banner span {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.missing-doc-banner .btn {
		margin-top: 4px;
	}

	.document-inventory {
		margin-bottom: 16px;
	}

	.evidence-ok,
	.evidence-warn {
		display: inline-flex;
		align-items: center;
		min-height: 28px;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 800;
	}

	.evidence-ok {
		color: var(--accent);
		background: rgba(242, 192, 55, 0.1);
		border: 1px solid rgba(242, 192, 55, 0.35);
	}

	.evidence-warn {
		color: var(--warn);
		background: color-mix(in srgb, var(--warn) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
	}

	.evidence-chips,
	.route-status-row,
	.page-labels {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.evidence-chips {
		margin-bottom: 12px;
	}

	.evidence-chips + .section-hint {
		margin-top: 0;
	}

	.evidence-chips span,
	.route-status-row span,
	.page-labels span {
		display: inline-flex;
		align-items: center;
		min-height: 26px;
		padding: 4px 8px;
		border-radius: 999px;
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--text-muted);
		font-size: 0.76rem;
		font-weight: 700;
	}

	.evidence-chips span.present,
	.route-status-row .route-source {
		color: var(--accent);
		border-color: rgba(242, 192, 55, 0.35);
		background: rgba(242, 192, 55, 0.08);
	}

	.document-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}

	.document-card {
		display: grid;
		grid-template-columns: minmax(170px, 0.6fr) minmax(0, 1fr);
		gap: 12px;
		padding: 10px 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.document-card strong,
	.document-card span {
		display: block;
	}

	.document-card > div:first-child span {
		margin-top: 3px;
		color: var(--text-muted);
		font-size: 0.78rem;
		text-transform: capitalize;
	}

	.table-note {
		margin: 8px 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.section-hint {
		margin: -8px 0 12px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.route-preview {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}

	.roadway-log-preview {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}

	.route-preview-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.route-preview-head h3 {
		margin: 0 0 4px;
	}

	.route-preview-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}

	.route-preview-head h4 {
		margin: 0 0 4px;
		font-size: 0.95rem;
	}

	.route-preview-head p,
	.route-preview-empty {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.82rem;
	}

	.anchor-status {
		display: inline-flex;
		width: fit-content;
		margin-top: 8px !important;
		padding: 5px 9px;
		border: 1px solid rgba(242, 192, 55, 0.35);
		border-radius: 999px;
		color: var(--text-muted);
		background: rgba(242, 192, 55, 0.08);
		font-weight: 700;
	}

	.anchor-status.anchored {
		color: var(--accent);
	}

	.lrs-detail {
		margin-top: 6px !important;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.route-warnings {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 8px;
	}

	.route-warnings span {
		color: var(--warn);
		font-size: 0.78rem;
		font-weight: 700;
	}

	.route-preview-empty {
		padding: 18px;
		background: var(--bg);
		border: 1px dashed var(--border);
		border-radius: 8px;
	}

	.log-count {
		color: var(--accent);
		font-size: 0.82rem;
		font-weight: 800;
	}

	.roadway-log-table {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.roadway-log-row {
		display: grid;
		grid-template-columns: 64px 120px minmax(0, 1fr) auto;
		gap: 10px;
		padding: 8px 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: 0.82rem;
	}

	.roadway-log-row.reference {
		opacity: 0.78;
	}

	.log-mile {
		color: var(--accent);
		font-weight: 800;
	}

	.log-type {
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.log-desc {
		color: var(--text);
		line-height: 1.3;
	}

	.log-width {
		color: var(--text-muted);
		font-weight: 700;
		white-space: nowrap;
	}

	.warning-item {
		background: color-mix(in srgb, var(--warn) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
		color: var(--accent);
		padding: 10px 14px;
		border-radius: var(--radius);
		font-size: 0.85rem;
		margin-bottom: 8px;
	}

	.btn-small {
		min-height: 36px;
		padding: 6px 10px;
		font-size: 0.8rem;
		white-space: nowrap;
	}

	.review-section {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.review-section h3 {
		margin: 0 0 16px;
		font-size: 1rem;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.item-count {
		font-size: 0.75rem;
		padding: 3px 8px;
		background: var(--surface-alt, var(--border));
		border-radius: 999px;
		color: var(--text-muted);
		font-weight: 600;
	}

	.bid-total {
		margin-left: auto;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--accent);
	}

	.review-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 12px;
	}

	.review-field {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.review-field input {
		padding: 8px 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
	}

	.scope-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.scope-tag {
		padding: 6px 12px;
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
		color: var(--accent);
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.table-wrap {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
	}

	.data-table th,
	.data-table td {
		padding: 8px 10px;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}

	.data-table th {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		font-weight: 700;
		white-space: nowrap;
	}

	.data-table .mix-name {
		font-weight: 600;
	}

	.bid-section {
		margin-bottom: 16px;
	}

	.section-name {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text-muted);
		margin: 0 0 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.bid-table .col-sel {
		width: 40px;
		text-align: center;
	}

	.bid-table .mono {
		font-family: monospace;
		font-size: 0.78rem;
	}

	.bid-table .desc {
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bid-table .num {
		text-align: right;
		white-space: nowrap;
	}

	.bid-table tr.alternate {
		background: color-mix(in srgb, var(--accent) 4%, transparent);
	}

	.bid-table tr.unselected {
		opacity: 0.5;
	}

	.bid-table tr.unselected td {
		text-decoration: line-through;
		text-decoration-color: var(--text-muted);
	}

	.bid-table input[type='checkbox'] {
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.review-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		margin-top: 24px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}

	.creating-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 64px 24px;
		color: var(--text-muted);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.spinner.small {
		width: 22px;
		height: 22px;
		border-width: 2px;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@keyframes paver-bob {
		0%, 100% { transform: translateX(-50%) translateY(0); }
		50% { transform: translateX(-50%) translateY(-3px); }
	}

	@keyframes wheel-spin {
		to { transform: rotate(360deg); }
	}

	@keyframes lane-slide {
		to { transform: translateX(620px); }
	}

	@keyframes active-step-pulse {
		0%, 100% { opacity: 0.55; }
		50% { opacity: 1; }
	}

	.ai-field-icon {
		color: #a78bfa;
		font-size: 0.7rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.extraction-report {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 16px;
		overflow: hidden;
	}

	.extraction-report summary {
		padding: 12px 16px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		color: var(--text-muted);
		user-select: none;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.extraction-report summary::-webkit-details-marker { display: none; }

	.extraction-report summary::before {
		content: '\25B6';
		font-size: 0.6rem;
		transition: transform 0.15s;
	}

	.extraction-report[open] summary::before {
		transform: rotate(90deg);
	}

	.extraction-report-body {
		padding: 0 16px 16px;
	}

	.report-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 10px;
	}

	.report-stat {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		font-weight: 600;
	}

	.stat-value {
		font-size: 1rem;
		font-weight: 700;
		color: var(--text);
	}

	.stat-high { color: var(--good); }
	.stat-medium { color: var(--warn); }
	.stat-low { color: var(--bad); }

	@media (max-width: 640px) {
		.review-grid {
			grid-template-columns: 1fr;
		}

		.review-actions {
			flex-direction: column;
		}

		.bid-table .desc {
			max-width: 150px;
		}

		.conf-legend {
			gap: 8px;
		}
	}

	/* Multi-document breakdown */
	.multi-doc-section h3 {
		margin-bottom: 12px;
	}

	.multi-doc-file {
		margin-bottom: 12px;
	}

	.multi-doc-filename {
		font-weight: 700;
		font-size: 0.9rem;
		margin-bottom: 4px;
	}

	.multi-doc-hint {
		font-size: 0.82rem;
		color: var(--text-muted);
		margin: 0 0 8px;
	}

	.multi-doc-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.multi-doc-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: rgba(59, 130, 246, 0.08);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 999px;
		font-size: 0.8rem;
	}

	.multi-doc-type {
		font-weight: 700;
		color: #93c5fd;
	}

	.multi-doc-pages {
		color: var(--text-muted);
	}

	.multi-doc-conf {
		color: var(--good);
		font-weight: 700;
		font-size: 0.75rem;
	}

	/* Paving Setup review section */
	.paving-setup-hint {
		margin: 0 0 16px;
		font-size: 0.85rem;
		color: var(--text-muted);
		max-width: 60ch;
	}

	.setup-needs-badge {
		display: inline-block;
		margin-left: 8px;
		padding: 2px 8px;
		background: var(--warn);
		color: #fff;
		border-radius: 999px;
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.3px;
		vertical-align: middle;
	}

	.paving-setup-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 14px;
	}

	.paving-setup-label,
	.paving-setup-field label {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.road-type-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 8px;
	}

	.road-type-grid.setup-empty {
		padding: 6px;
		border: 1px solid var(--warn);
		border-radius: var(--radius);
	}

	.road-type-card {
		min-height: 48px;
		padding: 10px 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}

	.road-type-card:hover {
		border-color: var(--accent);
	}

	.road-type-card.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, var(--bg));
		color: var(--text);
	}

	.paving-setup-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 14px;
	}

	@media (min-width: 560px) {
		.paving-setup-grid {
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		}
	}

	.paving-setup-field input {
		min-height: 48px;
		padding: 10px 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.95rem;
	}

	.paving-setup-field input.input-low {
		border-color: var(--warn);
	}

	.paving-setup-field input.input-low:focus {
		outline: none;
		border-color: var(--accent);
	}

	.reconcile {
		margin: 4px 0 0;
		font-size: 0.8rem;
		line-height: 1.4;
		font-weight: 500;
	}

	.reconcile-match {
		color: var(--text-muted);
	}

	.reconcile-match::before {
		content: '✓ ';
		color: var(--accent);
		font-weight: 700;
	}

	.reconcile-diff {
		color: var(--text);
		padding: 6px 10px;
		border-radius: 8px;
		border-left: 3px solid var(--accent);
		background: rgba(242, 192, 55, 0.08);
	}

	.reconcile-none {
		color: var(--text-muted);
		font-style: italic;
	}

	/* ── Phase 7: field provenance, structured conflicts, pavement review ── */

	/* Per-field source-page provenance line ("from Page 10 (Typical Section), text") */
	.field-provenance {
		display: block;
		margin-top: 4px;
		font-size: 0.7rem;
		line-height: 1.3;
		color: var(--text-muted);
	}

	/* "AI read this from a diagram image" (vision) indicator */
	.vision-field-icon {
		color: var(--accent);
		font-size: 0.78rem;
		line-height: 1;
		flex-shrink: 0;
	}

	/* Structured conflicts panel (replaces the old warning-prose parse) */
	.conflicts-panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: color-mix(in srgb, var(--warn) 7%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 12px 16px;
		margin-bottom: 16px;
	}

	.conflicts-head {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		font-size: 0.88rem;
		color: var(--text);
	}

	.conflicts-head svg {
		flex-shrink: 0;
		color: var(--warn);
		margin-top: 1px;
	}

	.conflict-review {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		background: var(--bg);
		border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
		border-radius: 8px;
		color: var(--text);
	}

	.conflict-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}

	.conflict-info strong {
		color: var(--accent);
		text-transform: capitalize;
	}

	.conflict-ai {
		color: var(--text);
		overflow-wrap: anywhere;
	}

	.conflict-validator {
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}

	.conflict-actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex-shrink: 0;
	}

	.conflict-keep {
		opacity: 0.85;
	}

	/* Pavement / Typical-Section review section */
	.pavement-segment {
		margin-bottom: 16px;
		padding: 12px 14px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.pavement-segment-head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
	}

	.pavement-segment-head strong {
		font-size: 0.95rem;
	}

	.pavement-seg-len {
		color: var(--accent);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.pavement-range {
		padding: 10px 0;
		border-top: 1px dashed var(--border);
	}

	.pavement-range:first-of-type {
		border-top: none;
	}

	.pavement-range-head {
		margin-bottom: 8px;
	}

	.pavement-range-label {
		display: inline-flex;
		align-items: center;
		min-height: 26px;
		padding: 3px 10px;
		border-radius: 999px;
		background: rgba(242, 192, 55, 0.1);
		border: 1px solid rgba(242, 192, 55, 0.35);
		color: var(--accent);
		font-size: 0.78rem;
		font-weight: 700;
	}

	.pavement-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 12px;
	}

	@media (min-width: 560px) {
		.pavement-grid {
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		}
	}

	.pavement-field {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.pavement-field input {
		min-height: 48px;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.95rem;
	}

	.pavement-field input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.pavement-width-inputs {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.pavement-width-inputs input {
		min-width: 0;
		flex: 1;
	}

	.pavement-width-sep {
		color: var(--text-muted);
		font-weight: 700;
	}

	/* Low-confidence dot for pavement review (amber, not the red needs-input badge) */
	.conf-dot.conf-low-dot {
		background: var(--warn);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--warn) 20%, transparent);
	}
</style>
