<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast.svelte';

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
		scopes: string[];
		bid_items: ParsedBidItem[];
		production_mixes: ParsedMix[];
		detected_documents: string[];
		has_contract_summary: boolean;
		has_job_setup: boolean;
		warnings: string[];
	}

	let step = $state<'upload' | 'parsing' | 'review' | 'creating'>('upload');
	let files = $state<File[]>([]);
	let dragOver = $state(false);
	let parseError = $state('');
	let parsed = $state<ParsedJob | null>(null);
	let sourceKeys = $state<string[]>([]);
	let documents = $state<Array<{ filename: string; source_key: string; type: string }>>([]);
	let schematicProgress = $state('');

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

			const data = await res.json() as { parsed?: ParsedJob; source_keys?: string[]; documents?: Array<{ filename: string; source_key: string; type: string }>; error?: string };

			if (!res.ok) {
				parseError = data.error || 'Failed to parse PDF';
				step = 'upload';
				return;
			}

			parsed = data.parsed ?? null;
			sourceKeys = data.source_keys ?? [];
			documents = data.documents ?? [];
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

	async function createProject() {
		if (!parsed) return;
		step = 'creating';

		try {
			const res = await fetch('/api/job-sites/from-import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ parsed, source_keys: sourceKeys }),
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

		<div class="doc-status">
			<span class="doc-chip" class:present={parsed.has_contract_summary}>
				{parsed.has_contract_summary ? '✓' : '○'} Contract Summary
			</span>
			<span class="doc-chip" class:present={parsed.has_job_setup}>
				{parsed.has_job_setup ? '✓' : '○'} Job Setup
			</span>
		</div>

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

		{#if parsed.warnings.length > 0}
			<div class="warnings">
				{#each parsed.warnings as w}
					<div class="warning-item">{w}</div>
				{/each}
			</div>
		{/if}

		<section class="review-section">
			<h3>Project Information</h3>
			<div class="review-grid">
				<div class="review-field">
					<label>Name</label>
					<input type="text" bind:value={parsed.name} />
				</div>
				<div class="review-field">
					<label>Job #</label>
					<input type="text" bind:value={parsed.job_number} />
				</div>
				<div class="review-field">
					<label>Project #</label>
					<input type="text" bind:value={parsed.project_number} />
				</div>
				<div class="review-field">
					<label>Contract ID</label>
					<input type="text" bind:value={parsed.contract_id} />
				</div>
				<div class="review-field">
					<label>County</label>
					<input type="text" bind:value={parsed.county} />
				</div>
				<div class="review-field">
					<label>Work Type</label>
					<input type="text" bind:value={parsed.work_type} />
				</div>
				<div class="review-field">
					<label>Contract Type</label>
					<input type="text" bind:value={parsed.contract_type} />
				</div>
				<div class="review-field">
					<label>Contract Amount</label>
					<input type="number" bind:value={parsed.contract_amount} step="0.01" />
				</div>
				<div class="review-field">
					<label>Start Date</label>
					<input type="text" bind:value={parsed.est_start_date} />
				</div>
				<div class="review-field">
					<label>Completion Date</label>
					<input type="text" bind:value={parsed.completion_date} />
				</div>
			</div>
		</section>

		<section class="review-section">
			<h3>Customer / Owner</h3>
			<div class="review-grid">
				<div class="review-field">
					<label>Customer</label>
					<input type="text" bind:value={parsed.customer_name} />
				</div>
				<div class="review-field">
					<label>Contact</label>
					<input type="text" bind:value={parsed.customer_contact} />
				</div>
				<div class="review-field">
					<label>Phone</label>
					<input type="text" bind:value={parsed.customer_phone} />
				</div>
				<div class="review-field">
					<label>Email</label>
					<input type="text" bind:value={parsed.customer_email} />
				</div>
				<div class="review-field">
					<label>Owner</label>
					<input type="text" bind:value={parsed.owner_name} />
				</div>
				<div class="review-field">
					<label>Project Manager</label>
					<input type="text" bind:value={parsed.project_manager} />
				</div>
				<div class="review-field">
					<label>Asphalt Supplier</label>
					<input type="text" bind:value={parsed.asphalt_supplier} />
				</div>
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
								{#each items as it, idx}
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
			<button class="btn btn-ghost" onclick={() => { step = 'upload'; files = []; parsed = null; }}>
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

	.table-note {
		margin: 8px 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
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
		gap: 4px;
	}

	.review-field label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		font-weight: 600;
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
	}
</style>
