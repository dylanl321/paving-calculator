<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import {
		Check,
		ChevronRight,
		ChevronLeft,
		MapPin,
		Building2,
		Settings,
		Star
	} from 'lucide-svelte';
	import JobSiteLocationPicker from '$lib/components/JobSiteLocationPicker.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	// Step state
	let currentStep = $state(1);
	const totalSteps = 5;

	// Step 1: Role selection
	let selectedRole = $state<string>('');
	const roles = [
		{ id: 'foreman', label: 'Foreman', desc: 'Manage crews and track paving jobs' },
		{ id: 'inspector', label: 'Inspector', desc: 'Verify specs and quality control' },
		{ id: 'office', label: 'Office', desc: 'Admin, estimating, and reporting' },
		{ id: 'owner', label: 'Owner', desc: 'Oversight and business management' }
	];

	// Step 2: Org setup
	let orgName = $state('');
	let inviteCode = $state('');
	let loadingOrg = $state(true);

	// Step 3: First job site
	let siteName = $state('');
	let siteLatitude = $state<number | null>(null);
	let siteLongitude = $state<number | null>(null);
	let roadLength = $state<number | null>(null);
	let creatingJobSite = $state(false);
	let jobSiteCreated = $state(false);

	// Step 4: Defaults
	let mixType = $state('SP-9.5');
	let liftThickness = $state(2);
	let roadWidth = $state(12);

	// Validation
	const canProceed = $derived(
		currentStep === 1 ? selectedRole !== '' : true
	);

	function nextStep() {
		if (currentStep < totalSteps) {
			currentStep++;
		} else {
			completeOnboarding();
		}
	}

	function prevStep() {
		if (currentStep > 1) {
			currentStep--;
		}
	}

	function selectRole(roleId: string) {
		selectedRole = roleId;
		if (browser) {
			localStorage.setItem('onboarding_role', roleId);
		}
	}

	async function fetchOrg() {
		try {
			const res = await fetch('/api/org');
			if (res.ok) {
				const data = await res.json();
				orgName = data.name || 'Your Organization';
			}
		} catch (e) {
			console.error('Failed to load org:', e);
			orgName = 'Your Organization';
		} finally {
			loadingOrg = false;
		}
	}

	async function createJobSite() {
		if (!siteName.trim()) return;
		creatingJobSite = true;
		try {
			const locationDesc = roadLength ? `Road length: ${roadLength}ft` : '';
			const res = await fetch('/api/job-sites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: siteName,
					latitude: siteLatitude,
					longitude: siteLongitude,
					location_description: locationDesc
				})
			});
			if (res.ok) {
				jobSiteCreated = true;
				toastStore.success('Job site created');
			} else {
				toastStore.error('Failed to create job site');
			}
		} catch (e) {
			console.error('Failed to create job site:', e);
			toastStore.error('Failed to create job site');
		} finally {
			creatingJobSite = false;
		}
	}

	function skipJobSite() {
		nextStep();
	}

	function saveDefaults() {
		if (browser) {
			localStorage.setItem(
				'onboarding_defaults',
				JSON.stringify({
					mixType,
					liftThickness,
					roadWidth
				})
			);
		}
		nextStep();
	}

	function skipDefaults() {
		nextStep();
	}

	function completeOnboarding() {
		if (browser) {
			localStorage.setItem('onboarding_complete', '1');
			goto('/dashboard');
		}
	}

	onMount(() => {
		if (currentStep === 2) {
			fetchOrg();
		}
	});

	// Auto-fetch org when reaching step 2
	$effect(() => {
		if (currentStep === 2 && loadingOrg) {
			fetchOrg();
		}
	});
</script>

<div class="onboarding-wrapper">
	<div class="onboarding-container">
		<!-- Header -->
		<header class="onboarding-header">
			<div class="logo">
				<Star size={32} strokeWidth={2.5} />
			</div>
			<h1>PaveRate</h1>
			<p class="step-indicator">Step {currentStep} of {totalSteps}</p>
		</header>

		<!-- Progress dots -->
		<div class="progress-dots">
			{#each Array(totalSteps) as _, i}
				<div class="dot" class:active={i + 1 <= currentStep} class:current={i + 1 === currentStep}></div>
			{/each}
		</div>

		<!-- Step 1: Welcome & Role Selection -->
		{#if currentStep === 1}
			<div class="step-card">
				<h2>Welcome to PaveRate</h2>
				<p class="subtitle">Built for asphalt crews</p>

				<div class="role-grid">
					{#each roles as role}
						<button
							type="button"
							class="role-card"
							class:selected={selectedRole === role.id}
							onclick={() => selectRole(role.id)}
						>
							<div class="role-label">{role.label}</div>
							<div class="role-desc">{role.desc}</div>
							{#if selectedRole === role.id}
								<div class="role-check">
									<Check size={20} />
								</div>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Step 2: Org Setup -->
		{#if currentStep === 2}
			<div class="step-card">
				<div class="step-icon">
					<Building2 size={32} />
				</div>
				<h2>Your Organization</h2>

				{#if loadingOrg}
					<div class="org-loading">Loading...</div>
				{:else}
					<div class="org-display">
						<div class="org-name-label">Current Organization</div>
						<div class="org-name">{orgName}</div>
					</div>

					<div class="invite-section">
						<label for="invite-code" class="invite-label">Have an invite code?</label>
						<input
							id="invite-code"
							type="text"
							class="invite-input"
							placeholder="Enter invite code"
							bind:value={inviteCode}
						/>
						<p class="coming-soon">Team invites coming soon</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Step 3: First Job Site -->
		{#if currentStep === 3}
			<div class="step-card">
				<div class="step-icon">
					<MapPin size={32} />
				</div>
				<h2>Create Your First Job Site</h2>
				<p class="subtitle">Optional — you can add sites later</p>

				<div class="job-site-form">
					<div class="form-field">
						<label for="site-name">Site Name</label>
						<input
							id="site-name"
							type="text"
							class="text-input"
							placeholder="e.g., Main St Overlay"
							bind:value={siteName}
						/>
					</div>

					<div class="form-field">
						<label for="site-location">Location (optional)</label>
						<JobSiteLocationPicker
							bind:latitude={siteLatitude}
							bind:longitude={siteLongitude}
							mapHeight="200px"
						/>
					</div>

					<div class="form-field">
						<label for="road-length">Road Length (ft, optional)</label>
						<input
							id="road-length"
							type="number"
							class="text-input"
							placeholder="e.g., 5280"
							bind:value={roadLength}
							min="1"
						/>
					</div>

					{#if jobSiteCreated}
						<div class="success-banner">
							<Check size={16} />
							Job site created!
						</div>
					{:else}
						<button
							type="button"
							class="btn btn-primary"
							onclick={createJobSite}
							disabled={!siteName.trim() || creatingJobSite}
						>
							{creatingJobSite ? 'Creating...' : 'Create Site'}
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Step 4: Configure Defaults -->
		{#if currentStep === 4}
			<div class="step-card">
				<div class="step-icon">
					<Settings size={32} />
				</div>
				<h2>Configure Defaults</h2>
				<p class="subtitle">Set common values for faster calculations</p>

				<div class="defaults-form">
					<div class="form-field">
						<label for="mix-type">Mix Type</label>
						<select id="mix-type" class="select-input" bind:value={mixType}>
							<option value="SP-9.5">SP-9.5</option>
							<option value="SP-12.5">SP-12.5</option>
							<option value="SP-19.0">SP-19.0</option>
							<option value="Other">Other</option>
						</select>
					</div>

					<div class="form-field">
						<label for="lift-thickness">Lift Thickness (inches)</label>
						<input
							id="lift-thickness"
							type="number"
							class="text-input"
							bind:value={liftThickness}
							min="1"
							max="6"
							step="0.5"
						/>
					</div>

					<div class="form-field">
						<label for="road-width">Road Width (feet)</label>
						<input
							id="road-width"
							type="number"
							class="text-input"
							bind:value={roadWidth}
							min="8"
							max="50"
							step="1"
						/>
					</div>

					<button type="button" class="btn btn-primary" onclick={saveDefaults}>
						Save Defaults
					</button>
				</div>
			</div>
		{/if}

		<!-- Step 5: Ready -->
		{#if currentStep === 5}
			<div class="step-card ready-card">
				<div class="ready-icon">
					<Check size={64} strokeWidth={3} />
				</div>
				<h2>You're Ready!</h2>
				<p class="ready-message">
					Start calculating tonnage, tracking job sites, and managing your asphalt projects.
				</p>

				{#if selectedRole}
					<div class="ready-role">
						<span class="ready-role-label">Your Role:</span>
						<span class="ready-role-value">
							{roles.find((r) => r.id === selectedRole)?.label || selectedRole}
						</span>
					</div>
				{/if}

				<div class="ready-actions">
					<button type="button" class="btn btn-primary btn-large" onclick={completeOnboarding}>
						Go to Dashboard
					</button>
					<a href="/dashboard/job-sites" class="ready-link">View Job Sites</a>
					<a href="/dashboard" class="ready-link">Open Calculator</a>
				</div>
			</div>
		{/if}

		<!-- Navigation -->
		<div class="onboarding-nav">
			{#if currentStep > 1}
				<button type="button" class="nav-btn nav-back" onclick={prevStep}>
					<ChevronLeft size={20} />
					Back
				</button>
			{:else}
				<div></div>
			{/if}

			{#if currentStep < totalSteps}
				{#if currentStep === 3 && !jobSiteCreated}
					<button type="button" class="nav-btn nav-skip" onclick={skipJobSite}>
						Skip
						<ChevronRight size={20} />
					</button>
				{:else if currentStep === 4}
					<button type="button" class="nav-btn nav-skip" onclick={skipDefaults}>
						Skip
						<ChevronRight size={20} />
					</button>
				{:else}
					<button
						type="button"
						class="nav-btn nav-next"
						onclick={nextStep}
						disabled={!canProceed}
					>
						Next
						<ChevronRight size={20} />
					</button>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.onboarding-wrapper {
		min-height: 100vh;
		background: var(--bg);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-4);
	}

	.onboarding-container {
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
	}

	.onboarding-header {
		text-align: center;
		margin-bottom: var(--sp-6);
	}

	.logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius-lg);
		margin-bottom: var(--sp-3);
	}

	.onboarding-header h1 {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-bold);
		margin: 0 0 var(--sp-2);
		color: var(--text);
	}

	.step-indicator {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin: 0;
	}

	.progress-dots {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-6);
	}

	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--border);
		transition: all 0.2s ease;
	}

	.dot.active {
		background: var(--accent);
	}

	.dot.current {
		transform: scale(1.3);
	}

	.step-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--sp-6);
		margin-bottom: var(--sp-6);
		min-height: 400px;
	}

	.step-card h2 {
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		margin: 0 0 var(--sp-2);
		color: var(--text);
		text-align: center;
	}

	.subtitle {
		font-size: var(--fs-md);
		color: var(--text-muted);
		text-align: center;
		margin: 0 0 var(--sp-6);
	}

	.step-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent);
		margin-bottom: var(--sp-4);
	}

	/* Role Selection */
	.role-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	.role-card {
		position: relative;
		min-height: 120px;
		padding: var(--sp-4);
		background: var(--bg);
		border: 2px solid var(--border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.role-card:hover {
		border-color: var(--accent);
		background: var(--surface-hover);
	}

	.role-card.selected {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}

	.role-label {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}

	.role-desc {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.3;
	}

	.role-check {
		position: absolute;
		top: var(--sp-2);
		right: var(--sp-2);
		color: var(--accent);
	}

	/* Org Setup */
	.org-loading {
		text-align: center;
		padding: var(--sp-6);
		color: var(--text-muted);
	}

	.org-display {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		margin-bottom: var(--sp-5);
	}

	.org-name-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--sp-2);
	}

	.org-name {
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.invite-section {
		margin-top: var(--sp-5);
	}

	.invite-label {
		display: block;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
	}

	.invite-input {
		width: 100%;
		min-height: 48px;
		padding: 0 var(--sp-3);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
		font-family: inherit;
	}

	.invite-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.coming-soon {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin: var(--sp-2) 0 0;
	}

	/* Job Site Form */
	.job-site-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.form-field label {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-weight: var(--fw-medium);
	}

	.text-input,
	.select-input {
		width: 100%;
		min-height: 48px;
		padding: 0 var(--sp-3);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
		font-family: inherit;
	}

	.text-input:focus,
	.select-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.select-input {
		cursor: pointer;
	}

	.success-banner {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-3);
		background: color-mix(in srgb, var(--good) 15%, transparent);
		color: var(--good);
		border-radius: var(--radius-md);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
	}

	/* Defaults Form */
	.defaults-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	/* Ready Screen */
	.ready-card {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.ready-icon {
		width: 96px;
		height: 96px;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: var(--sp-4);
	}

	.ready-message {
		font-size: var(--fs-md);
		color: var(--text-muted);
		line-height: 1.5;
		max-width: 360px;
		margin-bottom: var(--sp-5);
	}

	.ready-role {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3) var(--sp-4);
		margin-bottom: var(--sp-5);
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}

	.ready-role-label {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.ready-role-value {
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.ready-actions {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		width: 100%;
		max-width: 320px;
	}

	.ready-link {
		display: block;
		padding: var(--sp-3);
		color: var(--accent);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		text-decoration: none;
		border-radius: var(--radius-md);
		transition: background 0.15s ease;
	}

	.ready-link:hover {
		background: var(--surface-hover);
	}

	/* Navigation */
	.onboarding-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}

	.nav-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 48px;
		padding: 0 var(--sp-5);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.nav-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--accent);
	}

	.nav-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.nav-next,
	.nav-skip {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.nav-next:hover:not(:disabled),
	.nav-skip:hover {
		filter: brightness(1.1);
	}

	.btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		min-height: 48px;
		padding: 0 var(--sp-5);
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.btn-primary:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-large {
		min-height: 56px;
		font-size: var(--fs-lg);
	}

	/* Mobile optimization */
	@media (max-width: 480px) {
		.role-grid {
			grid-template-columns: 1fr;
		}

		.role-card {
			min-height: 100px;
		}
	}
</style>
