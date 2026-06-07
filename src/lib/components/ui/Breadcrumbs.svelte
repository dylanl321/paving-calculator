<!--
	Breadcrumbs — presentational trail. Accepts an array of crumbs; the LAST crumb
	is treated as the current page (rendered as plain text, never a link, with
	aria-current="page"). Earlier crumbs render as links when they carry an href.

	Route-derivation logic (route + navConfig + page-provided crumb) is wired by
	the nav todo later — this component is intentionally dumb.

	Usage:
		<Breadcrumbs crumbs={[
			{ label: 'Projects', href: '/dashboard/projects' },
			{ label: site.name }
		]} />
-->
<script lang="ts">
	export type Crumb = { label: string; href?: string };

	let { crumbs }: { crumbs: Crumb[] } = $props();
</script>

{#if crumbs.length}
	<nav class="breadcrumbs" aria-label="Breadcrumb">
		<ol class="breadcrumbs__list">
			{#each crumbs as crumb, i (i)}
				{@const isLast = i === crumbs.length - 1}
				<li class="breadcrumbs__item">
					{#if crumb.href && !isLast}
						<a class="breadcrumbs__link" href={crumb.href}>{crumb.label}</a>
					{:else}
						<span class="breadcrumbs__current" aria-current={isLast ? 'page' : undefined}>
							{crumb.label}
						</span>
					{/if}
					{#if !isLast}
						<span class="breadcrumbs__sep" aria-hidden="true">/</span>
					{/if}
				</li>
			{/each}
		</ol>
	</nav>
{/if}

<style>
	.breadcrumbs {
		font-size: var(--fs-sm);
	}

	.breadcrumbs__list {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.breadcrumbs__item {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		min-width: 0;
	}

	.breadcrumbs__link {
		display: inline-flex;
		align-items: center;
		/* 48px touch target without inflating the visible line height */
		min-height: var(--touch);
		padding: 0 var(--sp-1);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		transition: color var(--dur) var(--ease);
	}

	.breadcrumbs__link:hover {
		color: var(--accent);
	}

	.breadcrumbs__current {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch);
		padding: 0 var(--sp-1);
		color: var(--text);
		font-weight: var(--fw-semibold);
		overflow-wrap: anywhere;
	}

	.breadcrumbs__sep {
		color: var(--text-muted);
		opacity: 0.6;
		user-select: none;
	}
</style>
