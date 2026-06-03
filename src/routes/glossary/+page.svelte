<script lang="ts">
	import { Search } from 'lucide-svelte';

	let searchQuery = $state('');

	interface GlossaryTerm {
		term: string;
		type: 'unit' | 'material' | 'equipment' | 'process' | 'reference' | 'measurement';
		definition: string;
	}

	const terms: GlossaryTerm[] = [
		{
			term: 'Base Course',
			type: 'material',
			definition:
				'Bottom structural asphalt layer (thickest). Provides the primary load-bearing capacity for the pavement structure.'
		},
		{
			term: 'Compaction',
			type: 'process',
			definition:
				'Roller passes to reach target density; measured by stick check. Typically requires 95-100% of max dry density per GDOT specs.'
		},
		{
			term: 'GDOT Table 4',
			type: 'reference',
			definition:
				'Minimum air temperature table for asphalt placement. Specifies required temperatures based on lift thickness (e.g., 1 inch or less requires 55°F minimum).'
		},
		{
			term: 'GDOT Table 12',
			type: 'reference',
			definition:
				'Spread rate tolerance table. Base: ±55 lbs/SY, Intermediate/Wearing: ±27.5 lbs/SY, OGFC: ±7 lbs/SY, PEM: ±10 lbs/SY from designated rate.'
		},
		{
			term: 'Intermediate Course',
			type: 'material',
			definition:
				'Middle layer between base and wearing course. Provides additional structural support and smoothness.'
		},
		{
			term: 'lbs/SY',
			type: 'unit',
			definition:
				'Pounds per Square Yard. Standard unit for spread rate (how much asphalt per area). Controls thickness and density of the asphalt mat.'
		},
		{
			term: 'Lift',
			type: 'measurement',
			definition:
				'Single layer of asphalt placed in one pass. Multiple lifts may be used to achieve total pavement thickness.'
		},
		{
			term: 'MTV',
			type: 'equipment',
			definition:
				'Material Transfer Vehicle. 24-ton machine that sits between the dump truck and paver, providing continuous material flow and remix action.'
		},
		{
			term: 'OGFC',
			type: 'material',
			definition:
				'Open-Graded Friction Course. Porous asphalt surface mix that allows water to drain through, improving wet-weather traction.'
		},
		{
			term: 'PEM',
			type: 'material',
			definition:
				'Polymer-Enhanced Membrane (also called Polymer-Enhanced Mixture). Asphalt surface treatment that provides enhanced durability and resistance to cracking.'
		},
		{
			term: 'Screed',
			type: 'equipment',
			definition:
				'Heated plate on back of paver that levels and smooths the asphalt. Controls the final mat thickness and surface texture.'
		},
		{
			term: 'Spread Rate',
			type: 'measurement',
			definition:
				'How much asphalt per square yard (lbs/SY). Controls thickness and density. Calculated as thickness (inches) × 110 lbs/SY per inch.'
		},
		{
			term: 'Station',
			type: 'unit',
			definition: '100 linear feet of road. Standard civil engineering unit for measuring roadway distances.'
		},
		{
			term: 'Stick Check',
			type: 'process',
			definition:
				'Manual thickness measurement of asphalt mat behind the screed. Measures loose material height to verify proper compacted thickness (loose height = compacted × 1.25).'
		},
		{
			term: 'SY',
			type: 'unit',
			definition:
				'Square Yard. Equal to 9 square feet. Standard unit for paving quantities and area calculations.'
		},
		{
			term: 'Tack Coat',
			type: 'material',
			definition:
				'Asphalt emulsion sprayed on existing pavement to bond new layer. Application rate varies by surface condition (typically 0.04-0.12 gal/SY).'
		},
		{
			term: 'Tack Rate',
			type: 'measurement',
			definition:
				'Volume of emulsion applied per square yard before paving. Must be within GDOT Table 2 range for the surface type being bonded.'
		},
		{
			term: 'Truck Load',
			type: 'measurement',
			definition:
				'Nominal tons per dump truck, typically 18-20 tons. Actual capacity varies by truck and local regulations.'
		},
		{
			term: 'Wearing Course',
			type: 'material',
			definition:
				'Top surface layer that traffic contacts directly. Must meet friction, smoothness, and durability requirements.'
		}
	];

	const sortedTerms = $derived(
		terms.sort((a, b) => a.term.localeCompare(b.term))
	);

	const filteredTerms = $derived(
		sortedTerms.filter((t) => {
			const q = searchQuery.toLowerCase();
			return (
				t.term.toLowerCase().includes(q) ||
				t.definition.toLowerCase().includes(q) ||
				t.type.toLowerCase().includes(q)
			);
		})
	);

	const typeColors: Record<GlossaryTerm['type'], string> = {
		unit: 'var(--accent)',
		material: 'var(--good)',
		equipment: 'var(--warn)',
		process: '#6b9bd1',
		reference: '#b57edc',
		measurement: '#e89c5c'
	};

	function getTypeBadgeColor(type: GlossaryTerm['type']): string {
		return typeColors[type] || 'var(--text-muted)';
	}
</script>

<svelte:head>
	<title>Glossary — Paverate</title>
	<meta name="description" content="Asphalt paving terminology reference for field crews" />
</svelte:head>

<div class="glossary-page">
	<header class="page-header">
		<h1>Paving Glossary</h1>
		<p class="page-subtitle">Quick reference for asphalt paving terminology</p>
	</header>

	<div class="search-box">
		<Search size={20} class="search-icon" />
		<input
			type="text"
			placeholder="Search terms..."
			bind:value={searchQuery}
			class="search-input"
		/>
		{#if searchQuery}
			<button
				class="clear-search"
				onclick={() => (searchQuery = '')}
				aria-label="Clear search"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
		{/if}
	</div>

	{#if filteredTerms.length === 0}
		<div class="no-results">
			<p>No terms found matching "{searchQuery}"</p>
		</div>
	{:else}
		<div class="terms-grid">
			{#each filteredTerms as item (item.term)}
				<article class="term-card">
					<div class="term-header">
						<h2 class="term-name">{item.term}</h2>
						<span
							class="term-badge"
							style="--badge-color: {getTypeBadgeColor(item.type)}"
						>
							{item.type}
						</span>
					</div>
					<p class="term-definition">{item.definition}</p>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	.glossary-page {
		max-width: 900px;
		margin: 0 auto;
		padding: 24px 16px 80px;
	}

	.page-header {
		margin-bottom: 32px;
		text-align: center;
	}

	.page-header h1 {
		font-size: var(--fs-2xl, 2rem);
		font-weight: var(--fw-bold, 700);
		color: var(--text);
		margin-bottom: 8px;
	}

	.page-subtitle {
		font-size: var(--fs-md, 1rem);
		color: var(--text-muted);
	}

	.search-box {
		position: relative;
		margin-bottom: 24px;
	}

	.search-box :global(.search-icon) {
		position: absolute;
		left: 16px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-muted);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		min-height: 48px;
		padding: 12px 48px 12px 48px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 8px);
		color: var(--text);
		font-size: var(--fs-md, 1rem);
		font-family: inherit;
		transition: border-color 0.15s ease;
	}

	.search-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.clear-search {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		min-width: 32px;
		min-height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.clear-search:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.no-results {
		text-align: center;
		padding: 48px 16px;
		color: var(--text-muted);
		font-size: var(--fs-md, 1rem);
	}

	.terms-grid {
		display: grid;
		gap: 16px;
	}

	.term-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 8px);
		padding: 20px;
		transition: all 0.15s ease;
	}

	.term-card:hover {
		background: var(--surface-hover);
		border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
	}

	.term-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}

	.term-name {
		font-size: var(--fs-lg, 1.25rem);
		font-weight: var(--fw-bold, 700);
		color: var(--text);
		margin: 0;
	}

	.term-badge {
		display: inline-block;
		padding: 4px 10px;
		background: color-mix(in srgb, var(--badge-color) 20%, transparent);
		color: var(--badge-color);
		border: 1px solid color-mix(in srgb, var(--badge-color) 40%, transparent);
		border-radius: 12px;
		font-size: var(--fs-2xs, 0.75rem);
		font-weight: var(--fw-semibold, 600);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
	}

	.term-definition {
		font-size: var(--fs-md, 1rem);
		line-height: 1.5;
		color: var(--text-muted);
		margin: 0;
	}

	@media (max-width: 460px) {
		.glossary-page {
			padding: 16px 12px 80px;
		}

		.page-header h1 {
			font-size: var(--fs-xl, 1.5rem);
		}

		.page-subtitle {
			font-size: var(--fs-sm, 0.875rem);
		}

		.term-card {
			padding: 16px;
		}

		.term-name {
			font-size: var(--fs-md, 1rem);
		}

		.term-definition {
			font-size: var(--fs-sm, 0.875rem);
		}
	}
</style>
