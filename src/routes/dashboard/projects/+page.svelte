<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';
	import type { PageData } from './$types';
	import type { EnrichedProject } from '$lib/loaders/project-summaries';
	import { formatDate } from '$lib/utils/format';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import CardGrid from '$lib/components/ui/CardGrid.svelte';
	import JobSiteCompletenessBar from '$lib/components/JobSiteCompletenessBar.svelte';
	import JobSiteLocationPicker from '$lib/components/JobSiteLocationPicker.svelte';
	import { getUxRole, type UxRole } from '$lib/uxRole';

	let { data }: { data: PageData } = $props();

	interface ProjectsOrg {
		name: string;
		role: string;
	}
	const org = $derived(data.org as ProjectsOrg);

	type SortKey = 'name' | 'status' | 'completeness' | 'last_activity' | 'contract' | 'created';
	type StatusFilter = 'all' | 'active' | 'completed' | 'archived';

	const statusOptions: { value: StatusFilter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'active', label: 'Active' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'archived', label: 'Archived' }
	];

	// ── Role presets ─────────────────────────────────────────────────────
	// The derived UX role only sets the *initial* sort/filter and which column
	// the table emphasizes. Every control stays fully interactive afterward.
	const uxRole = $derived<UxRole>(getUxRole(org?.role ?? ''));

	type ColumnEmphasis = 'contract' | 'setup' | 'today';
	interface RolePreset {
		sortBy: SortKey;
		statusFilter: StatusFilter;
		/** Column/badge the table + cards lean into for this role. */
		emphasis: ColumnEmphasis;
	}

	const ROLE_PRESETS: Record<UxRole, RolePreset> = {
		// Owner: portfolio value & risk first.
		owner: { sortBy: 'contract', statusFilter: 'all', emphasis: 'contract' },
		// Admin/Office: setup gaps first (lowest completeness surfaces at top).
		admin_office: { sortBy: 'completeness', statusFilter: 'all', emphasis: 'setup' },
		// Foreman: today's active work first.
		foreman: { sortBy: 'last_activity', statusFilter: 'active', emphasis: 'today' },
		// Field crew lands elsewhere; keep a neutral, safe default if they arrive.
		field_crew: { sortBy: 'last_activity', statusFilter: 'active', emphasis: 'today' }
	};

	const preset = $derived(ROLE_PRESETS[uxRole]);
	const emphasis = $derived<ColumnEmphasis>(preset.emphasis);

	let sortBy = $state<SortKey>('name');
	let statusFilter = $state<StatusFilter>('all');
	let search = $state('');

	// Apply the role preset once the role is known. Tracked so a role change
	// (re-auth) re-seeds defaults, but user edits afterward stick within a view.
	let presetApplied = $state(false);
	$effect(() => {
		const p = preset;
		if (!presetApplied) {
			sortBy = p.sortBy;
			statusFilter = p.statusFilter;
			presetApplied = true;
		}
	});

	const projects = $derived(data.projects as EnrichedProject[]);

	function contractValue(p: EnrichedProject): number | null {
		return p.total_contract_value ?? p.contract_amount ?? null;
	}

	function formatMoney(value: number | null): string {
		if (value == null) return '—';
		return value.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 0
		});
	}

	const filteredProjects = $derived.by(() => {
		const q = search.trim().toLowerCase();
		let list = projects.filter((p) => {
			if (statusFilter !== 'all' && p.status?.toLowerCase() !== statusFilter) return false;
			if (q) {
				const haystack = [
					p.name,
					p.location_description,
					p.customer_name,
					p.job_number,
					p.project_number,
					p.work_type,
					p.crew_name
				]
					.filter(Boolean)
					.join(' ')
					.toLowerCase();
				if (!haystack.includes(q)) return false;
			}
			return true;
		});
		list = [...list];
		switch (sortBy) {
			case 'name':
				return list.sort((a, b) => a.name.localeCompare(b.name));
			case 'status': {
				const order: Record<string, number> = { active: 0, completed: 1, archived: 2 };
				return list.sort(
					(a, b) =>
						(order[a.status?.toLowerCase()] ?? 99) - (order[b.status?.toLowerCase()] ?? 99)
				);
			}
			case 'completeness':
				return list.sort(
					(a, b) => (a.completeness_score ?? 999) - (b.completeness_score ?? 999)
				);
			case 'last_activity':
				return list.sort((a, b) => (b.last_activity ?? 0) - (a.last_activity ?? 0));
			case 'contract':
				return list.sort((a, b) => (contractValue(b) ?? 0) - (contractValue(a) ?? 0));
			case 'created':
				return list.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
			default:
				return list;
		}
	});

	const resultsLabel = $derived(
		filteredProjects.length === projects.length
			? `${projects.length} project${projects.length === 1 ? '' : 's'}`
			: `${filteredProjects.length} of ${projects.length}`
	);

	// ── New Project create form (moved from Home) ─────────────────────────
	let showCreateForm = $state(false);
	let newSiteName = $state('');
	let newSiteLocation = $state('');
	let newSiteLat = $state<number | null>(null);
	let newSiteLng = $state<number | null>(null);
	let createError = $state('');
	let creating = $state(false);

	async function handleCreateProject(e: Event) {
		e.preventDefault();
		createError = '';
		creating = true;
		try {
			const result = await api.post<{ id?: string }>('/api/job-sites', {
				name: newSiteName,
				location_description: newSiteLocation || undefined,
				latitude: newSiteLat ?? undefined,
				longitude: newSiteLng ?? undefined
			});
			toastStore.success('Project created successfully');
			await goto(`/dashboard/job-sites/${result.id}`);
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create project';
			creating = false;
		}
	}

	function openCreate() {
		showCreateForm = true;
	}

	function cancelCreate() {
		showCreateForm = false;
		newSiteName = '';
		newSiteLocation = '';
		newSiteLat = null;
		newSiteLng = null;
		createError = '';
	}
</script>

<svelte:head>
	<title>Projects — {config.app.name}</title>
</svelte:head>

<div class="projects-page">
	<PageHeader title="Projects" subtitle={org?.name}>
		{#snippet actions()}
			<Button variant="ghost" href="/dashboard/job-sites/import">Import PDF</Button>
			<Button onclick={openCreate}>New Project</Button>
		{/snippet}
	</PageHeader>

	{#if showCreateForm}
		<div class="create-form-card">
			<h2>New Project</h2>
			<form onsubmit={handleCreateProject}>
				<div class="form-field">
					<label for="site-name">Project Name</label>
					<input
						type="text"
						id="site-name"
						bind:value={newSiteName}
						required
						placeholder="I-85 Northbound Resurfacing"
					/>
				</div>

				<div class="form-field">
					<label for="site-location">Location Description</label>
					<input
						type="text"
						id="site-location"
						bind:value={newSiteLocation}
						placeholder="Mile marker 42-48"
					/>
				</div>

				<div class="form-field">
					<span class="field-label">Map Pin <span class="optional-label">(optional)</span></span>
					<JobSiteLocationPicker
						bind:latitude={newSiteLat}
						bind:longitude={newSiteLng}
						mapHeight="220px"
					/>
				</div>

				{#if createError}
					<div class="error-message">{createError}</div>
				{/if}

				<div class="form-actions">
					<Button variant="secondary" onclick={cancelCreate} disabled={creating}>Cancel</Button>
					<Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
				</div>
			</form>
		</div>
	{/if}

	{#if projects.length === 0}
		<div class="empty-state">
			<div class="icon-circle">
				<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" opacity="0.4"></path>
					<polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
					<line x1="12" y1="22.08" x2="12" y2="12"></line>
				</svg>
			</div>
			<h2>No projects yet</h2>
			<p>Create your first project to start planning, tracking, and logging the work.</p>
			<div class="empty-actions">
				<Button onclick={openCreate}>Create your first project</Button>
				<Button variant="ghost" href="/dashboard/job-sites/import">Import from PDF</Button>
			</div>
		</div>
	{:else}
		<div class="controls">
			<div class="search-wrap">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="11" cy="11" r="8"></circle>
					<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
				</svg>
				<input
					type="search"
					class="search-input"
					placeholder="Search projects, customers, job numbers…"
					bind:value={search}
					aria-label="Search projects"
				/>
			</div>
			<div class="control-group">
				<div
					class="segmented"
					role="group"
					aria-label="Filter by status"
				>
					{#each statusOptions as opt (opt.value)}
						<button
							type="button"
							class="segment"
							class:segment--active={statusFilter === opt.value}
							aria-pressed={statusFilter === opt.value}
							onclick={() => (statusFilter = opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
				<label class="control-field">
					<span class="control-label">Sort</span>
					<select class="control-select" bind:value={sortBy} aria-label="Sort projects">
						<option value="name">Name</option>
						<option value="status">Status</option>
						<option value="contract">Contract value</option>
						<option value="completeness">Completeness</option>
						<option value="last_activity">Last activity</option>
						<option value="created">Recently created</option>
					</select>
				</label>
			</div>
		</div>

		<p class="results-count" aria-live="polite">{resultsLabel}</p>

		{#if filteredProjects.length === 0}
			<div class="no-results">
				<p>No projects match your filters.</p>
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						search = '';
						statusFilter = 'all';
					}}
				>
					Clear filters
				</Button>
			</div>
		{:else}
			<!-- Card grid (mobile / tablet) -->
			<CardGrid min="280px" gap="var(--sp-3)">
				{#each filteredProjects as project (project.id)}
					<a href="/dashboard/job-sites/{project.id}" class="project-card">
						<div class="card-primary">
							<h3 class="card-name">{project.name}</h3>
							<StatusBadge
								status={project.today_log_open ? 'logging' : project.status}
								label={project.today_log_open ? 'Logging' : undefined}
							/>
						</div>
						<div class="card-value" class:card-value--emphasis={emphasis === 'contract'}>
							{formatMoney(contractValue(project))}
						</div>
						{#if project.customer_name}
							<p class="card-customer">{project.customer_name}</p>
						{:else if project.location_description}
							<p class="card-customer">{project.location_description}</p>
						{/if}
						{#if project.crew_name}
							<div class="card-crew">
								<span class="crew-dot" style="background: {project.crew_color || 'var(--accent)'}"></span>
								{project.crew_name}
							</div>
						{/if}
						<dl class="card-meta">
							<div class="meta-item">
								<dt>Start</dt>
								<dd>{formatDate(project.est_start_date)}</dd>
							</div>
							<div class="meta-item">
								<dt>Completion</dt>
								<dd>{formatDate(project.completion_date)}</dd>
							</div>
							{#if project.today_tons != null && (project.today_tons > 0 || project.today_log_open)}
								<div class="meta-item meta-item--today" class:meta-item--emphasis={emphasis === 'today'}>
									<dt>Today</dt>
									<dd>{project.today_tons.toLocaleString()} t · {project.today_loads ?? 0} lds</dd>
								</div>
							{/if}
						</dl>
						<!-- Single progress bar: setup completeness (the only real
						     per-job progress available on EnrichedProject). -->
						<div class="card-progress" class:card-progress--emphasis={emphasis === 'setup'}>
							{#if project.completeness_score != null}
								<JobSiteCompletenessBar
									score={project.completeness_score}
									status={project.completeness_status}
									compact={false}
								/>
							{:else}
								<span class="progress-empty">Setup status unavailable</span>
							{/if}
						</div>
					</a>
				{/each}
			</CardGrid>

			<!-- Table (desktop) -->
			<div class="projects-table">
				<div class="table-head">
					<div class="th th-name">Name</div>
					<div class="th th-status">Status</div>
					<div class="th th-customer">Customer</div>
					<div class="th th-contract" class:th--emphasis={emphasis === 'contract'}>Contract</div>
					<div class="th th-dates">Start → Completion</div>
					<div class="th th-crew">Crew</div>
					<div class="th th-tons" class:th--emphasis={emphasis === 'today'}>Tons Today</div>
					<div class="th th-setup" class:th--emphasis={emphasis === 'setup'}>Setup</div>
				</div>
				{#each filteredProjects as project (project.id)}
					<a href="/dashboard/job-sites/{project.id}" class="table-row">
						<div class="td td-name">{project.name}</div>
						<div class="td td-status">
							<StatusBadge
								status={project.today_log_open ? 'logging' : project.status}
								label={project.today_log_open ? 'Logging' : undefined}
							/>
						</div>
						<div class="td td-customer">{project.customer_name || '—'}</div>
						<div class="td td-contract" class:td--emphasis={emphasis === 'contract'}>
							{formatMoney(contractValue(project))}
						</div>
						<div class="td td-dates">
							{formatDate(project.est_start_date)} → {formatDate(project.completion_date)}
						</div>
						<div class="td td-crew">
							{#if project.crew_name}
								<span class="crew-dot" style="background: {project.crew_color || 'var(--accent)'}"></span>
								{project.crew_name}
							{:else}
								—
							{/if}
						</div>
						<div class="td td-tons" class:td--emphasis={emphasis === 'today'}>
							{#if project.today_tons != null && (project.today_tons > 0 || project.today_log_open)}
								{project.today_tons.toLocaleString()} t · {project.today_loads ?? 0} lds
							{:else}
								—
							{/if}
						</div>
						<div class="td td-setup" class:td--emphasis={emphasis === 'setup'}>
							{#if project.completeness_score != null}
								<JobSiteCompletenessBar
									score={project.completeness_score}
									status={project.completeness_status}
									compact={true}
								/>
							{:else}
								—
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.projects-page {
		width: 100%;
	}

	/* ── Create form ─────────────────────────────────────────── */
	.create-form-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-5);
		margin-bottom: var(--sp-5);
	}

	.create-form-card h2 {
		margin: 0 0 var(--sp-4);
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
	}

	.form-field {
		margin-bottom: var(--sp-4);
	}

	.form-field label,
	.form-field .field-label {
		display: block;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		margin-bottom: var(--sp-2);
	}

	.form-field input {
		width: 100%;
		min-height: var(--touch);
		padding: 0 var(--sp-3);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
		transition: border-color var(--dur) var(--ease);
	}

	.form-field input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.optional-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		font-weight: var(--fw-normal);
	}

	.error-message {
		padding: var(--sp-2) var(--sp-3);
		background: color-mix(in srgb, var(--bad) 12%, transparent);
		border: 1px solid var(--bad);
		border-radius: var(--radius-md);
		color: var(--bad);
		font-size: var(--fs-sm);
		margin-bottom: var(--sp-4);
	}

	.form-actions {
		display: flex;
		gap: var(--sp-2);
		justify-content: flex-end;
	}

	/* ── Controls ────────────────────────────────────────────── */
	.controls {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.search-wrap {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 0 var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-muted);
	}

	.search-wrap:focus-within {
		border-color: var(--accent);
	}

	.search-input {
		flex: 1;
		min-height: var(--touch);
		border: none;
		background: transparent;
		color: var(--text);
		font-size: var(--fs-md);
	}

	.search-input:focus {
		outline: none;
	}

	.control-group {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	/* ── Segmented status control ────────────────────────────── */
	.segmented {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.segment {
		min-height: 42px;
		padding: 0 var(--sp-3);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		border-radius: calc(var(--radius-md) - 3px);
		cursor: pointer;
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}

	.segment:hover {
		color: var(--text);
	}

	.segment:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.segment--active {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}

	@media (max-width: 640px) {
		.segmented {
			width: 100%;
		}
		.segment {
			flex: 1;
		}
	}

	.control-field {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.control-label {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-weight: var(--fw-semibold);
	}

	.control-select {
		min-height: 44px;
		padding: 0 var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-sm);
		cursor: pointer;
	}

	.control-select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.results-count {
		margin: 0 0 var(--sp-4);
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.no-results {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-8) var(--sp-4);
		color: var(--text-muted);
		text-align: center;
	}

	.no-results p {
		margin: 0;
	}

	/* ── Empty state ─────────────────────────────────────────── */
	.empty-state {
		text-align: center;
		padding: var(--sp-8) var(--sp-4);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.icon-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: var(--surface);
		border: 1px solid var(--border);
		margin-bottom: var(--sp-5);
		color: var(--accent);
	}

	.empty-state h2 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
	}

	.empty-state p {
		margin: 0 0 var(--sp-5);
		font-size: var(--fs-md);
		color: var(--text-muted);
		max-width: 420px;
		line-height: 1.5;
	}

	.empty-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		justify-content: center;
	}

	/* ── Card grid ───────────────────────────────────────────── */
	/* CardGrid (.card-grid-x) provides the equal-height grid; the card just
	   needs to fill its row. */
	.project-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		height: 100%;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		text-decoration: none;
		color: var(--text);
		transition:
			border-color var(--dur) var(--ease),
			transform var(--dur) var(--ease),
			box-shadow var(--dur) var(--ease);
	}

	.project-card:hover {
		border-color: var(--accent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.project-card:hover {
			transform: translateY(-2px);
			box-shadow: var(--shadow-md);
		}
	}

	/* Primary line: name + status badge. */
	.card-primary {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--sp-2);
	}

	.card-name {
		margin: 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		line-height: 1.3;
	}

	/* Contract value — the second half of the primary line. */
	.card-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		color: var(--text);
	}

	.card-value--emphasis {
		color: var(--accent);
	}

	.card-customer {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.card-crew {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
	}

	.crew-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.card-meta {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--sp-2);
		margin: var(--sp-2) 0 0;
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
	}

	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.meta-item dt {
		font-size: var(--fs-2xs);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.meta-item dd {
		margin: 0;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
	}

	.meta-item--emphasis dd {
		color: var(--accent);
	}

	/* Single progress bar pinned to the bottom so equal-height cards align. */
	.card-progress {
		margin-top: auto;
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
	}

	.card-progress--emphasis {
		border-top-color: var(--accent);
	}

	.progress-empty {
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	/* ── Desktop table ───────────────────────────────────────── */
	.projects-table {
		display: none;
	}

	@media (min-width: 1024px) {
		:global(.projects-page .card-grid-x) {
			display: none;
		}

		.controls {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}

		.search-wrap {
			flex: 1;
			max-width: 420px;
		}

		.projects-table {
			display: block;
			width: 100%;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: var(--radius-md);
			overflow: hidden;
		}

		.table-head,
		.table-row {
			display: grid;
			grid-template-columns: 2.2fr 0.9fr 1.4fr 1.1fr 1.7fr 1.1fr 1.1fr 1.3fr;
			gap: var(--sp-3);
			padding: var(--sp-2) var(--sp-4);
			align-items: center;
		}

		.table-head {
			background: var(--bg);
			border-bottom: 1px solid var(--border);
			font-size: var(--fs-2xs);
			font-weight: var(--fw-bold);
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--text-muted);
		}

		.table-row {
			border-bottom: 1px solid var(--border);
			text-decoration: none;
			color: var(--text);
			min-height: 44px;
			transition: background var(--dur) var(--ease);
		}

		.table-row:last-child {
			border-bottom: none;
		}

		.table-row:hover {
			background: var(--surface-hover);
		}

		.td,
		.th {
			overflow: hidden;
			text-overflow: ellipsis;
		}

		/* Numeric columns share one alignment + width discipline. */
		.th-contract,
		.th-tons,
		.td-contract,
		.td-tons {
			text-align: right;
		}

		.td-name {
			font-weight: var(--fw-semibold);
			white-space: nowrap;
		}

		.td-customer,
		.td-dates {
			font-size: var(--fs-sm);
			color: var(--text-muted);
			white-space: nowrap;
		}

		.td-contract,
		.td-tons {
			font-size: var(--fs-sm);
			font-variant-numeric: tabular-nums;
			white-space: nowrap;
		}

		.td-crew {
			display: flex;
			align-items: center;
			gap: var(--sp-2);
			font-size: var(--fs-sm);
		}

		/* Role emphasis: lift the preset's column out of the muted defaults. */
		.th--emphasis {
			color: var(--accent);
		}

		.td--emphasis {
			color: var(--text);
			font-weight: var(--fw-semibold);
		}
	}
</style>
