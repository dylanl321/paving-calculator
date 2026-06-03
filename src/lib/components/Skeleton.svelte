<script lang="ts">
	let {
		width = '100%',
		height = '1em',
		borderRadius = 'var(--radius)',
		class: class_ = ''
	}: {
		width?: string;
		height?: string;
		borderRadius?: string;
		class?: string;
	} = $props();
</script>

<div
	class="skeleton {class_}"
	style="width: {width}; height: {height}; border-radius: {borderRadius};"
></div>

<style>
	@media (prefers-reduced-motion: no-preference) {
		@keyframes shimmer {
			0% {
				background-position: -200% 0;
			}
			100% {
				background-position: 200% 0;
			}
		}

		.skeleton {
			background: linear-gradient(
				90deg,
				var(--surface-alt) 0%,
				color-mix(in srgb, var(--surface-alt) 90%, var(--text-muted)) 50%,
				var(--surface-alt) 100%
			);
			background-size: 200% 100%;
			animation: shimmer 2s linear infinite;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			background: var(--surface-alt);
		}
	}
</style>
