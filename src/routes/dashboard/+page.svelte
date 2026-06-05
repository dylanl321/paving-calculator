<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';
	import GeofenceMonitor from '$lib/components/GeofenceMonitor.svelte';
	import JobSiteLocationPicker from '$lib/components/JobSiteLocationPicker.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { PageData } from './$types';
	import { formatDate, formatRelativeTime } from '$lib/utils/format';
	import ViewSwitcher from '$lib/components/ViewSwitcher.svelte';
	import JobSiteCompletenessBar from '$lib/components/JobSiteCompletenessBar.svelte';

	let { data }: { data: PageData } = $props();

	interface DashboardOrg {
		name: string;
		role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer' | 'screed_man' | string;
	}
	interface DashboardUser {
		isGlobalAdmin?: boolean;
		email_verified?: boolean;
	}
	const org = $derived(data.org as DashboardOrg);
	const user = $derived(data.user as DashboardUser);

	// svelte-ignore state_referenced_locally
	let emailVerified = $state((data.user as DashboardUser)?.email_verified ?? true);
	let resendingVerification = $state(false);
	let sortBy = $state<'name' | 'status' | 'completeness' | 'last_activity'>('name');

	const VERIFY_ERROR_MESSAGES: Record<string, string> = {
		missing_token: 'That verification link was missing its token. Try resending the email.',
		invalid_token: 'That verification link is invalid. Try resending the email.',
		expired: 'That verification link expired. Send yourself a fresh one below.',
		already_used: 'That verification link was already used.'
	};

	onMount(() => {
		if (data.verified === 'true') {
			emailVerified = true;
			toastStore.success('Your email has been verified.');
			clearVerifyParams();
		} else if (data.verifyError) {
			toastStore.error(VERIFY_ERROR_MESSAGES[data.verifyError] ?? 'Email verification failed.');
			clearVerifyParams();
		}
	});

	function clearVerifyParams() {
		// Strip the one-shot query params so a refresh doesn't re-toast.
		const url = new URL(window.location.href);
		url.searchParams.delete('verified');
		url.searchParams.delete('verify_error');
		history.replaceState(history.state, '', url.pathname + url.search);
	}

	async function resendVerification() {
		resendingVerification = true;
		try {
			const result = await api.post<{ error?: string; alreadyVerified?: boolean }>('/api/auth/resend-verification');
			toastStore.success('Verification email sent. Check your inbox.');
		} catch (err: any) {
			if (err.body?.alreadyVerified) {
				emailVerified = true;
				toastStore.info('Your email is already verified.');
			}
		} finally {
			resendingVerification = false;
		}
	}

	let showCreateForm = $state(false);
	let newSiteName = $state('');
	let newSiteLocation = $state('');
	let newSiteLat = $state<number | null>(null);
	let newSiteLng = $state<number | null>(null);
	let createError = $state('');
	let creating = $state(false);

	// Quick-start: derive the best job to start today's log on.
	const activeJobs = $derived(
		data.jobSites.filter((s: any) => s.status?.toLowerCase() === 'active')
	);
	// Single active job → direct link. Multiple → dropdown. Zero active → fallback to most-recently-updated.
	const quickStartJob = $derived(
		activeJobs.length === 1
			? activeJobs[0]
			: activeJobs.length === 0
				? [...data.jobSites].sort((a: any, b: any) => (b.updated_at ?? 0) - (a.updated_at ?? 0))[0] ?? null
				: null // multiple active → use dropdown
	);
	let showQuickDropdown = $state(false);
	function handleQuickDropdownKey(e: KeyboardEvent) {
		if (e.key === 'Escape') showQuickDropdown = false;
	}

	const totalSites = $derived(data.jobSites.length);
	const activeSites = $derived(
		data.jobSites.filter((s: any) => s.status?.toLowerCase() === 'active').length
	);
	const loggingToday = $derived(
		data.jobSites.filter((s: any) => s.today_log_open).length
	);
	const totalTonsToday = $derived(
		data.jobSites.reduce((sum: number, s: any) => sum + (s.today_tons || 0), 0)
	);

	const mapSites = $derived(
		data.jobSites.filter((s: any) => s.latitude != null && s.longitude != null)
	);

	const sortedJobSites = $derived.by(() => {
		const sites = [...data.jobSites];
		if (sortBy === 'name') {
			return sites.sort((a: any, b: any) => a.name.localeCompare(b.name));
		} else if (sortBy === 'status') {
			return sites.sort((a: any, b: any) => {
				const statusOrder: Record<string, number> = { active: 0, completed: 1, archived: 2, inactive: 3 };
				return (statusOrder[a.status?.toLowerCase()] ?? 99) - (statusOrder[b.status?.toLowerCase()] ?? 99);
			});
		} else if (sortBy === 'completeness') {
			return sites.sort((a: any, b: any) => {
				const scoreA = a.completeness_score ?? 999;
				const scoreB = b.completeness_score ?? 999;
				return scoreA - scoreB;
			});
		} else if (sortBy === 'last_activity') {
			// Most recent daily log first; sites with no logs go to the bottom.
			return sites.sort((a: any, b: any) => {
				const tsA = a.last_activity ?? 0;
				const tsB = b.last_activity ?? 0;
				return tsB - tsA;
			});
		}
		return sites;
	});


	async function handleCreateJobSite(e: Event) {
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

			toastStore.success('Job site created successfully');
			await goto(`/dashboard/job-sites/${result.id}`);
		} catch (err: any) {
			createError = err.message || 'Failed to create job site';
			creating = false;
		}
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

<GeofenceMonitor sites={data.jobSites} />

<div class="dashboard">
	<div class="page-header">
		<div>
			<h2 class="page-title">Projects</h2>
			<p class="page-subtitle">{org.name}</p>
		</div>
		{#if !showCreateForm}
			<div class="header-actions">
				<a class="btn btn-ghost header-btn" href="/dashboard/job-sites/import">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
						<polyline points="14 2 14 8 20 8"></polyline>
						<line x1="12" y1="18" x2="12" y2="12"></line>
						<line x1="9" y1="15" x2="12" y2="12"></line>
						<line x1="15" y1="15" x2="12" y2="12"></line>
					</svg>
					Import PDF
				</a>
				<button class="btn-primary header-btn" onclick={() => (showCreateForm = true)}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" y1="5" x2="12" y2="19"></line>
						<line x1="5" y1="12" x2="19" y2="12"></line>
					</svg>
					New Project
				</button>
			</div>
		{/if}
	</div>

	{#if !emailVerified}
		<div class="verify-banner" role="status">
			<div class="verify-banner-text">
				<strong>Verify your email</strong>
				<span>Confirm your address to secure your account and enable all notifications.</span>
			</div>
			<button class="verify-resend" onclick={resendVerification} disabled={resendingVerification}>
				{resendingVerification ? 'Sending…' : 'Resend email'}
			</button>
		</div>
	{/if}

	{#if data.jobSites.length > 0}
		<div class="quick-start-bar">
			<div class="quick-start-label">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="12" cy="12" r="10"></circle>
					<polyline points="12 6 12 12 16 14"></polyline>
				</svg>
				<span>Start Today's Log</span>
			</div>
			{#if quickStartJob}
				<a
					href="/dashboard/job-sites/{quickStartJob.id}/log"
					class="quick-start-btn"
				>
					{quickStartJob.name}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				</a>
			{:else if activeJobs.length > 1}
				<div class="quick-start-dropdown-wrap">
					<button
						class="quick-start-btn"
						onclick={() => (showQuickDropdown = !showQuickDropdown)}
						onkeydown={handleQuickDropdownKey}
						aria-haspopup="listbox"
						aria-expanded={showQuickDropdown}
					>
						{activeJobs.length} active projects
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class:rotated={showQuickDropdown}>
							<polyline points="6 9 12 15 18 9"></polyline>
						</svg>
					</button>
					{#if showQuickDropdown}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="quick-start-overlay" onclick={() => (showQuickDropdown = false)}></div>
						<ul class="quick-start-menu" role="listbox" aria-label="Choose a project">
							{#each activeJobs as job}
								<li role="option" aria-selected="false">
									<a
										href="/dashboard/job-sites/{job.id}/log"
										class="quick-start-menu-item"
										onclick={() => (showQuickDropdown = false)}
									>
										<span class="menu-item-name">{job.name}</span>
										{#if job.location_description}
											<span class="menu-item-loc">{job.location_description}</span>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

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
		{#if org.role === 'owner' || org.role === 'admin'}
			<a href="/dashboard/activity" class="quick-link">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
					<line x1="12" y1="18" x2="12" y2="12"></line>
					<line x1="9" y1="15" x2="15" y2="15"></line>
				</svg>
				Audit Log
			</a>
			<a href="/admin/org/crew-productivity" class="quick-link">
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
		{#if user.isGlobalAdmin}
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
				<span class="stat-num">{activeSites}</span>
				<span class="stat-cap">Active Projects</span>
			</div>
			<div class="stat-card">
				<span class="stat-num">{loggingToday}</span>
				<span class="stat-cap">Logging Today</span>
			</div>
			<div class="stat-card">
				<span class="stat-num">{totalTonsToday.toLocaleString()}</span>
				<span class="stat-cap">Tons Today</span>
			</div>
			<div class="stat-card">
				<span class="stat-num">{totalSites}</span>
				<span class="stat-cap">Total Projects</span>
			</div>
		</aside>

		{#if mapSites.length > 0}
			<section class="section map-section">
				<div class="section-header">
					<h3>Project Locations</h3>
					{#if org.role === 'owner' || org.role === 'admin'}
						<a href="/dashboard/map" class="btn-secondary btn-sm">
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
								<circle cx="12" cy="10" r="3"></circle>
							</svg>
							Full Map
						</a>
					{/if}
				</div>
				{#await import('$lib/components/JobSiteMap.svelte')}
					<div class="map-skeleton">
						<Skeleton width="100%" height="280px" borderRadius="var(--radius-md)" />
					</div>
				{:then { default: JobSiteMap }}
					<JobSiteMap sites={mapSites} />
				{/await}
			</section>
		{/if}

		{#if org.role === 'owner' || org.role === 'admin'}
			<section class="section crew-status-section">
				{#await import('$lib/components/LiveCrewDashboard.svelte')}
					<div class="crew-skeleton">
						<Skeleton width="100%" height="160px" borderRadius="var(--radius-md)" />
					</div>
				{:then { default: LiveCrewDashboard }}
					<LiveCrewDashboard />
				{/await}
			</section>
		{/if}

		<section class="main-section">
		<div class="section-header mobile-header">
			<h3>All Projects</h3>
			<div class="header-controls">
				<div class="sort-select-wrapper">
					<label for="sort-by" class="sort-label">Sort:</label>
					<select id="sort-by" class="sort-select" bind:value={sortBy}>
						<option value="name">Name</option>
						<option value="status">Status</option>
						<option value="completeness">Completeness</option>
						<option value="last_activity">Last Activity</option>
					</select>
				</div>
				{#if !showCreateForm}
					<button class="btn-primary" onclick={() => (showCreateForm = true)}>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="12" y1="5" x2="12" y2="19"></line>
							<line x1="5" y1="12" x2="19" y2="12"></line>
						</svg>
						Create Project
					</button>
				{/if}
			</div>
		</div>

		{#if showCreateForm}
			<div class="create-form-card">
				<h4>New Project</h4>
				<form onsubmit={handleCreateJobSite}>
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
				<div class="icon-circle">
					<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" opacity="0.4"></path>
						<polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
						<line x1="12" y1="22.08" x2="12" y2="12"></line>
						<circle cx="12" cy="12" r="2" fill="var(--accent)"></circle>
					</svg>
				</div>
				<h4>No projects yet</h4>
				<p>Create your first project to start planning, tracking, and logging the work</p>
				<button type="button" class="btn-primary" onclick={() => (showCreateForm = true)}>
					Create your first project
				</button>

				<div class="get-started">
					<h5 class="get-started-title">Get started with PaveRate</h5>
					<div class="get-started-cards">
						<a href="/dashboard/team" class="get-started-card">
							<div class="card-icon">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
									<circle cx="9" cy="7" r="4"></circle>
									<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
									<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
								</svg>
							</div>
							<h6>Invite Your Crew</h6>
							<p>Add foremen, operators, and crew members</p>
						</a>
						<a href="/dashboard/settings" class="get-started-card">
							<div class="card-icon">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M4 6h16M4 12h16M4 18h16"></path>
								</svg>
							</div>
							<h6>Configure Defaults</h6>
							<p>Set your mix types, lift thicknesses, and spread rates</p>
						</a>
						<a href="/dashboard/guides" class="get-started-card">
							<div class="card-icon">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
									<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
								</svg>
							</div>
							<h6>Read the Guide</h6>
							<p>Learn how PaveRate helps you hit spec every pour</p>
						</a>
					</div>
					<a href="/dashboard/import" class="import-link">Import existing data?</a>
				</div>
			</div>
		{:else}
			<!-- Card grid for mobile/tablet -->
			<div class="job-sites-grid">
				{#each sortedJobSites as site}
					<a href="/dashboard/job-sites/{site.id}" class="job-site-card">
						<div class="site-header">
							<h4 class="site-name">{site.name}</h4>
							<span class="status-badge status-{site.today_log_open ? 'logging' : site.status.toLowerCase()}">
								{site.today_log_open ? 'Logging' : site.status}
							</span>
						</div>
						{#if site.location_description}
							<p class="site-location">{site.location_description}</p>
						{/if}
						{#if site.crew_name}
							<div class="site-crew">
								<span class="crew-dot" style="background: {site.crew_color || 'var(--accent)'}"></span>
								{site.crew_name}
							</div>
						{/if}
						<div class="site-footer">
							{#if site.today_tons != null && (site.today_tons > 0 || site.today_log_open)}
								<div class="site-stat">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M3 6h18M3 12h18M3 18h18"></path>
									</svg>
									{site.today_tons.toLocaleString()} t today · {site.today_loads ?? 0} loads
								</div>
							{:else}
								<div class="site-stat">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
									</svg>
									{site.calculation_count} calculation{site.calculation_count === 1 ? '' : 's'}
								</div>
							{/if}
							{#if site.last_activity != null && sortBy === 'last_activity'}
								<div class="last-activity-badge">
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<circle cx="12" cy="12" r="10"></circle>
										<polyline points="12 6 12 12 16 14"></polyline>
									</svg>
									{formatRelativeTime(site.last_activity)}
								</div>
							{/if}
							</div>
						{#if site.completeness_score != null}
							<div class="card-completeness">
								<JobSiteCompletenessBar
									score={site.completeness_score}
									status={site.completeness_status}
									compact={false}
								/>
							</div>
						{/if}
					</a>
				{/each}
			</div>

			<!-- Desktop table -->
			<div class="sites-table">
				<div class="sites-table-header">
					<div class="table-cell th-name">Name</div>
					<div class="table-cell th-status">Status</div>
					<div class="table-cell th-location">Location</div>
					<div class="table-cell th-crew">Crew</div>
					<div class="table-cell th-tons">Tons Today</div>
					<div class="table-cell th-calcs">Calcs</div>
					<div class="table-cell th-setup">Setup</div>
					<div class="table-cell th-date">{sortBy === 'last_activity' ? 'Last Active' : 'Created'}</div>
				</div>
				{#each sortedJobSites as site}
					<a href="/dashboard/job-sites/{site.id}" class="sites-table-row">
						<div class="table-cell td-name">{site.name}</div>
						<div class="table-cell td-status">
							<span class="status-badge status-{site.today_log_open ? 'logging' : site.status.toLowerCase()}">
								{site.today_log_open ? 'Logging' : site.status}
							</span>
						</div>
						<div class="table-cell td-location">{site.location_description || '—'}</div>
						<div class="table-cell td-crew">
							{#if site.crew_name}
								<span class="crew-dot" style="background: {site.crew_color || 'var(--accent)'}"></span>
								{site.crew_name}
							{:else}
								—
							{/if}
						</div>
						<div class="table-cell td-tons">
							{#if site.today_tons != null && (site.today_tons > 0 || site.today_log_open)}
								{site.today_tons.toLocaleString()} t · {site.today_loads ?? 0} lds
							{:else}
								—
							{/if}
						</div>
						<div class="table-cell td-calcs">{site.calculation_count}</div>
						<div class="table-cell td-setup">
							{#if site.completeness_score != null}
								<JobSiteCompletenessBar
									score={site.completeness_score}
									status={site.completeness_status}
									compact={true}
								/>
							{:else}
								—
							{/if}
						</div>
						<div class="table-cell td-date">
							{#if sortBy === 'last_activity'}
								{site.last_activity != null ? formatRelativeTime(site.last_activity) : '—'}
							{:else}
								{formatDate(site.created_at)}
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<ViewSwitcher currentView="full" />
</div>
</div>

<style>
	.dashboard {
		width: 100%;
	}

	.verify-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
	}

	.verify-banner-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		color: var(--text);
	}

	.verify-banner-text span {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.verify-resend {
		min-height: var(--touch);
		padding: 0 var(--sp-4);
		border: none;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}

	.verify-resend:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* ── Quick-start bar ─────────────────────────────────────── */
	.quick-start-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
		padding: 14px var(--sp-4);
		background: color-mix(in srgb, var(--accent) 10%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
		border-radius: var(--radius);
	}

	.quick-start-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		color: var(--text);
	}

	.quick-start-label svg {
		color: var(--accent);
		flex-shrink: 0;
	}

	.quick-start-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 20px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		text-decoration: none;
		transition: opacity 0.2s;
		white-space: nowrap;
		max-width: min(100%, 320px);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.quick-start-btn:hover {
		opacity: 0.88;
	}

	.quick-start-dropdown-wrap {
		position: relative;
	}

	.quick-start-overlay {
		position: fixed;
		inset: 0;
		z-index: 10;
	}

	.quick-start-menu {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		z-index: 20;
		min-width: 260px;
		max-width: 340px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		padding: 6px 0;
		list-style: none;
		margin: 0;
	}

	.quick-start-menu-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 16px;
		text-decoration: none;
		color: var(--text);
		min-height: 48px;
		justify-content: center;
		transition: background 0.15s;
	}

	.quick-start-menu-item:hover {
		background: var(--surface-hover);
	}

	.menu-item-name {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.menu-item-loc {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	svg.rotated {
		transform: rotate(180deg);
	}

	/* ─────────────────────────────────────────────────────────── */

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

	.header-actions {
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

	.btn-sm {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 0 12px;
		font-size: 0.85rem;
		text-decoration: none;
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

	.form-field label,
	.form-field .field-label {
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

	.optional-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		font-weight: 400;
	}

	.empty-state {
		text-align: center;
		padding: 48px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.empty-state .icon-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: var(--surface);
		border: 1px solid var(--border);
		margin-bottom: 24px;
	}

	.empty-state svg {
		color: var(--accent);
	}

	.empty-state h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		color: var(--text);
		font-weight: 500;
	}

	.empty-state p {
		margin: 0 0 24px;
		font-size: 0.9rem;
		color: var(--text-muted);
		max-width: 400px;
		line-height: 1.5;
	}

	.empty-state .btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 12px 24px;
		min-height: 48px;
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 500;
		border: none;
		cursor: pointer;
		transition: all 0.2s;
	}

	.empty-state .btn-primary:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	.get-started {
		margin-top: 48px;
		width: 100%;
		max-width: 960px;
	}

	.get-started-title {
		margin: 0 0 24px;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text);
	}

	.get-started-cards {
		display: flex;
		gap: 16px;
		margin-bottom: 24px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		padding-bottom: 4px;
	}

	.get-started-card {
		flex: 0 0 280px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 24px;
		text-align: left;
		text-decoration: none;
		color: var(--text);
		transition: all 0.2s;
		scroll-snap-align: start;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 48px;
	}

	.get-started-card:hover {
		border-color: var(--accent);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.get-started-card:active {
		transform: translateY(0);
	}

	.card-icon {
		width: 48px;
		height: 48px;
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--accent) 15%, var(--surface));
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent);
	}

	.get-started-card h6 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
	}

	.get-started-card p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.import-link {
		display: inline-block;
		color: var(--text-muted);
		font-size: 0.85rem;
		text-decoration: none;
		border-bottom: 1px solid transparent;
		transition: all 0.2s;
		padding: 8px 0;
		min-height: 48px;
		display: inline-flex;
		align-items: center;
	}

	.import-link:hover {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	@media (min-width: 640px) {
		.get-started-cards {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			overflow-x: visible;
		}

		.get-started-card {
			flex: 1;
		}
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

	.status-logging {
		background: var(--accent);
		color: var(--accent-text);
	}

	.status-completed {
		background: color-mix(in srgb, var(--good) 22%, transparent);
		color: var(--good);
	}

	.status-archived {
		background: var(--surface-hover);
		color: var(--text-muted);
	}

	.status-inactive {
		background: var(--text-muted);
		color: var(--bg);
	}

	.site-crew {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text);
		margin-bottom: 4px;
	}

	.crew-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
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

	.completeness-badge {
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.card-completeness {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}

	.last-activity-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.75rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.sort-select-wrapper {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.sort-label {
		font-size: 0.85rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.sort-select {
		padding: 6px 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.85rem;
		min-height: 40px;
		cursor: pointer;
	}

	.sort-select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.map-skeleton,
	.crew-skeleton {
		padding: 0;
	}

	.crew-status-section {
		margin-bottom: 0;
	}

	/* Tablet: 2-col KPI grid */
	@media (min-width: 640px) and (max-width: 1023px) {
		.stats-column {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	/* Desktop: horizontal stats, table layout, density */
	@media (min-width: 1024px) {
		.page-header {
			margin-bottom: 16px;
		}

		.page-title {
			font-size: 1.4rem;
		}

		.dashboard-grid {
			display: flex;
			flex-direction: column;
			gap: var(--sp-4);
		}

		.stats-column {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 12px;
		}

		.stat-card {
			padding: 12px 14px;
			min-height: 72px;
		}

		.stat-num {
			font-size: 1.4rem;
		}

		.header-btn {
			display: inline-flex;
		}

		.header-actions {
			display: flex;
			gap: 10px;
		}

		.mobile-header {
			display: none;
		}

		.section {
			margin-bottom: 24px;
		}

		/* Hide card grid on desktop */
		.job-sites-grid {
			display: none;
		}

		/* Show table on desktop */
		.sites-table {
			display: block;
			width: 100%;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: var(--radius);
			overflow: hidden;
		}

		.sites-table-header {
			display: grid;
			grid-template-columns: 2fr 1fr 2fr 1.5fr 1.5fr 0.8fr 0.8fr 1fr;
			gap: 12px;
			padding: 10px 16px;
			background: var(--bg);
			border-bottom: 1px solid var(--border);
			font-size: 0.75rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--text-muted);
		}

		.sites-table-row {
			display: grid;
			grid-template-columns: 2fr 1fr 2fr 1.5fr 1.5fr 0.8fr 0.8fr 1fr;
			gap: 12px;
			padding: 10px 16px;
			border-bottom: 1px solid var(--border);
			text-decoration: none;
			color: var(--text);
			transition: background 0.15s;
			align-items: center;
			min-height: 36px;
		}

		.sites-table-row:last-child {
			border-bottom: none;
		}

		.sites-table-row:hover {
			background: var(--surface-hover);
		}

		.table-cell {
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.td-name {
			font-weight: 600;
			white-space: nowrap;
		}

		.td-location {
			color: var(--text-muted);
			font-size: 0.85rem;
			white-space: nowrap;
		}

		.td-crew {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 0.85rem;
		}

		.td-tons,
		.td-calcs {
			font-size: 0.85rem;
		}

		.td-date {
			font-size: 0.8rem;
			color: var(--text-muted);
		}

		.sites-table .status-badge {
			font-size: 0.65rem;
			padding: 3px 8px;
		}
	}

	/* Hide table on mobile/tablet */
	@media (max-width: 1023px) {
		.sites-table {
			display: none;
		}
	}

	@media (min-width: 1100px) {
		.dashboard-grid {
			display: flex;
			flex-direction: column;
		}
	}
</style>
