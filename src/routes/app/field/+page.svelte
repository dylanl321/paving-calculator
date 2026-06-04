<script lang="ts">
	import { config } from '$lib/config';
</script>

<svelte:head>
	<title>Field View — {config.app.name}</title>
</svelte:head>

<div class="field-view">
	<header class="field-header">
		<h1>Field View</h1>
		<a href="/app" class="full-calc-link">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="10"/>
				<path d="M8 12h8M12 8v8"/>
			</svg>
			Full Calculator
		</a>
	</header>

	<main class="field-content">
		<div class="message-card">
			<svg class="icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
				<path d="M3 9h18M9 21V9"/>
			</svg>
			<h2>Simplified Field View</h2>
			<p>A streamlined interface for field crew is coming soon. For now, you can use the full calculator.</p>
		</div>
	</main>
</div>

<style>
	.field-view {
		min-height: 100vh;
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
		display: flex;
		flex-direction: column;
	}

	.field-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.field-header h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text);
	}

	.full-calc-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		min-height: var(--touch);
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		transition: transform 0.15s, box-shadow 0.15s;
		box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--accent) 50%, transparent);
	}

	.full-calc-link:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px -2px color-mix(in srgb, var(--accent) 60%, transparent);
	}

	.full-calc-link:active {
		transform: translateY(0);
	}

	.field-content {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
	}

	.message-card {
		max-width: 480px;
		width: 100%;
		padding: 40px 32px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		text-align: center;
		box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.1);
	}

	.icon {
		margin: 0 auto 20px;
		color: var(--accent);
	}

	.message-card h2 {
		margin: 0 0 12px;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
	}

	.message-card p {
		margin: 0;
		color: var(--text-muted);
		font-size: 1rem;
		line-height: 1.5;
	}

	@media (max-width: 480px) {
		.message-card {
			padding: 32px 24px;
		}

		.message-card h2 {
			font-size: 1.3rem;
		}

		.field-header h1 {
			font-size: 1.1rem;
		}

		.full-calc-link {
			font-size: 0.85rem;
			padding: 8px 12px;
		}
	}
</style>
