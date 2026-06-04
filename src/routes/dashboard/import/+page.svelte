<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { Upload, Check, AlertCircle, ChevronRight } from 'lucide-svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';

	interface JobSite {
		id: string;
		name: string;
		status: string;
	}

	let step = $state<'upload' | 'review' | 'importing' | 'complete'>('upload');
	let selectedFile = $state<File | null>(null);
	let selectedJobSiteId = $state<string>('');
	let jobSites = $state<JobSite[]>([]);
	let loadingJobSites = $state(true);
	let rowCount = $state(0);
	let previewRows = $state<string[][]>([]);
	let importing = $state(false);
	let importResult = $state<{ imported: number; dates: number; errors?: string[] } | null>(null);
	let error = $state('');

	// Load job sites
	async function loadJobSites() {
		try {
			const data = await api.get<{ job_sites: JobSite[] }>('/api/job-sites');
			jobSites = data.job_sites.filter((s: JobSite) => s.status === 'active');
			loadingJobSites = false;
		} catch (err) {
			error = 'Network error loading job sites';
			loadingJobSites = false;
		}
	}

	loadJobSites();

	// Parse CSV for preview
	function parseCSV(text: string): string[][] {
		const rows: string[][] = [];
		const lines = text.split(/\r?\n/);

		for (const line of lines) {
			if (!line.trim()) continue;

			const row: string[] = [];
			let current = '';
			let inQuotes = false;

			for (let i = 0; i < line.length; i++) {
				const char = line[i];

				if (char === '"') {
					if (inQuotes && line[i + 1] === '"') {
						current += '"';
						i++;
					} else {
						inQuotes = !inQuotes;
					}
				} else if (char === ',' && !inQuotes) {
					row.push(current.trim());
					current = '';
				} else {
					current += char;
				}
			}

			row.push(current.trim());
			rows.push(row);
		}

		return rows;
	}

	// Handle file selection
	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		if (!file.name.toLowerCase().endsWith('.csv')) {
			error = 'Please select a CSV file';
			return;
		}

		error = '';
		selectedFile = file;

		// Parse for preview
		const text = await file.text();
		const rows = parseCSV(text);
		rowCount = rows.length > 0 ? rows.length - 1 : 0; // Exclude header
		previewRows = rows.slice(0, 4); // Header + 3 rows
	}

	// Handle drag and drop
	let dragOver = $state(false);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;

		const file = e.dataTransfer?.files[0];
		if (!file) return;

		if (!file.name.toLowerCase().endsWith('.csv')) {
			error = 'Please select a CSV file';
			return;
		}

		error = '';
		selectedFile = file;

		// Parse for preview
		const text = await file.text();
		const rows = parseCSV(text);
		rowCount = rows.length > 0 ? rows.length - 1 : 0;
		previewRows = rows.slice(0, 4);
	}

	function goToReview() {
		if (!selectedFile) {
			error = 'Please select a file';
			return;
		}
		if (!selectedJobSiteId) {
			error = 'Please select a job site';
			return;
		}
		error = '';
		step = 'review';
	}

	async function startImport() {
		if (!selectedFile || !selectedJobSiteId) return;

		importing = true;
		error = '';
		step = 'importing';

		try {
			const formData = new FormData();
			formData.append('csv', selectedFile);

			const result = await api.post<{ imported: number; dates: number; errors?: string[] }>(`/api/import/csv?job_site_id=${selectedJobSiteId}`, formData);

			importResult = result;
			step = 'complete';
			importing = false;
			toastStore.success(`Import complete: ${result.imported} entries imported`);
		} catch (err) {
			error = 'Network error during import';
			step = 'review';
			importing = false;
		}
	}

	function reset() {
		step = 'upload';
		selectedFile = null;
		selectedJobSiteId = '';
		rowCount = 0;
		previewRows = [];
		importing = false;
		importResult = null;
		error = '';
	}

	const selectedJobSite = $derived(
		jobSites.find((s) => s.id === selectedJobSiteId)
	);
</script>

<svelte:head>
	<title>Import CSV — {config.app.name}</title>
</svelte:head>

<div class="import-page">
	<div class="page-header">
		<h2 class="page-title">Import Historical Data</h2>
		<p class="page-subtitle">Import daily logs from a CSV spreadsheet</p>
	</div>

	{#if step === 'upload'}
		<div class="wizard-container">
			<div class="wizard-step active">
				<div class="step-number">1</div>
				<div class="step-label">Upload CSV</div>
			</div>
			<div class="wizard-step">
				<div class="step-number">2</div>
				<div class="step-label">Review</div>
			</div>
			<div class="wizard-step">
				<div class="step-number">3</div>
				<div class="step-label">Import</div>
			</div>
		</div>

		<div class="card">
			<h3 class="section-title">Select Job Site</h3>
			{#if loadingJobSites}
				<p class="loading-text">Loading job sites...</p>
			{:else if jobSites.length === 0}
				<p class="error-text">No active job sites found. Create a job site first.</p>
			{:else}
				<select bind:value={selectedJobSiteId} class="job-site-select">
					<option value="">Choose a job site...</option>
					{#each jobSites as site}
						<option value={site.id}>{site.name}</option>
					{/each}
				</select>
			{/if}

			<h3 class="section-title" style="margin-top: 2rem;">Upload CSV File</h3>
			<div
				class="upload-zone"
				class:drag-over={dragOver}
				role="group"
				aria-label="CSV file drop zone"
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
			>
				<Upload size={48} />
				<p class="upload-text">Drag and drop your CSV file here</p>
				<p class="upload-subtext">or</p>
				<label class="btn-secondary upload-btn">
					Choose File
					<input type="file" accept=".csv" onchange={handleFileSelect} style="display: none;" />
				</label>
			</div>

			{#if selectedFile}
				<div class="file-info">
					<Check size={20} />
					<div class="file-details">
						<p class="file-name">{selectedFile.name}</p>
						<p class="file-meta">{rowCount} data rows</p>
					</div>
				</div>
			{/if}

			{#if error}
				<div class="error-banner">
					<AlertCircle size={20} />
					<span>{error}</span>
				</div>
			{/if}

			<div class="actions">
				<button class="btn-secondary" onclick={() => goto('/dashboard')}>Cancel</button>
				<button class="btn-primary" onclick={goToReview} disabled={!selectedFile || !selectedJobSiteId}>
					Next: Review
					<ChevronRight size={18} />
				</button>
			</div>
		</div>

		<div class="help-card">
			<h4 class="help-title">CSV Format</h4>
			<p class="help-text">Your CSV file should include a header row with the following columns (case-insensitive):</p>
			<ul class="help-list">
				<li><strong>date</strong> (required) — YYYY-MM-DD format</li>
				<li><strong>timestamp</strong> — HH:MM format (defaults to 08:00)</li>
				<li><strong>entry_type</strong> — paving, milling, tack, break, delay, or note (defaults to paving)</li>
				<li><strong>station_start, station_end</strong> — Station numbers</li>
				<li><strong>distance_ft</strong> — Distance in feet</li>
				<li><strong>tons_placed</strong> — Tons of material</li>
				<li><strong>loads_count</strong> — Number of loads</li>
				<li><strong>spread_rate_actual</strong> — Actual spread rate</li>
				<li><strong>tack_gallons</strong> — Tack coat gallons</li>
				<li><strong>lane, notes</strong> — Text fields</li>
				<li><strong>weather_temp_f, weather_conditions, crew_count, start_time, end_time</strong> — Daily log metadata</li>
			</ul>
		</div>
	{:else if step === 'review'}
		<div class="wizard-container">
			<div class="wizard-step complete">
				<div class="step-number"><Check size={16} /></div>
				<div class="step-label">Upload CSV</div>
			</div>
			<div class="wizard-step active">
				<div class="step-number">2</div>
				<div class="step-label">Review</div>
			</div>
			<div class="wizard-step">
				<div class="step-number">3</div>
				<div class="step-label">Import</div>
			</div>
		</div>

		<div class="card">
			<h3 class="section-title">Review Import</h3>
			<div class="review-info">
				<div class="info-row">
					<span class="info-label">Job Site:</span>
					<span class="info-value">{selectedJobSite?.name}</span>
				</div>
				<div class="info-row">
					<span class="info-label">File:</span>
					<span class="info-value">{selectedFile?.name}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Rows to import:</span>
					<span class="info-value">{rowCount}</span>
				</div>
			</div>

			{#if previewRows.length > 0}
				<h4 class="preview-title">Preview (first 3 rows)</h4>
				<div class="preview-table-container">
					<table class="preview-table">
						<thead>
							<tr>
								{#each previewRows[0] as header}
									<th>{header}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each previewRows.slice(1) as row}
								<tr>
									{#each row as cell}
										<td>{cell}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if error}
				<div class="error-banner">
					<AlertCircle size={20} />
					<span>{error}</span>
				</div>
			{/if}

			<div class="actions">
				<button class="btn-secondary" onclick={() => step = 'upload'}>Back</button>
				<button class="btn-primary" onclick={startImport} disabled={importing}>
					{importing ? 'Importing...' : 'Start Import'}
				</button>
			</div>
		</div>
	{:else if step === 'importing'}
		<div class="wizard-container">
			<div class="wizard-step complete">
				<div class="step-number"><Check size={16} /></div>
				<div class="step-label">Upload CSV</div>
			</div>
			<div class="wizard-step complete">
				<div class="step-number"><Check size={16} /></div>
				<div class="step-label">Review</div>
			</div>
			<div class="wizard-step active">
				<div class="step-number">3</div>
				<div class="step-label">Import</div>
			</div>
		</div>

		<div class="card importing-card">
			<div class="spinner"></div>
			<p class="importing-text">Importing your data...</p>
			<p class="importing-subtext">This may take a moment</p>
		</div>
	{:else if step === 'complete'}
		<div class="wizard-container">
			<div class="wizard-step complete">
				<div class="step-number"><Check size={16} /></div>
				<div class="step-label">Upload CSV</div>
			</div>
			<div class="wizard-step complete">
				<div class="step-number"><Check size={16} /></div>
				<div class="step-label">Review</div>
			</div>
			<div class="wizard-step complete">
				<div class="step-number"><Check size={16} /></div>
				<div class="step-label">Import</div>
			</div>
		</div>

		<div class="card success-card">
			<div class="success-icon">
				<Check size={64} />
			</div>
			<h3 class="success-title">Import Complete!</h3>
			<p class="success-text">
				Successfully imported {importResult?.imported ?? 0} records across {importResult?.dates ?? 0} dates
			</p>

			{#if importResult?.errors && importResult.errors.length > 0}
				<div class="warnings">
					<h4 class="warnings-title">Warnings</h4>
					<ul class="warnings-list">
						{#each importResult.errors.slice(0, 10) as err}
							<li>{err}</li>
						{/each}
						{#if importResult.errors.length > 10}
							<li>...and {importResult.errors.length - 10} more</li>
						{/if}
					</ul>
				</div>
			{/if}

			<div class="actions">
				<button class="btn-secondary" onclick={reset}>Import Another</button>
				<button class="btn-primary" onclick={() => goto('/dashboard')}>
					Back to Dashboard
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.import-page {
		padding: 1.5rem;
		max-width: 900px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 2rem;
	}

	.page-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--text);
		margin: 0 0 0.5rem;
	}

	.page-subtitle {
		font-size: 0.95rem;
		color: var(--text-muted);
		margin: 0;
	}

	.wizard-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-bottom: 2rem;
		padding: 1rem;
		background: var(--surface-alt);
		border-radius: 12px;
	}

	.wizard-step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.wizard-step.active {
		color: var(--accent);
	}

	.wizard-step.complete {
		color: var(--success, #22c55e);
	}

	.step-number {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--surface);
		border: 2px solid var(--border);
		font-weight: 700;
		font-size: 0.85rem;
	}

	.wizard-step.active .step-number {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.wizard-step.complete .step-number {
		background: var(--success, #22c55e);
		color: white;
		border-color: var(--success, #22c55e);
	}

	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 2rem;
	}

	.section-title {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text);
		margin: 0 0 1rem;
	}

	.loading-text {
		color: var(--text-muted);
		margin: 0;
	}

	.error-text {
		color: var(--error, #ef4444);
		margin: 0;
	}

	.job-site-select {
		width: 100%;
		min-height: 48px;
		padding: 0 1rem;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
		font-size: 1rem;
		font-family: inherit;
		cursor: pointer;
	}

	.job-site-select:focus {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.upload-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 3rem 2rem;
		border: 2px dashed var(--border);
		border-radius: 12px;
		background: var(--surface-alt);
		transition: all 0.2s ease;
		color: var(--text-muted);
	}

	.upload-zone.drag-over {
		border-color: var(--accent);
		background: var(--accent-bg, rgba(242, 192, 55, 0.1));
	}

	.upload-text {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
		color: var(--text);
	}

	.upload-subtext {
		font-size: 0.85rem;
		margin: 0;
	}

	.upload-btn {
		margin-top: 0.5rem;
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		margin-top: 1rem;
		background: var(--success-bg, rgba(34, 197, 94, 0.1));
		border: 1px solid var(--success, #22c55e);
		border-radius: 10px;
		color: var(--success, #22c55e);
	}

	.file-details {
		flex: 1;
	}

	.file-name {
		font-weight: 600;
		margin: 0 0 0.25rem;
		color: var(--text);
	}

	.file-meta {
		font-size: 0.85rem;
		margin: 0;
		color: var(--text-muted);
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		margin-top: 1rem;
		background: var(--error-bg, rgba(239, 68, 68, 0.1));
		border: 1px solid var(--error, #ef4444);
		border-radius: 10px;
		color: var(--error, #ef4444);
		font-size: 0.9rem;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 2rem;
	}

	.btn-primary,
	.btn-secondary {
		min-height: 48px;
		padding: 0 1.5rem;
		border-radius: 10px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
		border: none;
	}

	.btn-primary:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: var(--surface-alt);
		color: var(--text);
		border: 1px solid var(--border);
	}

	.btn-secondary:hover {
		background: var(--surface-hover);
	}

	.help-card {
		margin-top: 2rem;
		padding: 1.5rem;
		background: var(--surface-alt);
		border-radius: 12px;
	}

	.help-title {
		font-size: 1rem;
		font-weight: 700;
		margin: 0 0 0.75rem;
		color: var(--text);
	}

	.help-text {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin: 0 0 1rem;
	}

	.help-list {
		margin: 0;
		padding-left: 1.5rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.8;
	}

	.help-list li {
		margin-bottom: 0.5rem;
	}

	.help-list strong {
		color: var(--text);
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.8rem;
	}

	.review-info {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.5rem;
		background: var(--surface-alt);
		border-radius: 10px;
		margin-bottom: 1.5rem;
	}

	.info-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.info-label {
		font-weight: 600;
		color: var(--text-muted);
		min-width: 140px;
	}

	.info-value {
		color: var(--text);
		font-weight: 600;
	}

	.preview-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
		margin: 1.5rem 0 0.75rem;
	}

	.preview-table-container {
		overflow-x: auto;
		border-radius: 10px;
		border: 1px solid var(--border);
	}

	.preview-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.preview-table th {
		background: var(--surface-alt);
		padding: 0.75rem;
		text-align: left;
		font-weight: 700;
		color: var(--text);
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}

	.preview-table td {
		padding: 0.75rem;
		border-bottom: 1px solid var(--border);
		color: var(--text-muted);
	}

	.preview-table tbody tr:last-child td {
		border-bottom: none;
	}

	.importing-card {
		text-align: center;
		padding: 4rem 2rem;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1.5rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.importing-text {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text);
		margin: 0 0 0.5rem;
	}

	.importing-subtext {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin: 0;
	}

	.success-card {
		text-align: center;
		padding: 3rem 2rem;
	}

	.success-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: var(--success-bg, rgba(34, 197, 94, 0.1));
		color: var(--success, #22c55e);
		margin: 0 auto 1.5rem;
	}

	.success-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
		margin: 0 0 0.75rem;
	}

	.success-text {
		font-size: 1rem;
		color: var(--text-muted);
		margin: 0 0 2rem;
	}

	.warnings {
		text-align: left;
		padding: 1rem;
		background: var(--warning-bg, rgba(245, 158, 11, 0.1));
		border: 1px solid var(--warning, #f59e0b);
		border-radius: 10px;
		margin-bottom: 2rem;
	}

	.warnings-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--warning, #f59e0b);
		margin: 0 0 0.75rem;
	}

	.warnings-list {
		margin: 0;
		padding-left: 1.5rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.6;
	}

	@media (max-width: 640px) {
		.import-page {
			padding: 1rem;
		}

		.wizard-container {
			flex-direction: column;
			gap: 0.5rem;
		}

		.card {
			padding: 1.5rem;
		}

		.actions {
			flex-direction: column;
		}

		.actions button {
			width: 100%;
		}

		.info-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
		}

		.info-label {
			min-width: 0;
		}

		.step-label {
			font-size: 0.8rem;
		}
	}
</style>
