<script lang="ts">
	type IconType = 'projects' | 'team' | 'activity' | 'equipment' | 'schedule' | 'log' | 'search' | 'location' | 'workzones';

	type Props = {
		icon: IconType;
		heading: string;
		body: string;
		primaryCta?: { label: string; href?: string; onclick?: () => void };
		secondaryCta?: { label: string; href?: string; onclick?: () => void };
		size?: 'sm' | 'md';
	};

	let { icon, heading, body, primaryCta, secondaryCta, size = 'md' }: Props = $props();

	const iconSize = size === 'sm' ? 56 : 80;
	const circleSize = size === 'sm' ? 64 : 88;
</script>

<div class="empty-state" class:size-sm={size === 'sm'}>
	<div class="icon-container">
		<div class="icon-circle">
			{#if icon === 'projects'}
				<svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" opacity="0.4"></path>
					<polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
					<line x1="12" y1="22.08" x2="12" y2="12"></line>
					<circle cx="12" cy="12" r="2" fill="var(--accent)"></circle>
				</svg>
			{:else if icon === 'team'}
				<svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" opacity="0.4"></path>
					<circle cx="9" cy="7" r="4"></circle>
					<path d="M23 21v-2a4 4 0 0 0-3-3.87" opacity="0.4"></path>
					<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
				</svg>
			{:else if icon === 'activity'}
				<svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" opacity="0.4"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
					<line x1="9" y1="15" x2="15" y2="15"></line>
					<line x1="12" y1="18" x2="12" y2="12"></line>
					<circle cx="12" cy="15" r="1.5" fill="var(--accent)"></circle>
				</svg>
			{:else if icon === 'equipment'}
				<svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="12" cy="12" r="10" opacity="0.4"></circle>
					<circle cx="12" cy="12" r="3"></circle>
					<line x1="12" y1="2" x2="12" y2="6"></line>
					<line x1="12" y1="18" x2="12" y2="22"></line>
					<line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
					<line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
					<line x1="2" y1="12" x2="6" y2="12"></line>
					<line x1="18" y1="12" x2="22" y2="12"></line>
					<line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
					<line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
				</svg>
			{:else if icon === 'schedule'}
				<svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" opacity="0.4"></rect>
					<line x1="16" y1="2" x2="16" y2="6"></line>
					<line x1="8" y1="2" x2="8" y2="6"></line>
					<line x1="3" y1="10" x2="21" y2="10"></line>
					<path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"></path>
				</svg>
			{:else if icon === 'log'}
				<svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" opacity="0.4"></path>
					<polyline points="13 2 13 9 20 9"></polyline>
					<line x1="9" y1="13" x2="15" y2="13"></line>
					<line x1="9" y1="17" x2="15" y2="17"></line>
				</svg>
			{:else if icon === 'search'}
				<svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="11" cy="11" r="8" opacity="0.4"></circle>
					<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
					<line x1="11" y1="8" x2="11" y2="14"></line>
					<line x1="8" y1="11" x2="14" y2="11"></line>
				</svg>
			{:else if icon === 'location'}
				<svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" opacity="0.4"></path>
					<circle cx="12" cy="10" r="3"></circle>
				</svg>
			{:else if icon === 'workzones'}
				<svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<polygon points="12 2 2 7 12 12 22 7 12 2" opacity="0.4"></polygon>
					<polyline points="2 17 12 22 22 17"></polyline>
					<polyline points="2 12 12 17 22 12"></polyline>
				</svg>
			{/if}
		</div>
	</div>

	<h4>{heading}</h4>
	<p>{body}</p>

	{#if primaryCta || secondaryCta}
		<div class="cta-buttons">
			{#if primaryCta}
				{#if primaryCta.href}
					<a href={primaryCta.href} class="btn-primary">{primaryCta.label}</a>
				{:else if primaryCta.onclick}
					<button type="button" class="btn-primary" onclick={primaryCta.onclick}>{primaryCta.label}</button>
				{/if}
			{/if}
			{#if secondaryCta}
				{#if secondaryCta.href}
					<a href={secondaryCta.href} class="btn-secondary">{secondaryCta.label}</a>
				{:else if secondaryCta.onclick}
					<button type="button" class="btn-secondary" onclick={secondaryCta.onclick}>{secondaryCta.label}</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.empty-state {
		text-align: center;
		padding: 48px 24px;
	}

	.empty-state.size-sm {
		padding: 32px 16px;
	}

	.icon-container {
		display: flex;
		justify-content: center;
		margin-bottom: 24px;
	}

	.size-sm .icon-container {
		margin-bottom: 16px;
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
	}

	.size-sm .icon-circle {
		width: 72px;
		height: 72px;
	}

	.icon-circle svg {
		color: var(--accent);
	}

	h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		color: var(--text);
		font-weight: 500;
	}

	.size-sm h4 {
		font-size: 1rem;
	}

	p {
		margin: 0 0 24px;
		font-size: 0.9rem;
		color: var(--text-muted);
		max-width: 400px;
		margin-left: auto;
		margin-right: auto;
		line-height: 1.5;
	}

	.size-sm p {
		font-size: 0.85rem;
		margin-bottom: 20px;
	}

	.cta-buttons {
		display: flex;
		gap: 12px;
		justify-content: center;
		flex-wrap: wrap;
	}

	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 12px 24px;
		min-height: 44px;
		border-radius: 6px;
		font-size: 0.95rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		border: none;
		transition: all 0.2s;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--text);
	}

	.btn-primary:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	.btn-secondary {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}

	.btn-secondary:hover {
		background: var(--surface-hover);
	}
</style>
