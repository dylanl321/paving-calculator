<script lang="ts">
	import { onMount } from 'svelte';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';
	import GeofenceMonitor from '$lib/components/GeofenceMonitor.svelte';
	import type { PageData } from './$types';
	import type { EnrichedProject } from '$lib/loaders/project-summaries';
	import ViewSwitcher from '$lib/components/ViewSwitcher.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { UxRole } from '$lib/uxRole';
	import type { Portfolio } from './_home/types';
	import OwnerHome from './_home/OwnerHome.svelte';
	import AdminOfficeHome from './_home/AdminOfficeHome.svelte';
	import ForemanHome from './_home/ForemanHome.svelte';

	let { data }: { data: PageData } = $props();

	interface DashboardOrg {
		name: string;
		role: string;
	}
	interface DashboardUser {
		isGlobalAdmin?: boolean;
		email_verified?: boolean;
	}
	const org = $derived(data.org as DashboardOrg);
	const user = $derived(data.user as DashboardUser);
	const projects = $derived(data.projects as EnrichedProject[]);
	const portfolio = $derived(data.portfolio as Portfolio);
	const uxRole = $derived(data.uxRole as UxRole);

	const roleTitle = $derived(
		uxRole === 'owner'
			? 'Portfolio'
			: uxRole === 'admin_office'
				? 'Setup & ops'
				: uxRole === 'foreman'
					? "Today's work"
					: 'Field'
	);

	// ── Email-verify strip (demoted from a full banner) ────────────────────
	// svelte-ignore state_referenced_locally
	let emailVerified = $state((data.user as DashboardUser)?.email_verified ?? true);
	let verifyDismissed = $state(false);
	let resendingVerification = $state(false);

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
		const url = new URL(window.location.href);
		url.searchParams.delete('verified');
		url.searchParams.delete('verify_error');
		history.replaceState(history.state, '', url.pathname + url.search);
	}

	async function resendVerification() {
		resendingVerification = true;
		try {
			await api.post<{ error?: string; alreadyVerified?: boolean }>('/api/auth/resend-verification');
			toastStore.success('Verification email sent. Check your inbox.');
		} catch (err) {
			if (err && typeof err === 'object' && 'body' in err) {
				const body = (err as { body?: { alreadyVerified?: boolean } }).body;
				if (body?.alreadyVerified) {
					emailVerified = true;
					toastStore.info('Your email is already verified.');
				}
			}
		} finally {
			resendingVerification = false;
		}
	}
</script>

<svelte:head>
	<title>Home — {config.app.name}</title>
</svelte:head>

<GeofenceMonitor sites={projects} />

<div class="home">
	{#if !emailVerified && !verifyDismissed}
		<!-- Thin, dismissible verify strip (was a full banner). Resend logic kept. -->
		<div class="verify-strip" role="status">
			<span class="verify-strip__text">Verify your email to secure your account.</span>
			<button class="verify-strip__action" onclick={resendVerification} disabled={resendingVerification}>
				{resendingVerification ? 'Sending…' : 'Resend'}
			</button>
			<button class="verify-strip__close" onclick={() => (verifyDismissed = true)} aria-label="Dismiss">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		</div>
	{/if}

	<PageHeader title="Welcome back" subtitle={org?.name} eyebrow={roleTitle}>
		{#snippet actions()}
			<Button variant="ghost" href="/dashboard/projects">View projects</Button>
		{/snippet}
	</PageHeader>

	{#if uxRole === 'owner'}
		<OwnerHome {portfolio} {projects} />
	{:else if uxRole === 'admin_office'}
		<AdminOfficeHome {portfolio} {projects} />
	{:else if uxRole === 'foreman'}
		<ForemanHome {portfolio} {projects} />
	{:else}
		<!-- field_crew should be redirected by the layout guard; minimal fallback. -->
		<div class="field-fallback">
			<h2>Field view</h2>
			<p>Your work lives in the field app — quick logging and assigned tasks.</p>
			<Button href="/app/field">Go to field</Button>
		</div>
	{/if}

	{#if user?.isGlobalAdmin}
		<div class="admin-link-row">
			<Button variant="ghost" href="/admin">Admin console</Button>
		</div>
	{/if}

	<ViewSwitcher currentView="full" />
</div>

<style>
	.home {
		width: 100%;
	}

	/* ── Verify strip (thin, dismissible) ────────────────────────── */
	.verify-strip {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-4);
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		font-size: var(--fs-sm);
	}
	.verify-strip__text {
		flex: 1;
		min-width: 0;
		color: var(--text);
	}
	.verify-strip__action {
		min-height: 36px;
		padding: 0 var(--sp-3);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-text);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-sm);
		cursor: pointer;
		white-space: nowrap;
	}
	.verify-strip__action:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.verify-strip__close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}
	.verify-strip__close:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.field-fallback {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-8) var(--sp-4);
	}
	.field-fallback h2 {
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
	}
	.field-fallback p {
		margin: 0;
		color: var(--text-muted);
		max-width: 420px;
	}

	.admin-link-row {
		margin-top: var(--sp-6);
	}
</style>
