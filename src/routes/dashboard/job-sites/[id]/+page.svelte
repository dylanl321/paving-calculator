<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatCalcType(type: string): string {
		const labels: Record<string, string> = {
			spread_rate: 'Spread Rate',
			feet_left: 'Feet Left',
			tonnage: 'Tonnage',
			tack_rate: 'Tack Rate',
			stick_check: 'Stick Check'
		};
		return labels[type] || type;
	}

	function getResultSummary(calc: any): string {
		switch (calc.calc_type) {
			case 'spread_rate':
				return `${calc.result.lbsPerSqYd?.toFixed(1) || '—'} lbs/yd²`;
			case 'feet_left':
				return `${calc.result.feetRemaining?.toFixed(0) || '—'} ft remaining`;
			case 'tonnage':
				return `${calc.result.tonsRequired?.toFixed(1) || '—'} tons`;
			case 'tack_rate':
				return `${calc.result.gallonsPerSqYd?.toFixed(3) || '—'} gal/yd²`;
			case 'stick_check':
				return `${calc.result.stickReading?.toFixed(2) || '—'} in`;
			default:
				return '—';
		}
	}

	function handleNewCalculation() {
		goto(`/?job_site_id=${data.jobSite.id}`);
	}
</script>

<svelte:head>
	<title>{data.jobSite.name} — {config.app.name}</title>
</svelte:head>

<div class="dashboard">
	<header class="topbar">
		<a href="/dashboard" class="logo-link">
			<img src="/icons/icon-192.png" alt="Paverate" />
			<div class="topbar-content">
				<h1>{config.app.name}</h1>
			</div>
		</a>
		<div class="topbar-actions">
			<ThemeToggle />
			<UserMenu />
		</div>
	</header>

	<div class="breadcrumb">
		<a href="/dashboard">Dashboard</a>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
		<span>Job Site</span>
	</div>

	<div class="page-header">
		<div>
			<h2 class="page-title">{data.jobSite.name}</h2>
			{#if data.jobSite.location_description}
				<p class="page-subtitle">{data.jobSite.location_description}</p>
			{/if}
		</div>
		<span class="status-badge status-{data.jobSite.status.toLowerCase()}">{data.jobSite.status}</span>
	</div>

	<section class="section">
		<div class="section-header">
			<h3>Saved Calculations</h3>
			<button class="btn-primary" onclick={handleNewCalculation}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="5" x2="12" y2="19"></line>
					<line x1="5" y1="12" x2="19" y2="12"></line>
				</svg>
				New Calculation
			</button>
		</div>

		{#if data.calculations.length === 0}
			<div class="empty-state">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
				</svg>
				<h4>No calculations yet</h4>
				<p>Use the calculator to create and save calculations for this job site</p>
				<button class="btn-primary" style="margin-top: 16px;" onclick={handleNewCalculation}>
					Go to Calculator
				</button>
			</div>
		{:else}
			<div class="calc-list">
				{#each data.calculations as calc}
					<div class="calc-card">
						<div class="calc-header">
							<div class="calc-type-icon">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
								</svg>
							</div>
							<div class="calc-info">
								<h4 class="calc-type">{formatCalcType(calc.calc_type)}</h4>
								<p class="calc-date">{formatDate(calc.created_at)}</p>
							</div>
							<div class="calc-result">
								{getResultSummary(calc)}
							</div>
						</div>
						{#if calc.notes}
							<div class="calc-notes">{calc.notes}</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.dashboard {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 12px 16px 32px;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 4px 14px;
	}

	.logo-link {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.topbar img {
		width: 40px;
		height: 40px;
		border-radius: 10px;
	}

	.topbar-content h1 {
		font-size: 1.35rem;
		letter-spacing: 0.5px;
		margin: 0;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 8px;
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

	.breadcrumb svg {
		width: 14px;
		height: 14px;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 24px;
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

	.status-badge {
		padding: 6px 12px;
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

	.btn-primary:hover {
		opacity: 0.9;
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

	.calc-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.calc-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
	}

	.calc-header {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.calc-type-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-alt);
		border-radius: 10px;
		color: var(--accent);
	}

	.calc-info {
		flex: 1;
		min-width: 0;
	}

	.calc-type {
		margin: 0 0 2px;
		font-size: 1rem;
	}

	.calc-date {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.calc-result {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--accent);
		text-align: right;
	}

	.calc-notes {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}
</style>
