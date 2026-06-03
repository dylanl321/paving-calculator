<script lang="ts">
	import type { TodayState } from "$lib/stores/today.svelte";

	interface Props {
		state: TodayState;
	}

	let { state }: Props = $props();

	// Mobile-first: collapsed on <640px, expanded on desktop
	let expanded = $state(false);

	// Detect screen size
	let isDesktop = $state(false);
	$effect(() => {
		if (typeof window !== "undefined") {
			isDesktop = window.innerWidth >= 640;
			const handleResize = () => {
				isDesktop = window.innerWidth >= 640;
			};
			window.addEventListener("resize", handleResize);
			return () => window.removeEventListener("resize", handleResize);
		}
	});

	// Completeness score
	const score = $derived(() => {
		const required = [
			{ key: "weather_temp_f", label: "Temperature", check: state.weather_temp_f != null },
			{ key: "crew_count", label: "Crew Count", check: state.crew_count != null },
			{ key: "start_time", label: "Start Time", check: state.start_time != null && state.start_time !== "" },
			{ key: "end_time", label: "End Time", check: state.end_time != null && state.end_time !== "" },
			{ key: "has_entries", label: "Log Entry", check: state.entries.length > 0 }
		];

		const optional = [
			{ key: "notes", label: "Notes", check: state.notes != null && state.notes !== "" },
			{ key: "wind_speed_mph", label: "Wind Speed", check: state.wind_speed_mph != null },
			{ key: "plant_name", label: "Plant Name", check: state.plant_name != null && state.plant_name !== "" }
		];

		const requiredComplete = required.filter((f) => f.check).length;
		const optionalComplete = optional.filter((f) => f.check).length;
		const total = required.length + optional.length;
		const complete = requiredComplete + optionalComplete;
		const pct = (complete / total) * 100;

		const missing = required.filter((f) => !f.check);

		let color = "#ef4444"; // red
		if (pct >= 90) color = "#22c55e"; // green
		else if (pct >= 60) color = "#eab308"; // yellow

		return { pct, color, missing };
	});

	function toggle() {
		expanded = !expanded;
	}
</script>

<div class="completeness" role="button" tabindex="0" onclick={toggle} onkeydown={(e) => e.key === "Enter" && toggle()}>
	<div class="bar-container">
		<div class="bar-track">
			<div class="bar-fill" style="width: {score().pct}%; background: {score().color};"></div>
		</div>
		<div class="percentage" style="color: {score().color};">{Math.round(score().pct)}%</div>
	</div>

	{#if (isDesktop || expanded) && score().missing.length > 0}
		<div class="missing-fields">
			<span class="missing-label">Missing:</span>
			{#each score().missing as field (field.key)}
				<span class="missing-item">{field.label}</span>
			{/each}
		</div>
	{:else if (isDesktop || expanded) && score().missing.length === 0}
		<div class="complete-message">
			<svg class="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			Log complete
		</div>
	{/if}
</div>

<style>
	.completeness {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		cursor: pointer;
		min-height: 48px;
		transition: background 0.15s ease;
	}

	.completeness:hover {
		background: color-mix(in srgb, var(--surface-alt) 90%, var(--text) 10%);
	}

	.bar-container {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.bar-track {
		flex: 1;
		height: 8px;
		background: var(--surface);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		border-radius: var(--radius-pill);
		transition: width 0.3s ease, background 0.3s ease;
	}

	.percentage {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		font-variant-numeric: tabular-nums;
		min-width: 48px;
		text-align: right;
	}

	.missing-fields {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1) var(--sp-2);
		font-size: var(--fs-sm);
		align-items: center;
	}

	.missing-label {
		color: var(--text-muted);
		font-weight: var(--fw-medium);
	}

	.missing-item {
		background: var(--surface);
		border: 1px solid var(--border);
		padding: 2px var(--sp-2);
		border-radius: var(--radius-sm);
		color: var(--text);
	}

	.complete-message {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		color: #22c55e;
		font-weight: var(--fw-medium);
		font-size: var(--fs-sm);
	}

	.check-icon {
		color: #22c55e;
		flex-shrink: 0;
	}

	@media (min-width: 640px) {
		.completeness {
			cursor: default;
		}

		.completeness:hover {
			background: var(--surface-alt);
		}
	}
</style>
