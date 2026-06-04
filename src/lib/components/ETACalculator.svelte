<script lang="ts">
	import { CalendarClock, CloudRain } from 'lucide-svelte';
	import type { DbLoad } from '$lib/server/db';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { toMetricTonnes, UNIT_LABELS } from '$lib/utils/unitConvert';
	import { fetchWeather, type WeatherSnapshot } from '$lib/services/weather';
	import { weatherConfig } from '$lib/config';
	import { calcETAStats, calcWeatherAdjustedETA } from '$lib/calc';

	interface Props {
		jobSiteId: string;
		targetTonnage: number | null;
		isAuthenticated?: boolean;
		latitude?: number | null;
		longitude?: number | null;
	}

	let { jobSiteId, targetTonnage, isAuthenticated = false, latitude = null, longitude = null }: Props = $props();

	let loads = $state<DbLoad[]>([]);
	let loading = $state(true);
	let error = $state(false);
	let weather = $state<WeatherSnapshot | null>(null);
	let weatherError = $state(false);

	const MIN_DAYS_FOR_ETA = 2;

	$effect(() => {
		if (isAuthenticated) {
			loadAllLoads();
		} else {
			loading = false;
		}
	});

	$effect(() => {
		if (latitude != null && longitude != null) {
			loadWeather();
		}
	});

	async function loadWeather() {
		if (latitude == null || longitude == null) return;
		weatherError = false;
		try {
			weather = await fetchWeather(latitude, longitude);
		} catch {
			weatherError = true;
			weather = null;
		}
	}

	async function loadAllLoads() {
		loading = true;
		error = false;
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/loads?limit=10000`, {
				credentials: 'include'
			});
			if (res.ok) {
				const data = (await res.json()) as { loads: DbLoad[] };
				loads = data.loads;
			} else {
				error = true;
			}
		} catch {
			error = true;
		} finally {
			loading = false;
		}
	}

	// Group loads by calendar day and calculate stats
	const stats = $derived.by(() => {
		return calcETAStats(loads, targetTonnage);
	});

	// Convert values to display units
	const displayTotalTons = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(stats.totalTons) : stats.totalTons
	);
	const displayAvgTonsPerDay = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(stats.avgTonsPerDay) : stats.avgTonsPerDay
	);
	const displayRemainingTons = $derived(
		stats.remainingTons != null
			? unitsStore.system === 'metric'
				? toMetricTonnes(stats.remainingTons)
				: stats.remainingTons
			: null
	);

	function formatDate(date: Date): string {
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	// Weather-adjusted ETA calculation
	const weatherAdjustedStats = $derived.by(() => {
		if (!weather || stats.daysRemaining == null || stats.daysRemaining <= 0) {
			return null;
		}

		return calcWeatherAdjustedETA(
			stats.daysRemaining,
			weather.dailyForecast,
			weatherConfig.rainBlockIn
		);
	});
</script>

<div class="eta-calculator">
	<div class="eta-header">
		<CalendarClock size={24} />
		<h3>ETA Calculator</h3>
	</div>

	{#if !isAuthenticated}
		<div class="eta-message">Sign in to see ETA</div>
	{:else if loading}
		<div class="eta-message">Loading...</div>
	{:else if error}
		<div class="eta-message">Failed to load data</div>
	{:else}
		<div class="tally-grid">
			<div class="tally-item">
				<div class="tally-label">Total Placed</div>
				<div class="tally-value">{displayTotalTons.toFixed(1)}</div>
				<div class="tally-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
			</div>

			<div class="tally-item">
				<div class="tally-label">Avg/Day</div>
				<div class="tally-value">{displayAvgTonsPerDay.toFixed(1)}</div>
				<div class="tally-unit">{UNIT_LABELS.tons[unitsStore.system]}/day</div>
			</div>

			<div class="tally-item">
				<div class="tally-label">Days Worked</div>
				<div class="tally-value">{stats.daysWorked}</div>
				<div class="tally-unit">days</div>
			</div>

			<div class="tally-item">
				<div class="tally-label">Days Remaining</div>
				<div class="tally-value tally-value-accent">
					{stats.daysRemaining != null ? stats.daysRemaining : '—'}
				</div>
				<div class="tally-unit">days</div>
			</div>
		</div>

		<div class="projection-section">
			{#if stats.isComplete}
				<div class="projection-complete">Job complete!</div>
			{:else if !targetTonnage || targetTonnage <= 0}
				<div class="projection-message">Set total tonnage to calculate ETA</div>
			{:else if stats.daysWorked < MIN_DAYS_FOR_ETA}
				<div class="projection-message">Need more production days for ETA</div>
			{:else if stats.projectedDate}
				<div class="projection-date">
					<div class="projection-label">Projected Completion</div>
					<div class="projection-value">{formatDate(stats.projectedDate)}</div>
					<div class="projection-note">
						at {displayAvgTonsPerDay.toFixed(1)} {UNIT_LABELS.tons[unitsStore.system]}/day avg
					</div>
				</div>
			{:else if stats.avgTonsPerDay === 0}
				<div class="projection-message">Need more production days for ETA</div>
			{/if}
		</div>

		{#if weatherAdjustedStats && !stats.isComplete && stats.projectedDate}
			<div class="weather-section">
				<div class="weather-header">
					<CloudRain size={20} />
					<div class="weather-label">Weather-Adjusted ETA</div>
				</div>
				{#if weatherAdjustedStats.forecastExceeded}
					<div class="weather-message">
						Rain delays extend beyond forecast window
					</div>
				{:else if weatherAdjustedStats.adjustedDate}
					<div class="weather-date">
						<div class="weather-value">{formatDate(weatherAdjustedStats.adjustedDate)}</div>
						{#if weatherAdjustedStats.rainDaysExcluded > 0}
							<div class="weather-note">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
								</svg>
								{weatherAdjustedStats.rainDaysExcluded} rain {weatherAdjustedStats.rainDaysExcluded === 1 ? 'day' : 'days'} excluded from forecast
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.eta-calculator {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		margin-bottom: var(--sp-4);
	}

	.eta-header {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.eta-header h3 {
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
	}

	.eta-message {
		padding: var(--sp-4);
		text-align: center;
		color: var(--text-muted);
		font-size: var(--fs-md);
	}

	.tally-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.tally-item {
		text-align: center;
	}

	.tally-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--sp-1);
	}

	.tally-value {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-bold);
		color: var(--text);
		line-height: 1.2;
	}

	.tally-value-accent {
		color: var(--accent);
	}

	.tally-unit {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: var(--sp-1);
	}

	.projection-section {
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
	}

	.projection-date {
		text-align: center;
	}

	.projection-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--sp-2);
	}

	.projection-value {
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		color: var(--accent);
		margin-bottom: var(--sp-1);
	}

	.projection-note {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.projection-message {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		text-align: center;
		padding: var(--sp-2);
	}

	.projection-complete {
		font-size: var(--fs-md);
		font-weight: var(--fw-bold);
		color: #22c55e;
		text-align: center;
		padding: var(--sp-2);
	}

	.weather-section {
		padding-top: var(--sp-3);
		margin-top: var(--sp-3);
		border-top: 1px solid var(--border);
	}

	.weather-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
		color: var(--info, #60a5fa);
	}

	.weather-label {
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: var(--fw-bold);
	}

	.weather-date {
		text-align: center;
	}

	.weather-value {
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		color: var(--info, #60a5fa);
		margin-bottom: var(--sp-1);
	}

	.weather-note {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-1);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.weather-note svg {
		opacity: 0.6;
	}

	.weather-message {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		text-align: center;
		padding: var(--sp-2);
		font-style: italic;
	}

	@media (max-width: 460px) {
		.tally-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
