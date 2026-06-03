<script lang="ts">
	import type { CalcValueSource } from '../stores/calcContext.svelte';

	interface Props {
		source: CalcValueSource;
		updatedAt: number;
		label: string;
	}

	let { source, updatedAt, label }: Props = $props();

	const SOURCE_LABELS: Record<CalcValueSource, string> = {
		weather_api: 'Weather API',
		gps: 'GPS',
		config: 'Job Setup',
		job_site: 'Job Setup',
		manual: 'Manual',
		derived: 'Auto'
	};

	const SOURCE_COLORS: Record<CalcValueSource, string> = {
		weather_api: '#60a5fa',
		gps: '#34d399',
		config: '#a78bfa',
		job_site: '#a78bfa',
		manual: '#f59e0b',
		derived: '#94a3b8'
	};

	function relativeTime(ts: number): string {
		const diff = Math.floor((Date.now() - ts) / 1000);
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
		return `${Math.floor(diff / 86400)} d ago`;
	}

	const color = $derived(SOURCE_COLORS[source]);
	const displayLabel = $derived(SOURCE_LABELS[source]);
	const titleText = $derived(`${label} from ${displayLabel} — Updated ${relativeTime(updatedAt)}`);
</script>

<span class="source-tag" style="background: {color}26; color: {color};" title={titleText}>
	<span class="tag-icon">
		{#if source === 'weather_api'}
			<!-- Thermometer -->
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M8 2v7.27"/>
				<circle cx="8" cy="12" r="2" fill="currentColor"/>
				<path d="M8 2a1.5 1.5 0 0 1 1.5 1.5v5.77a3.5 3.5 0 1 1-3 0V3.5A1.5 1.5 0 0 1 8 2z" stroke-width="1.2"/>
			</svg>
		{:else if source === 'gps'}
			<!-- Location pin -->
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M8 14s-5-4.686-5-8a5 5 0 0 1 10 0c0 3.314-5 8-5 8z"/>
				<circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none"/>
			</svg>
		{:else if source === 'config' || source === 'job_site'}
			<!-- Gear/cog -->
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="8" cy="8" r="2.5"/>
				<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
			</svg>
		{:else if source === 'manual'}
			<!-- Pencil -->
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5z"/>
			</svg>
		{:else}
			<!-- Chain link (derived) -->
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M6 10a3 3 0 0 0 4.243 0l1.414-1.414a3 3 0 0 0-4.243-4.243L6 5.757"/>
				<path d="M10 6a3 3 0 0 0-4.243 0L4.343 7.414a3 3 0 0 0 4.243 4.243L10 10.243"/>
			</svg>
		{/if}
	</span>
	<span class="tag-text">{displayLabel}</span>
</span>

<style>
	.source-tag {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 5px;
		border-radius: 4px;
		font-size: 11px;
		line-height: 1;
		white-space: nowrap;
		vertical-align: middle;
		cursor: help;
	}

	.tag-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.tag-text {
		flex-shrink: 0;
	}
</style>
