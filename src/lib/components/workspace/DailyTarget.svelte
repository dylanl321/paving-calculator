<script lang="ts">
	import { today } from '$lib/stores/today.svelte';

	const YESTERDAY_KEY = 'paverate.yesterday_target';

	let editMode = $state(false);
	let form = $state({
		tons_ordered: 0,
		expected_loads: 0,
		plant_name: '',
		mix_type: ''
	});

	const hasTarget = $derived(today.targetTons != null || today.targetLoads != null);
	const progress = $derived(today.targetProgress);
	const rollup = $derived(today.rollup);

	function startEdit() {
		form = {
			tons_ordered: today.targetTons ?? 0,
			expected_loads: today.targetLoads ?? 0,
			plant_name: today.plantName ?? '',
			mix_type: today.mixType ?? ''
		};
		editMode = true;
	}

	function saveTarget() {
		today.targetTons = form.tons_ordered > 0 ? form.tons_ordered : null;
		today.targetLoads = form.expected_loads > 0 ? form.expected_loads : null;
		today.plantName = form.plant_name.trim() || null;
		today.mixType = form.mix_type.trim() || null;

		// Save to localStorage for "Copy Yesterday" feature
		if (typeof localStorage !== 'undefined') {
			try {
				localStorage.setItem(YESTERDAY_KEY, JSON.stringify({
					target_tons: form.tons_ordered,
					target_loads: form.expected_loads,
					plant_name: form.plant_name,
					mix_type: form.mix_type
				}));
			} catch {
				// Ignore quota errors
			}
		}

		editMode = false;
	}

	function copyYesterday() {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(YESTERDAY_KEY);
			if (!raw) return;
			const prev = JSON.parse(raw);
			form = {
				tons_ordered: prev.target_tons ?? 0,
				expected_loads: prev.target_loads ?? 0,
				plant_name: prev.plant_name ?? '',
				mix_type: prev.mix_type ?? ''
			};
		} catch {
			// Ignore parse errors
		}
	}

	function getBarColor(): string {
		if (!progress.tons_pct) return '#F59E0B';
		if (progress.tons_pct >= 100) return '#10B981';
		if (progress.status === 'behind') return '#EF4444';
		return '#F59E0B';
	}

	$effect(() => {
		if (!hasTarget && !editMode) {
			startEdit();
		}
	});
</script>

<section class="daily-target">
	{#if !hasTarget || editMode}
		<div class="target-form">
			<div class="form-head">
				<span class="eyebrow">Daily Target</span>
			</div>
			<div class="form-grid">
				<label class="f">
					<span>Tons Ordered</span>
					<input type="number" inputmode="decimal" bind:value={form.tons_ordered} />
				</label>
				<label class="f">
					<span>Expected Loads</span>
					<input type="number" inputmode="numeric" bind:value={form.expected_loads} />
				</label>
				<label class="f">
					<span>Plant Name</span>
					<input type="text" bind:value={form.plant_name} />
				</label>
				<label class="f">
					<span>Mix Type</span>
					<input type="text" bind:value={form.mix_type} />
				</label>
			</div>
			<div class="form-actions">
				<button class="btn btn-primary" onclick={saveTarget}>Set Target</button>
				<button class="btn btn-ghost" onclick={copyYesterday}>Copy Yesterday</button>
			</div>
		</div>
	{:else}
		<div class="target-progress">
			<div class="target-head">
				<div>
					<span class="eyebrow">Daily Target</span>
					{#if today.plantName || today.mixType}
						<div class="target-meta">
							{#if today.plantName}<span>{today.plantName}</span>{/if}
							{#if today.mixType}<span>{today.mixType}</span>{/if}
						</div>
					{/if}
				</div>
				<button class="btn btn-subtle btn-sm" onclick={startEdit}>Edit Target</button>
			</div>

			{#if today.targetTons != null && today.targetTons > 0}
				<div class="progress-item">
					<div class="progress-label">
						<span>{rollup.total_tons.toFixed(1)} / {today.targetTons} tons</span>
						{#if progress.tons_pct != null}
							<span class="progress-pct">{Math.round(progress.tons_pct)}%</span>
						{/if}
					</div>
					<div class="progress-bar">
						<div
							class="progress-fill"
							style="width: {Math.min((progress.tons_pct ?? 0), 100)}%; background-color: {getBarColor()};"
						></div>
					</div>
				</div>
			{/if}

			{#if today.targetLoads != null && today.targetLoads > 0}
				<div class="progress-item">
					<div class="progress-label">
						<span>{rollup.total_loads} / {today.targetLoads} loads</span>
						{#if progress.loads_pct != null}
							<span class="progress-pct">{Math.round(progress.loads_pct)}%</span>
						{/if}
					</div>
					<div class="progress-bar">
						<div
							class="progress-fill"
							style="width: {Math.min((progress.loads_pct ?? 0), 100)}%; background-color: {getBarColor()};"
						></div>
					</div>
				</div>
			{/if}

			{#if progress.status === 'done'}
				<div class="celebration">Target met!</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.daily-target {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
	}

	.target-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.form-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
	}

	.f {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--fs-xs);
		color: var(--text-2);
	}

	.f input {
		width: 100%;
		min-height: 48px;
		padding: 0 var(--sp-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-1);
		font-size: var(--fs-base);
	}

	.form-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.target-progress {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.target-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.target-meta {
		display: flex;
		gap: var(--sp-2);
		margin-top: 2px;
		font-size: var(--fs-xs);
		color: var(--text-2);
	}

	.progress-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.progress-label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: var(--fs-sm);
		color: var(--text-1);
	}

	.progress-pct {
		font-weight: var(--fw-bold);
		color: var(--accent);
	}

	.progress-bar {
		height: 8px;
		background: var(--surface);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		transition: width 0.3s ease, background-color 0.3s ease;
		border-radius: var(--radius-pill);
	}

	.celebration {
		padding: var(--sp-2);
		text-align: center;
		font-size: var(--fs-sm);
		font-weight: var(--fw-bold);
		color: #10B981;
		background: color-mix(in srgb, #10B981 16%, transparent);
		border: 1px solid color-mix(in srgb, #10B981 30%, transparent);
		border-radius: var(--radius-sm);
	}

	@media (max-width: 640px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
