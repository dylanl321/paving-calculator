<script lang="ts">
	import Skeleton from './Skeleton.svelte';
</script>

<div class="skeleton-card">
	<div class="skeleton-header">
		<Skeleton width="60%" height="1.2rem" />
		<Skeleton width="60px" height="24px" borderRadius="999px" />
	</div>
	<Skeleton width="80%" height="0.85rem" class="skeleton-subtitle" />
	<div class="skeleton-footer">
		<Skeleton width="120px" height="0.8rem" />
		<Skeleton width="80px" height="0.75rem" />
	</div>
</div>

<style>
	.skeleton-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 18px;
		display: block;
	}

	.skeleton-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 10px;
		margin-bottom: 8px;
	}

	.skeleton-subtitle {
		margin-bottom: 12px;
	}

	.skeleton-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}
</style>
