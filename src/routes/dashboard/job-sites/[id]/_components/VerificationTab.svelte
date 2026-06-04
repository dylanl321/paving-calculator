<script lang="ts">
	import { browser } from '$app/environment';
	import { fmt, fmtDollars, type ConfigForm } from './shared';
	import { api } from '$lib/utils/api-error';

	let {
		jobSiteId,
		configForm,
		onGoToTab
	}: {
		jobSiteId: string;
		configForm: ConfigForm;
		onGoToTab: (tab: string) => void;
	} = $props();

	interface ContractInfo {
		job_number: string | null;
		project_number: string | null;
		contract_id: string | null;
		work_type: string | null;
		contract_type: string | null;
		contract_amount: number | null;
		retainage_pct: number | null;
		est_start_date: string | null;
		completion_date: string | null;
		customer_name: string | null;
		customer_contact: string | null;
		customer_phone: string | null;
		customer_email: string | null;
		owner_name: string | null;
		project_manager: string | null;
		asphalt_supplier: string | null;
	}
	interface Mix {
		id: string;
		mix_name: string;
		mix_type: string | null;
		unit: string | null;
		bid_quantity: number | null;
		takeoff_tonnage: number | null;
		quantity_per_day: number | null;
		est_days: number | null;
		target_thickness_in: number | null;
		target_spread_rate: number | null;
		contract_unit_price: number | null;
		is_active: number;
	}

	let contract = $state<ContractInfo | null>(null);
	let mixes = $state<Mix[]>([]);
	let scopes = $state<string[]>([]);
	let bidItemCount = $state(0);
	let loading = $state(true);

	$effect(() => {
		if (!browser) return;
		loading = true;
		Promise.all([
			api.get(`/api/job-sites/${jobSiteId}/bid-items`).catch(() => ({})),
			api.get(`/api/job-sites/${jobSiteId}/mixes`).catch(() => ({}))
		])
			.then(([bi, mx]) => {
				contract = (bi as any).contract ?? null;
				scopes = (bi as any).scopes ?? [];
				bidItemCount = ((bi as any).bid_items ?? []).length;
				mixes = (mx as any).mixes ?? [];
				loading = false;
			})
			.catch(() => {
				loading = false;
			});
	});

	type Status = 'present' | 'missing';
	interface Row {
		label: string;
		value: string | null;
		status: Status;
	}

	function row(label: string, value: unknown, format?: (v: number) => string): Row {
		let display: string | null = null;
		if (value !== null && value !== undefined && value !== '') {
			if (typeof value === 'number') display = format ? format(value) : fmt(value, 0);
			else display = String(value);
		}
		return { label, value: display, status: display ? 'present' : 'missing' };
	}

	const projectRows = $derived<Row[]>(
		contract
			? [
					row('Project Number', contract.project_number),
					row('Contract ID', contract.contract_id),
					row('Job Number', contract.job_number),
					row('Work Type', contract.work_type),
					row('Contract Type', contract.contract_type),
					row('Contract Amount', contract.contract_amount, fmtDollars),
					row('Retainage %', contract.retainage_pct),
					row('Start Date', contract.est_start_date),
					row('Completion Date', contract.completion_date)
				]
			: []
	);

	const customerRows = $derived<Row[]>(
		contract
			? [
					row('Customer', contract.customer_name),
					row('Contact', contract.customer_contact),
					row('Phone', contract.customer_phone),
					row('Email', contract.customer_email),
					row('Owner', contract.owner_name),
					row('Project Manager', contract.project_manager),
					row('Asphalt Supplier', contract.asphalt_supplier)
				]
			: []
	);

	const roadwayRows = $derived<Row[]>([
		row('Road Type', configForm.road_type),
		row('Number of Lanes', configForm.num_lanes),
		row('Lane Width (ft)', configForm.lane_width_ft),
		row('Total Length (ft)', configForm.total_length_ft),
		row('Number of Lifts', configForm.num_lifts),
		row('Scope of Work', configForm.scope_of_work),
		row('Route Designation', configForm.route_designation)
	]);

	const costRows = $derived<Row[]>([
		row('Cost per Ton', configForm.cost_per_ton, fmtDollars),
		row('Cost per SY', configForm.cost_per_sy, fmtDollars),
		row('Cost per Mile', configForm.cost_per_mile, fmtDollars),
		row('Total Contract Value', configForm.total_contract_value, fmtDollars)
	]);

	// Per-mix completeness: which spec fields are present vs need validation.
	function mixRows(m: Mix): Row[] {
		return [
			row('Mix Type', m.mix_type),
			row('Allotted (Contract)', m.bid_quantity),
			row('Target (Goal)', m.takeoff_tonnage),
			row('Contract Unit Price', m.contract_unit_price, fmtDollars),
			row('Target Thickness (in)', m.target_thickness_in),
			row('Target Spread (lbs/yd²)', m.target_spread_rate),
			row('Qty / Day', m.quantity_per_day),
			row('Est. Days', m.est_days)
		];
	}

	const allRows = $derived<Row[]>([
		...projectRows,
		...customerRows,
		...roadwayRows,
		...costRows,
		...mixes.flatMap(mixRows)
	]);
	const presentCount = $derived(allRows.filter((r) => r.status === 'present').length);
	const missingCount = $derived(allRows.filter((r) => r.status === 'missing').length);
	const total = $derived(allRows.length);
	const pct = $derived(total > 0 ? Math.round((presentCount / total) * 100) : 0);
</script>

<section class="section">
	<div class="verify-head">
		<div>
			<h3>Import Verification</h3>
			<p class="verify-sub">
				Review what was pulled from the documents. <span class="chip present-chip">Imported</span>
				values came from the PDFs; <span class="chip missing-chip">Needs validation</span> items couldn't be
				determined and should be confirmed or added.
			</p>
		</div>
		<button class="btn btn-ghost" onclick={() => onGoToTab('configuration')}>Edit Configuration</button>
	</div>

	{#if loading}
		<div class="verify-empty">Loading verification…</div>
	{:else}
		<div class="verify-summary">
			<div class="summary-bar">
				<div class="summary-fill" style="width: {pct}%"></div>
			</div>
			<div class="summary-stats">
				<span class="stat present">{presentCount} imported</span>
				<span class="stat missing">{missingCount} need validation</span>
				<span class="stat total">{pct}% complete</span>
			</div>
		</div>

		{@render group('Project & Contract', projectRows, 'configuration')}
		{@render group('Customer / Owner', customerRows, 'configuration')}
		{@render group('Roadway', roadwayRows, 'configuration')}
		{@render group('Contract Costs', costRows, 'configuration')}

		<div class="group-block">
			<div class="group-title-row">
				<h4 class="group-title">Bid Items</h4>
			</div>
			<div class="verify-row {bidItemCount > 0 ? 'present' : 'missing'}">
				<span class="row-status">{bidItemCount > 0 ? '✓' : '!'}</span>
				<span class="row-label">Schedule of Items</span>
				<span class="row-value">
					{bidItemCount > 0 ? `${bidItemCount} items imported` : 'None imported'}
				</span>
			</div>
			<div class="verify-row {scopes.length > 0 ? 'present' : 'missing'}">
				<span class="row-status">{scopes.length > 0 ? '✓' : '!'}</span>
				<span class="row-label">Scope Tags</span>
				<span class="row-value">{scopes.length > 0 ? scopes.map((s) => s.replace(/_/g, ' ')).join(', ') : 'None'}</span>
			</div>
		</div>

		{#each mixes as m (m.id)}
			{@render group(`Mix: ${m.mix_name}${m.is_active ? ' (active)' : ''}`, mixRows(m), 'configuration')}
		{/each}

		{#if mixes.length === 0}
			<div class="group-block">
				<div class="verify-row missing">
					<span class="row-status">!</span>
					<span class="row-label">Mixes</span>
					<span class="row-value">No mixes imported — add them in Configuration.</span>
				</div>
			</div>
		{/if}
	{/if}
</section>

{#snippet group(title: string, rows: Row[], tab: string)}
	{#if rows.length > 0}
		<div class="group-block">
			<div class="group-title-row">
				<h4 class="group-title">{title}</h4>
				<button class="group-edit" onclick={() => onGoToTab(tab)}>Edit</button>
			</div>
			{#each rows as r}
				<div class="verify-row {r.status}">
					<span class="row-status">{r.status === 'present' ? '✓' : '!'}</span>
					<span class="row-label">{r.label}</span>
					<span class="row-value">{r.value ?? 'Needs validation'}</span>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

<style>
	.verify-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 20px;
	}

	.verify-sub {
		margin: 4px 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		max-width: 70ch;
		line-height: 1.6;
	}

	.chip {
		display: inline-block;
		padding: 1px 8px;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 600;
	}

	.present-chip {
		background: color-mix(in srgb, #22c55e 18%, var(--surface));
		color: #16a34a;
	}

	.missing-chip {
		background: color-mix(in srgb, var(--accent) 18%, var(--surface));
		color: var(--accent);
	}

	.verify-empty {
		padding: 24px;
		text-align: center;
		color: var(--text-muted);
	}

	.verify-summary {
		margin-bottom: 24px;
	}

	.summary-bar {
		height: 8px;
		background: var(--surface-alt, var(--border));
		border-radius: 999px;
		overflow: hidden;
		margin-bottom: 8px;
	}

	.summary-fill {
		height: 100%;
		background: #22c55e;
		transition: width 0.3s;
	}

	.summary-stats {
		display: flex;
		gap: 16px;
		font-size: 0.82rem;
	}

	.summary-stats .stat {
		font-weight: 600;
	}

	.summary-stats .present {
		color: #16a34a;
	}

	.summary-stats .missing {
		color: var(--accent);
	}

	.summary-stats .total {
		color: var(--text-muted);
		margin-left: auto;
	}

	.group-block {
		margin-bottom: 20px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.group-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		background: var(--surface-alt, var(--surface));
		border-bottom: 1px solid var(--border);
	}

	.group-title {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 700;
	}

	.group-edit {
		background: none;
		border: none;
		color: var(--accent);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		min-height: 32px;
	}

	.verify-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		border-left: 3px solid transparent;
	}

	.verify-row:last-child {
		border-bottom: none;
	}

	.verify-row.present {
		border-left-color: #22c55e;
	}

	.verify-row.missing {
		border-left-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 5%, transparent);
	}

	.row-status {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 0.72rem;
		font-weight: 800;
	}

	.verify-row.present .row-status {
		background: color-mix(in srgb, #22c55e 20%, transparent);
		color: #16a34a;
	}

	.verify-row.missing .row-status {
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		color: var(--accent);
	}

	.row-label {
		flex: 0 0 auto;
		width: 180px;
		font-size: 0.85rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.row-value {
		flex: 1;
		min-width: 0;
		font-size: 0.9rem;
		color: var(--text);
		word-break: break-word;
	}

	.verify-row.missing .row-value {
		color: var(--accent);
		font-style: italic;
	}

	@media (max-width: 560px) {
		.verify-row {
			flex-wrap: wrap;
		}
		.row-label {
			width: auto;
		}
	}
</style>
