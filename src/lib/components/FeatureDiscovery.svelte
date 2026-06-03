<script lang="ts">
	import { onMount } from 'svelte';
	import { Lightbulb, X } from 'lucide-svelte';

	type FeatureId = 'photo' | 'route' | 'notifications' | 'closeout';

	interface Props {
		feature: FeatureId;
		condition: boolean;
	}

	let { feature, condition }: Props = $props();

	let dismissed = $state<FeatureId[]>([]);
	let firstActiveDay = $state<string | null>(null);
	let shouldShow = $state(false);
	let isVisible = $state(true);

	const messages: Record<FeatureId, string> = {
		photo: 'Snap a photo of each truck ticket for automatic OCR capture.',
		route: 'Draw your route to see paving progress on the map.',
		notifications: 'Set up email notifications to get daily summaries automatically.',
		closeout: 'Close out your day to lock the record and generate a PDF.'
	};

	onMount(() => {
		if (typeof window === 'undefined') return;

		try {
			const dismissedStr = localStorage.getItem('paverate_discovery_dismissed');
			dismissed = dismissedStr ? JSON.parse(dismissedStr) : [];
		} catch {
			dismissed = [];
		}

		try {
			firstActiveDay = localStorage.getItem('paverate_first_active_day');
			if (!firstActiveDay) {
				firstActiveDay = new Date().toISOString().split('T')[0];
				localStorage.setItem('paverate_first_active_day', firstActiveDay);
			}
		} catch {
			firstActiveDay = new Date().toISOString().split('T')[0];
		}

		const daysSinceFirstActive = firstActiveDay
			? Math.floor(
					(new Date().getTime() - new Date(firstActiveDay).getTime()) / (1000 * 60 * 60 * 24)
				)
			: 0;

		let conditionMet = condition;

		if (feature === 'closeout') {
			try {
				const lastCloseoutStr = localStorage.getItem('paverate_last_closeout_date');
				if (!lastCloseoutStr) {
					conditionMet = daysSinceFirstActive >= 5;
				} else {
					const lastCloseout = new Date(lastCloseoutStr);
					const daysSinceCloseout = Math.floor(
						(new Date().getTime() - lastCloseout.getTime()) / (1000 * 60 * 60 * 24)
					);
					conditionMet = daysSinceCloseout > 5;
				}
			} catch {
				conditionMet = daysSinceFirstActive >= 5;
			}
		}

		shouldShow =
			conditionMet && !dismissed.includes(feature) && daysSinceFirstActive >= 3;
	});

	function dismiss() {
		isVisible = false;
		setTimeout(() => {
			if (typeof window === 'undefined') return;
			try {
				const updatedDismissed = [...dismissed, feature];
				localStorage.setItem('paverate_discovery_dismissed', JSON.stringify(updatedDismissed));
			} catch {}
		}, 300);
	}
</script>

{#if shouldShow && isVisible}
	<div class="feature-discovery" class:fade-out={!isVisible}>
		<Lightbulb size={20} class="icon" />
		<div class="message">
			<span class="tip-prefix">Tip:</span> {messages[feature]}
		</div>
		<button class="dismiss-btn" onclick={dismiss} aria-label="Dismiss tip">
			<X size={20} />
		</button>
	</div>
{/if}

<style>
	.feature-discovery {
		display: flex;
		align-items: center;
		gap: 12px;
		background: #1c1a14;
		border: 2px solid #d97706;
		border-radius: var(--radius, 8px);
		padding: 14px 16px;
		margin-bottom: 16px;
		animation: fadeIn 0.3s ease-out;
		transition: opacity 0.3s ease-out;
	}

	.fade-out {
		opacity: 0;
		pointer-events: none;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.feature-discovery :global(.icon) {
		flex-shrink: 0;
		color: #d97706;
	}

	.message {
		flex: 1;
		font-size: 0.9rem;
		line-height: 1.4;
		color: var(--text, #fff);
		min-width: 0;
	}

	.tip-prefix {
		color: #d97706;
		font-weight: 600;
	}

	.dismiss-btn {
		flex-shrink: 0;
		min-width: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--text-muted, #888);
		cursor: pointer;
		border-radius: var(--radius, 8px);
		transition: all 0.2s;
		padding: 0;
	}

	.dismiss-btn:hover {
		color: #d97706;
		background: rgba(217, 119, 6, 0.1);
	}
</style>
