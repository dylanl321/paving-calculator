<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import GeofenceMonitor from '$lib/components/GeofenceMonitor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showCreateForm = $state(false);
	let newSiteName = $state('');
	let newSiteLocation = $state('');
	let createError = $state('');
	let creating = $state(false);

	const totalSites = $derived(data.jobSites.length);
	const activeSites = $derived(
		data.jobSites.filter((s: any) => s.status?.toLowerCase() === 'active').length
	);
	const totalCalcs = $derived(
		data.jobSites.reduce((sum: number, s: any) => sum + (s.calculation_count || 0), 0)
	);

	const mapSites = $derived(
		data.jobSites.filter((s: any) => s.latitude != null && s.longitude != null)
	);

	async function handleCreateJobSite(e: Event) {
		e.preventDefault();
		createError = '';
		creating = true;

		try {
			const res = await fetch('/api/job-sites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newSiteName,
					location_description: newSiteLocation || undefined
				}),
				credentials: 'include'
			});

			const result = await res.json();

			if (!res.ok) {
				createError = result.error || 'Failed to create job site';
				creating = false;
				return;
			}

			// Navigate to the new job site
			await goto(`/dashboard/job-sites/${result.id}`);
		} catch (err) {
			createError = 'Network error — check your connection and try again';
			creating = false;
		}
	}

	function cancelCreate() {
		showCreateForm = false;
		newSiteName = '';
		newSiteLocation = '';
		createError = '';
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Dashboard — {config.app.name}</title>
</svelte:head>

<GeofenceMonitor sites={data.jobSites} />

<div class="dashboard">
	<div class="page-header">
		<div>
			<h2 class="page-title">Dashboard</h2>
			<p class="page-subtitle">{data.org.name}</p>
		</div>
		{#if !showCreateForm}
			<button class="btn-primary header-btn" onclick={() => (showCreateForm = true)}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="5" x2="12" y2="19"></line>
					<line x1="5" y1="12" x2="19" y2="12"></line>
				</svg>
				New Job Site
			</button>
		{/if}
	</div>

	<nav class="quick-links">
		<a href="/dashboard/team" class="quick-link">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
				<circle cx="9" cy="7" r="4"></circle>
				<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
				<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
			</svg>
			Team
		</a>
		<a href="/dashboard/settings" class="quick-link">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3"></circle>
				<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
			</svg>
			Settings
		</a>
		{#if data.org.role === 'owner' || data.org.role === 'admin'}
			<a href="/dashboard/audit" class="quick-link">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
					<line x1="12" y1="18" x2="12" y2="12"></line>
					<line x1="9" y1="15" x2="15" y2="15"></line>
				</svg>
				Audit Log
			</a>
			<a href="/dashboard/admin/crew-productivity" class="quick-link">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
					<circle cx="9" cy="7" r="4"></circle>
					<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
					<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
					<polyline points="16 16 18 18 22 14"></polyline>
				</svg>
				Crew Productivity
			</a>
		{/if}
		{#if data.user.isGlobalAdmin}
			<a href="/admin" class="quick-link admin">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="3"></circle>
					<path d="M12 1v6m0 6v6m5.2-13.2-4.2 4.2m0 6 4.2 4.2M1 12h6m6 0h6M2.8 7.8l4.2 4.2m6 0 4.2 4.2"></path>
				</svg>
				Admin
			</a>
		{/if}
	</nav>

	<div class="dashboard-grid">
		<aside class="stats-column">
			<div class="stat-card">
				<span class="stat-num">{totalSites}</span>
				<span class="stat-cap">Total Sites</span>
			</div>
			<div class="stat-card">
				<span class="stat-num">{activeSites}</span>
				<span class="stat-cap">Active</span>
			</div>
			<div class="stat-card">
				<span class="stat-num">{totalCalcs}</span>
				<span class="stat-cap">Calculations</span>
			</div>
		</aside>

		{#if mapSites.length > 0}
			<section class="section map-section">
				<div class="section-header">
					<h3>Job Site Locations</h3>
				</div>
				{#await import('$lib/components/JobSiteMap.svelte')}
					<div class="map-loading">Loading map&hellip;</div>
				{:then { default: JobSiteMap }}
					<JobSiteMap sites={mapSites} />
				{/await}
			</section>
		{/if}

		{#if data.org.role === 'owner' || data.org.role === 'admin'}
			<section class="section crew-status-section">
				{#await import('$lib/components/LiveCrewDashboard.svelte')}
					<div class="map-loading">Loading crew status&hellip;</div>
				{:then { default: LiveCrewDashboard }}
					<LiveCrewDashboard />
				{/await}
			</section>
		{/if}

		<section class="main-section">
		<div class="section-header mobile-header">
			<h3>Active Job Sites</h3>
			{#if !showCreateForm}
				<button class="btn-primary" onclick={() => (showCreateForm = true)}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" y1="5" x2="12" y2="19"></line>
						<line x1="5" y1="12" x2="19" y2="12"></line>
					</svg>
					Create Job Site
				</button>
			{/if}
		</div>

		{#if showCreateForm}
			<div class="create-form-card">
				<h4>New Job Site</h4>
				<form onsubmit={handleCreateJobSite}>
					<div class="form-field">
						<label for="site-name">Site Name</label>
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

					{#if createError}
						<div class="error-message">{createError}</div>
					{/if}

					<div class="form-actions">
						<button type="button" class="btn-secondary" onclick={cancelCreate} disabled={creating}>
							Cancel
						</button>
						<button type="submit" class="btn-primary" disabled={creating}>
							{creating ? 'Creating...' : 'Create'}
						</button>
					</div>
				</form>
			</div>
		{/if}

		{#if data.jobSites.length === 0}
			<div class="empty-state">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
					<polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
					<line x1="12" y1="22.08" x2="12" y2="12"></line>
				</svg>
				<h4>No job sites yet</h4>
				<p>Create your first job site to start tracking calculations</p>
			</div>
		{:else}
			<div class="job-sites-grid">
				{#each data.jobSites as site}
					<a href="/dashboard/job-sites/{site.id}" class="job-site-card">
						<div class="site-header">
							<h4 class="site-name">{site.name}</h4>
							<span class="status-badge status-{site.status.toLowerCase()}">{site.status}</span>
						</div>
						{#if site.location_description}
							<p class="site-location">{site.location_description}</p>
						{/if}
						<div class="site-footer">
							<div class="site-stat">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
								</svg>
								{site.calculation_count} calculation{site.calculation_count === 1 ? '' : 's'}
							</div>
							<div class="site-date">
								{formatDate(site.created_at)}
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
</div>

<style>
	.dashboard {
		width: 100%;
	}

	.dashboard-grid {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.stats-column {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 14px;
	}

	.main-section {
		width: 100%;
	}

	.header-btn {
		display: none;
	}

	.stat-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-num {
		font-size: 2rem;
		font-weight: 800;
		color: var(--accent);
		line-height: 1;
	}

	.stat-cap {
		font-size: 0.8rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 24px;
		flex-wrap: wrap;
		gap: 16px;
	}

	.page-title {
		font-size: 1.75rem;
		margin: 0 0 4px;
	}

	.page-subtitle {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.quick-links {
		display: flex;
		gap: 12px;
		margin-bottom: 24px;
		flex-wrap: wrap;
	}

	.quick-link {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		border-radius: var(--radius);
		font-weight: 500;
		min-height: 48px;
		transition: background 0.2s;
	}

	.quick-link:hover {
		background: var(--surface-hover);
	}

	.quick-link.admin {
		background: var(--accent);
		color: var(--accent-text);
	}

	.quick-link.admin:hover {
		opacity: 0.9;
	}

	.section {
		margin-bottom: 32px;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.section-header h3 {
		margin: 0;
		font-size: 1.2rem;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 16px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		min-height: 44px;
		padding: 0 16px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--surface-alt);
	}

	.btn-secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.create-form-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.create-form-card h4 {
		margin: 0 0 16px;
		font-size: 1.1rem;
	}

	.form-field {
		margin-bottom: 16px;
	}

	.form-field label {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 6px;
	}

	.form-field input {
		width: 100%;
		min-height: 48px;
		padding: 0 14px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 1rem;
		transition: border-color 0.2s;
	}

	.form-field input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.error-message {
		padding: 10px 14px;
		background: rgba(var(--bad-rgb, 255, 100, 100), 0.1);
		border: 1px solid var(--bad);
		border-radius: var(--radius);
		color: var(--bad);
		font-size: 0.85rem;
		margin-bottom: 16px;
	}

	.form-actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}

	.empty-state {
		text-align: center;
		padding: 48px 20px;
		color: var(--text-muted);
	}

	.empty-state svg {
		opacity: 0.5;
		margin-bottom: 16px;
	}

	.empty-state h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		color: var(--text);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
	}

	.job-sites-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 14px;
	}

	.job-site-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 18px;
		transition: all 0.2s;
		display: block;
	}

	.job-site-card:hover {
		border-color: var(--accent);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.site-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 10px;
		margin-bottom: 8px;
	}

	.site-name {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.3;
	}

	.status-badge {
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
	}

	.status-active {
		background: var(--good);
		color: var(--accent-text);
	}

	.status-inactive {
		background: var(--text-muted);
		color: var(--bg);
	}

	.site-location {
		margin: 0 0 12px;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.site-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}

	.site-stat {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.site-stat svg {
		width: 14px;
		height: 14px;
	}

	.site-date {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.map-loading {
		padding: 40px 20px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.875rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
	}

	.crew-status-section {
		margin-bottom: 0;
	}

	@media (min-width: 1100px) {
		.dashboard-grid {
			display: grid;
			grid-template-columns: 340px 1fr;
			gap: var(--sp-6);
			align-items: start;
		}

		.stats-column {
			display: flex;
			flex-direction: column;
			gap: 14px;
		}

		.header-btn {
			display: inline-flex;
		}

		.mobile-header {
			display: none;
		}
	}
</style>
