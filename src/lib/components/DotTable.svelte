<script lang="ts">
	import { referenceTables } from '$lib/config';

	interface Props {
		tableId: 'table-2' | 'table-4' | 'table-5' | 'table-12';
		highlightRow?: string;
		compact?: boolean;
	}

	let { tableId, highlightRow, compact = false }: Props = $props();

	let open = $state(false);

	const tableData = $derived(referenceTables[tableId.replace('-', '_') as keyof typeof referenceTables]);

	const tableNumber = $derived(tableId.replace('table-', ''));

	const tableTitle = $derived.by(() => {
		switch (tableId) {
			case 'table-2':
				return 'Table 2 — Tack Coat Application Rates (gal/yd²)';
			case 'table-4':
				return 'Table 4 — Lift Thickness vs. Minimum Temperature';
			case 'table-5':
				return 'Table 5 — Mix Type Thickness Limits';
			case 'table-12':
				return 'Table 12 — Thickness and Spread Rate Tolerance';
			default:
				return `Table ${tableNumber}`;
		}
	});
</script>

<div class="dot-table" class:compact>
	<button class="toggle-link" onclick={() => (open = !open)} aria-expanded={open}>
		{open ? '▾' : '▸'} Table {tableNumber}
	</button>
	{#if open}
		<div class="table-container">
			<div class="table-title">{tableTitle}</div>
			<div class="table-wrap">
				{#if tableId === 'table-2'}
					<table>
						<thead>
							<tr>
								<th>Tack Use</th>
								<th>Min (gal/yd²)</th>
								<th>Max (gal/yd²)</th>
							</tr>
						</thead>
						<tbody>
							{#each tableData as row}
								<tr class:highlighted={highlightRow === row.id}>
									<td>{row.label}</td>
									<td>{row.min_gal_yd2}<br /><span class="metric">{row.min_metric}</span></td>
									<td>{row.max_gal_yd2}<br /><span class="metric">{row.max_metric}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else if tableId === 'table-4'}
					<table>
						<thead>
							<tr>
								<th>Lift Thickness</th>
								<th>Minimum Air Temperature</th>
							</tr>
						</thead>
						<tbody>
							{#each tableData as row}
								<tr class:highlighted={highlightRow === row.id}>
									<td>{row.label}</td>
									<td>
										{row.min_temp_f}°F ({row.min_temp_c}°C)
										{#if row.note}
											<br /><span class="note-inline">{row.note}</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else if tableId === 'table-5'}
					<table>
						<thead>
							<tr>
								<th>Mix Type</th>
								<th>Min Layer</th>
								<th>Max Layer</th>
								<th>Max Total</th>
							</tr>
						</thead>
						<tbody>
							{#each tableData as row}
								<tr class:highlighted={highlightRow === row.id}>
									<td>{row.label}</td>
									<td>{row.min_layer}</td>
									<td>{row.max_layer}</td>
									<td>{row.max_total}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else if tableId === 'table-12'}
					<table>
						<thead>
							<tr>
								<th>Course</th>
								<th>Thickness Tolerance</th>
								<th>Spread Rate Tolerance</th>
							</tr>
						</thead>
						<tbody>
							{#each tableData as row}
								<tr class:highlighted={highlightRow === row.id}>
									<td>
										{row.label}
										{#if row.note}
											<br /><span class="note-inline">{row.note}</span>
										{/if}
									</td>
									<td>{row.thickness_tolerance}</td>
									<td>{row.spread_tolerance}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.dot-table {
		margin-top: 12px;
	}

	.toggle-link {
		background: none;
		border: 0;
		color: var(--text-muted);
		font-size: 0.75rem;
		padding: 4px 0;
		cursor: pointer;
		min-height: 48px;
		display: flex;
		align-items: center;
	}

	.table-container {
		margin-top: 8px;
	}

	.table-title {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text);
		margin-bottom: 8px;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius, 10px);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--surface);
		font-size: 0.8rem;
	}

	thead {
		background: var(--surface-alt);
	}

	th {
		text-align: left;
		padding: 10px 12px;
		font-weight: 700;
		border-bottom: 2px solid var(--border);
		white-space: nowrap;
		font-size: 0.75rem;
	}

	td {
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
		font-size: 0.78rem;
		line-height: 1.4;
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	tbody tr:hover {
		background: var(--surface-alt);
	}

	tbody tr.highlighted {
		border-left: 3px solid var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	tbody tr.highlighted td:first-child {
		padding-left: 9px;
	}

	.metric {
		font-size: 0.85em;
		color: var(--text-muted);
	}

	.note-inline {
		font-size: 0.85em;
		color: var(--text-muted);
		font-style: italic;
	}

	.compact table {
		font-size: 0.75rem;
	}

	.compact th,
	.compact td {
		padding: 8px 10px;
	}

	@media (max-width: 600px) {
		table {
			font-size: 0.72rem;
		}

		th,
		td {
			padding: 8px 10px;
		}
	}
</style>
