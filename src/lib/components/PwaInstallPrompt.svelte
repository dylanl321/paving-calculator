<script lang="ts">
	import { onMount } from 'svelte';

	let showPrompt = $state(false);
	let isIos = $state(false);
	let deferredPrompt = $state<any>(null);

	const DISMISSAL_KEY = 'pwa-prompt-dismissed';
	const VISIT_COUNT_KEY = 'pwa-visit-count';
	const DISMISSAL_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

	function isInStandaloneMode(): boolean {
		return (
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as any).standalone === true
		);
	}

	function isDismissed(): boolean {
		const dismissed = localStorage.getItem(DISMISSAL_KEY);
		if (!dismissed) return false;

		const dismissedTime = parseInt(dismissed, 10);
		const now = Date.now();

		// Check if TTL has expired
		if (now - dismissedTime > DISMISSAL_TTL) {
			localStorage.removeItem(DISMISSAL_KEY);
			return false;
		}

		return true;
	}

	function shouldShowOnIos(): boolean {
		const visitCount = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10);
		const newCount = visitCount + 1;
		localStorage.setItem(VISIT_COUNT_KEY, newCount.toString());

		// Show after 2+ visits
		return newCount >= 2;
	}

	function dismiss() {
		localStorage.setItem(DISMISSAL_KEY, Date.now().toString());
		showPrompt = false;
	}

	async function install() {
		if (isIos) {
			// On iOS, we can't programmatically trigger the install,
			// so the prompt already shows instructions
			return;
		}

		if (deferredPrompt) {
			deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;

			if (outcome === 'accepted') {
				showPrompt = false;
			}

			deferredPrompt = null;
		}
	}

	onMount(() => {
		// Don't show if already in standalone mode
		if (isInStandaloneMode()) {
			return;
		}

		// Don't show if dismissed recently
		if (isDismissed()) {
			return;
		}

		// Detect iOS (Safari)
		const ua = window.navigator.userAgent;
		const isIosDevice = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;

		if (isIosDevice) {
			isIos = true;
			if (shouldShowOnIos()) {
				showPrompt = true;
			}
		} else {
			// Chrome/Android: listen for beforeinstallprompt
			const handler = (e: Event) => {
				e.preventDefault();
				deferredPrompt = e;
				showPrompt = true;
			};

			window.addEventListener('beforeinstallprompt', handler);

			return () => {
				window.removeEventListener('beforeinstallprompt', handler);
			};
		}
	});
</script>

{#if showPrompt}
	<div class="pwa-prompt-backdrop" onclick={dismiss} role="presentation"></div>
	<div class="pwa-prompt">
		<div class="pwa-prompt-content">
			<img src="/icons/icon-192.png" alt="Paverate app icon" class="pwa-prompt-icon" />
			<div class="pwa-prompt-text">
				<h2 class="pwa-prompt-title">Paverate</h2>
				<p class="pwa-prompt-tagline">Field-ready paving calculators. Works offline.</p>
				{#if isIos}
					<p class="pwa-prompt-instructions">
						Tap the share button <svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="currentColor"
							style="display: inline-block; vertical-align: middle;"
						>
							<path
								d="M8 0L6.59 1.41 11.17 6H0v2h11.17l-4.58 4.59L8 14l6-6-6-6z"
								transform="rotate(-90 8 8)"
							/>
						</svg> then "Add to Home Screen"
					</p>
				{/if}
			</div>
		</div>
		<div class="pwa-prompt-actions">
			{#if !isIos}
				<button class="btn btn-primary pwa-prompt-install" onclick={install}>
					Add to Home Screen
				</button>
			{/if}
			<button class="btn btn-subtle pwa-prompt-dismiss" onclick={dismiss}>Not now</button>
		</div>
	</div>
{/if}

<style>
	.pwa-prompt-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 9000;
		animation: fadeIn 0.2s var(--ease);
	}

	.pwa-prompt {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--surface);
		border-top: 1px solid var(--border);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		padding: var(--sp-6);
		padding-bottom: calc(var(--sp-6) + env(safe-area-inset-bottom));
		z-index: 9001;
		box-shadow: var(--shadow-lg);
		animation: slideUp 0.3s var(--ease);
	}

	.pwa-prompt-content {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-4);
		margin-bottom: var(--sp-5);
	}

	.pwa-prompt-icon {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-md);
		flex-shrink: 0;
	}

	.pwa-prompt-text {
		flex: 1;
	}

	.pwa-prompt-title {
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}

	.pwa-prompt-tagline {
		margin: var(--sp-1) 0 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.pwa-prompt-instructions {
		margin: var(--sp-3) 0 0;
		font-size: var(--fs-sm);
		color: var(--text);
		line-height: 1.4;
		padding: var(--sp-3);
		background: var(--surface-alt);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
	}

	.pwa-prompt-actions {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.pwa-prompt-install {
		width: 100%;
	}

	.pwa-prompt-dismiss {
		width: 100%;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}
</style>
