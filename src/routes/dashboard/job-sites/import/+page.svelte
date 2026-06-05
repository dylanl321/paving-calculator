<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { config } from '$lib/config';
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

	interface ParsedBidItem {
		line_number: string | null;
		item_id: string | null;
		description: string;
		quantity: number | null;
		unit: string | null;
		unit_price: number | null;
		bid_amount: number | null;
		section: string | null;
		is_alternate: boolean;
		selected: boolean;
	}

	interface ParsedMix {
		mix_name: string;
		mix_type: string | null;
		unit: string | null;
		bid_quantity: number | null;
		takeoff_tonnage: number | null;
		quantity_per_day: number | null;
		est_days: number | null;
		contract_unit_price: number | null;
	}

	interface ParsedRoadwayLogEvent {
		source_index: number | null;
		page_number: number | null;
		milepost: number;
		station: number;
		event_type: string;
		description: string;
		roadway_width_ft: number | null;
		side: 'left' | 'right' | null;
		surface: 'paved' | 'unpaved' | null;
		is_reference: boolean;
		confidence: 'high' | 'medium' | 'low';
		raw_text: string;
		sort_order: number;
	}

	interface PreviewRoadwayLogEvent {
		id: string;
		milepost: number;
		event_type: string;
		description: string;
		roadway_width_ft: number | null;
		is_reference: number;
		confidence: string;
		coordinate_geojson: string | null;
	}

	interface DocumentInventory {
		filename: string;
		source_key: string;
		type: string;
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
	}

	interface ParsedJob {
		name: string | null;
		job_number: string | null;
		project_number: string | null;
		contract_id: string | null;
		county: string | null;
		work_type: string | null;
		contract_type: string | null;
		contract_amount: number | null;
		retainage_pct: number | null;
		est_start_date: string | null;
		completion_date: string | null;
		customer_name: string | null;
		customer_address: string | null;
		customer_contact: string | null;
		customer_phone: string | null;
		customer_email: string | null;
		owner_name: string | null;
		owner_address: string | null;
		project_manager: string | null;
		asphalt_supplier: string | null;
		total_length_ft: number | null;
		location_description: string | null;
		route_designation: string | null;
		begin_terminus: string | null;
		end_terminus: string | null;
		scopes: string[];
		bid_items: ParsedBidItem[];
		production_mixes: ParsedMix[];
		roadway_log_events: ParsedRoadwayLogEvent[];
		detected_documents: string[];
		has_contract_summary: boolean;
		has_job_setup: boolean;
		warnings: string[];
	}

	interface ParsedTerminus {
		type: 'intersection' | 'milepost' | 'landmark' | 'raw';
		parsed_roads: string[];
		milepost?: number;
		landmark?: string;
		offsetMiles?: number;
		direction?: string;
		summary: string;
		raw: string;
	}

	interface RoutePreview {
		source: 'gdot_route' | 'osm_termini_route' | 'osm_overpass' | 'geocode' | 'county_centroid' | 'manual' | 'none';
		latitude: number | null;
		longitude: number | null;
		waypoints: Array<{ lat: number; lng: number }>;
		message?: string;
		lookup_warnings?: string[];
		events_anchored?: boolean;
		anchor_message?: string;
		route_length_ft?: number | null;
		expected_length_ft?: number | null;
		projected_log_events?: PreviewRoadwayLogEvent[];
		parsed_begin_terminus?: ParsedTerminus | null;
		parsed_end_terminus?: ParsedTerminus | null;
	}

	let step = $state<'upload' | 'parsing' | 'review' | 'creating'>('upload');
	let files = $state<File[]>([]);
	let dragOver = $state(false);
	let parseError = $state('');
	let parsed = $state<ParsedJob | null>(null);
	let sourceKeys = $state<string[]>([]);
	let documents = $state<Array<{ filename: string; source_key: string; type: string }>>([]);
	let documentInventory = $state<DocumentInventory[]>([]);
	let schematicProgress = $state('');
	let fieldConf = $state<FieldConfidenceMap>({});
	let fieldSource = $state<Record<string, string>>({});
	let parserDurationMs = $state<number | null>(null);
	let routePreview = $state<RoutePreview | null>(null);
	let routePreviewLoading = $state(false);
	/** Diagnostic for whether the Workers AI fallback ran (observability). */
	let llmFallback = $state<{
		attempted: boolean;
		applied: boolean;
		reason: string;
		binding_available: boolean;
		outcome: 'applied' | 'not-needed' | 'binding-unavailable' | 'failed';
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

		const formData = new FormData();
		for (const f of files) {
			formData.append('files', f);
		}

		try {
			const res = await fetch('/api/job-sites/import-pdf', {
				method: 'POST',
				body: formData,
				credentials: 'include'
			});

			const data = await res.json() as {
				parsed?: ParsedJob;
				source_keys?: string[];
				documents?: Array<{ filename: string; source_key: string; type: string }>;
				document_inventory?: DocumentInventory[];
				field_confidence?: FieldConfidenceMap;
				route_preview?: RoutePreview;
				llm_fallback?: { attempted: boolean; applied: boolean; reason: string; binding_available: boolean; outcome: 'applied' | 'not-needed' | 'binding-unavailable' | 'failed' };
				document_type?: string;
				classification_confidence?: number;
				classification_description?: string;
				classification_message?: string;
				documents_found?: Array<{
					file_index: number;
					sections: Array<{ type: string; pages: number[]; startPage: number; endPage: number; confidence: number; }>;
				}>;
				parsing_report?: {
					detected_type: string | null;
					confidence: number;
					extractable_fields: string[];
					missing_fields: string[];
					suggestions: string[];
					is_supported: boolean;
				};
				error?: string;
			};

			if (!res.ok) {
				parseError = data.error || 'Failed to parse PDF';
				step = 'upload';
				return;
			}

			parsed = data.parsed ?? null;
			sourceKeys = data.source_keys ?? [];
			documents = data.documents ?? [];
			documentInventory = data.document_inventory ?? [];
			fieldConf = data.field_confidence ?? {};
			fieldSource = (data as Record<string, unknown>).field_source as Record<string, string> ?? {};
			parserDurationMs = typeof (data as Record<string, unknown>).parser_duration_ms === 'number' ? (data as Record<string, unknown>).parser_duration_ms as number : null;
			routePreview = data.route_preview ?? null;
			llmFallback = data.llm_fallback ?? null;
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
			parsingReport = data.parsing_report ?? null;
			primaryFilename = files[0]?.name ?? '';
			step = 'review';
		} catch {
			parseError = 'Network error — check your connection';
			step = 'upload';
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
					route_override: reviewedRoute
						? {
								accepted: true,
								latitude: reviewedRoute.latitude,
								longitude: reviewedRoute.longitude,
								waypoints: reviewedRoute.waypoints,
								source: reviewedRoute.source,
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
		routePreview = {
			...routePreview,
			source: 'manual',
			waypoints: [...routePreview.waypoints].reverse(),
			message: 'Route direction flipped. Save this route if the roadway log runs the opposite way.'
		};
	}

	function anchorLabel(preview: RoutePreview | null): string {
		if (!preview) return 'No route anchor yet';
		if (preview.events_anchored) return 'Roadway log markers will plot on this route';
		if (preview.anchor_message === 'route-needs-trimming') return 'Trim this route to the project limits before plotting markers';
		if (preview.anchor_message === 'route-too-short') return 'Route is shorter than the roadway log';
		if (preview.anchor_message === 'missing-route') return 'No route available for roadway log markers';
		return 'Roadway log markers will stay list-only until the route is confirmed';
	}

	function routeSourceBadge(source: RoutePreview['source'] | undefined): { label: string; color: string } {
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
			const { getDocument } = await import('pdfjs-serverless');
			const data = new Uint8Array(await file.arrayBuffer());
			const pdf = await getDocument({ data, useSystemFonts: true }).promise;
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
		return countNeedsAttention(fieldConf, reviewValues, correctedFields, confirmedFields);
	});

	/**
	 * Get confidence for a field. If user has corrected it, treat as high
	 * so the indicator reflects their manual override.
	 */
	function getConf(fieldName: string): FieldConfidence {
		return displayedConfidence(fieldName, fieldConf, correctedFields);
	}

	/** Resolved review state (needs-input | verify | ok) for a rendered field. */
	function getState(fieldName: string): FieldState {
		return fieldState(fieldName, fieldValue(fieldName), fieldConf, correctedFields, confirmedFields);
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
					{@const llmStatus = llmFallback?.outcome ?? 'not-needed'}
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
						<span class="stat-label">AI fallback</span>
						<span class="stat-value"
							class:stat-high={llmStatus === 'not-needed'}
							class:stat-medium={llmStatus === 'applied'}
							class:stat-low={llmStatus === 'failed'}>
							{llmStatus === 'applied' ? 'Applied' : llmStatus === 'not-needed' ? 'Not needed' : llmStatus === 'binding-unavailable' ? 'Unavailable' : 'Failed'}
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
			{#if llmFallback?.attempted}
				<span
					class="doc-chip"
					class:present={llmFallback.applied}
					title={llmFallback.applied
						? 'Workers AI supplemented low-confidence fields'
						: llmFallback.outcome === 'not-needed'
							? 'Deterministic parsing covered everything; AI assist was not needed'
							: llmFallback.outcome === 'binding-unavailable'
								? 'Workers AI is not available in this environment'
								: `AI assist could not supplement fields (${llmFallback.reason})`}
				>
					{#if llmFallback.applied}
						✓ AI assist applied
					{:else if llmFallback.outcome === 'not-needed'}
						✓ AI assist not needed
					{:else if llmFallback.outcome === 'binding-unavailable'}
						○ AI assist unavailable
					{:else}
						○ AI assist failed
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
							{#if fieldSource[f.key]?.includes('llm')}
								<span class="ai-field-icon" title="Value filled by AI fallback" aria-label="AI filled">&#x2736;</span>
							{/if}
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
							{#if fieldSource[f.key]?.includes('llm')}
								<span class="ai-field-icon" title="Value filled by AI fallback" aria-label="AI filled">&#x2736;</span>
							{/if}
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
				{#if routePreview?.latitude != null && routePreview.longitude != null && browser}
					{#await import('$lib/components/RouteAlignmentMap.svelte')}
						<div class="map-mini-loading">Loading route preview...</div>
					{:then { default: RouteAlignmentMap }}
						<RouteAlignmentMap
							site={{
								id: 'import-preview',
								name: parsed.name ?? 'Import preview',
								status: 'active',
								latitude: routePreview.latitude,
								longitude: routePreview.longitude,
								location_description: parsed.location_description
							}}
							initialWaypoints={routePreview.waypoints}
							roadwayLogEvents={routePreview.projected_log_events ?? []}
							height="360px"
							onRouteSave={async (waypoints) => {
								const center = waypoints[Math.floor(waypoints.length / 2)];
								routePreview = {
									...routePreview!,
									source: 'manual',
									waypoints,
									latitude: center?.lat ?? routePreview!.latitude,
									longitude: center?.lng ?? routePreview!.longitude,
									message: 'Edited route preview will be used when the project is created.',
									events_anchored: waypoints.length >= 2 && (parsed.roadway_log_events?.length ?? 0) > 0,
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
							{#if fieldSource[f.key]?.includes('llm')}
								<span class="ai-field-icon" title="Value filled by AI fallback" aria-label="AI filled">&#x2736;</span>
							{/if}
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
			<button class="btn btn-ghost" onclick={() => { step = 'upload'; files = []; parsed = null; routePreview = null; documentsFound = []; }}>
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
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
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
		background: rgba(239, 68, 68, 0.07);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 12px 16px;
		margin-bottom: 16px;
		font-size: 0.88rem;
		color: var(--text);
	}

	.conf-alert svg {
		flex-shrink: 0;
		color: #ef4444;
		margin-top: 1px;
	}

	.conf-ok {
		display: flex;
		align-items: center;
		gap: 8px;
		background: rgba(34, 197, 94, 0.07);
		border: 1px solid rgba(34, 197, 94, 0.3);
		border-radius: var(--radius);
		padding: 10px 14px;
		margin-bottom: 16px;
		font-size: 0.85rem;
		color: #22c55e;
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
		color: #22c55e;
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
		background: #22c55e;
		box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
	}

	.conf-dot.conf-medium {
		background: #eab308;
		box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.2);
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
		background: #ef4444;
		color: #fff;
		font-size: 0.65rem;
		font-weight: 800;
		line-height: 1;
		flex-shrink: 0;
	}

	/* Verify badge — filled but unconfirmed (amber, not red) */
	.conf-badge.conf-verify,
	.inline-badge.conf-verify {
		background: #eab308;
		color: #1a1a1a;
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
		border: 1px solid rgba(234, 179, 8, 0.5);
		border-radius: 6px;
		background: rgba(234, 179, 8, 0.12);
		color: var(--text);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		line-height: 1;
	}

	.confirm-field-btn:hover {
		background: rgba(34, 197, 94, 0.18);
		border-color: rgba(34, 197, 94, 0.5);
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
		background: rgba(239, 68, 68, 0.05);
		border: 1px solid rgba(239, 68, 68, 0.25);
		border-radius: var(--radius);
		padding: 8px 10px;
	}

	/* Corrected field highlight */
	.review-field.field-corrected {
		background: rgba(34, 197, 94, 0.04);
		border: 1px solid rgba(34, 197, 94, 0.2);
		border-radius: var(--radius);
		padding: 8px 10px;
	}

	/* Verify field highlight — filled but unconfirmed (amber) */
	.review-field.field-verify {
		background: rgba(234, 179, 8, 0.05);
		border: 1px solid rgba(234, 179, 8, 0.28);
		border-radius: var(--radius);
		padding: 8px 10px;
	}

	/* Input with low-confidence border */
	.review-field input.input-low {
		border-color: rgba(239, 68, 68, 0.5);
	}

	.review-field input.input-low:focus {
		border-color: #ef4444;
		outline: none;
		box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15);
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
		color: #ef4444;
	}

	.parse-btn {
		margin-top: 16px;
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
		background: rgba(245, 158, 11, 0.1);
		border-color: rgba(245, 158, 11, 0.3);
		color: #fcd34d;
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
		background: rgba(234, 179, 8, 0.08);
		border: 1px solid rgba(234, 179, 8, 0.35);
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
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.35);
	}

	.evidence-chips,
	.route-status-row,
	.page-labels {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
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

	.route-warnings {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 8px;
	}

	.route-warnings span {
		color: #f59e0b;
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
		background: rgba(234, 179, 8, 0.1);
		border: 1px solid rgba(234, 179, 8, 0.3);
		color: var(--accent);
		padding: 10px 14px;
		border-radius: var(--radius);
		font-size: 0.85rem;
		margin-bottom: 8px;
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

	@keyframes spin {
		to { transform: rotate(360deg); }
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

	.stat-high { color: #22c55e; }
	.stat-medium { color: #eab308; }
	.stat-low { color: #ef4444; }

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
		color: #22c55e;
		font-weight: 700;
		font-size: 0.75rem;
	}
</style>
