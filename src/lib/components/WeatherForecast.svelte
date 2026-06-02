<script lang="ts">
	import { weather } from '$lib/stores/weather.svelte';
	import type { DayForecast } from '$lib/services/weather';

	const WMO_EMOJI: Record<number, string> = {
		0: '☀️',
		1: '🌤️',
		2: '⛅',
		3: '☁️',
		45: '🌫️',
		48: '🌫️',
		51: '🌦️',
		53: '🌧️',
		55: '🌧️',
		61: '🌧️',
		63: '🌧️',
		65: '🌧️',
		71: '🌨️',
		73: '🌨️',
		75: '🌨️',
		80: '🌦️',
		81: '🌧️',
		82: '⛈️',
		95: '⛈️',
		96: '⛈️',
		99: '⛈️'
	};

	const WMO_CODE_MAP: Record<string, number> = {
		'Clear': 0,
		'Mainly clear': 1,
		'Partly cloudy': 2,
		'Overcast': 3,
		'Fog': 45,
		'Light drizzle': 51,
		'Drizzle': 53,
		'Heavy drizzle': 55,
		'Light rain': 61,
		'Rain': 63,
		'Heavy rain': 65,
		'Light snow': 71,
		'Snow': 73,
		'Heavy snow': 75,
		'Rain showers': 80,
		'Heavy showers': 82,
		'Thunderstorm': 95
	};

	function conditionsEmoji(conditions: string): string {
		const code = WMO_CODE_MAP[conditions];
		return code != null ? (WMO_EMOJI[code] ?? '🌡️') : '🌡️';
	}

	function formatWeekday(dateStr: string): string {
		const d = new Date(dateStr);
		return d.toLocaleDateString(undefined, { weekday: 'short' });
	}
</script>

{#if weather.dailyForecast.length > 0}
	<div class="forecast-container">
		<span class="forecast-title">10-day forecast</span>
		<div class="forecast-row">
			{#each weather.dailyForecast as day (day.date)}
				<div class="day-card">
					<span class="day-weekday">{formatWeekday(day.date)}</span>
					<span class="day-icon" role="img" aria-label={day.conditions}>
						{conditionsEmoji(day.conditions)}
					</span>
					<span class="day-temp">{day.highF}° / {day.lowF}°</span>
					{#if day.precipProbabilityMax > 20}
						<span class="day-precip" class:warn={day.precipProbabilityMax >= 40}>
							{day.precipProbabilityMax}%
						</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.forecast-container {
		margin: var(--sp-3) 0;
	}

	.forecast-title {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		display: block;
		margin-bottom: var(--sp-2);
	}

	.forecast-row {
		display: flex;
		gap: var(--sp-2);
		overflow-x: auto;
		padding-bottom: var(--sp-1);
		-webkit-overflow-scrolling: touch;
	}

	.day-card {
		flex: 0 0 auto;
		background: var(--surface-alt, #2e3b46);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-3) var(--sp-2);
		min-width: 72px;
		min-height: var(--touch);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-1);
		text-align: center;
	}

	.day-weekday {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		color: var(--text-muted);
		letter-spacing: 0.3px;
	}

	.day-icon {
		font-size: 1.4rem;
		line-height: 1;
	}

	.day-temp {
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		color: var(--text);
		white-space: nowrap;
	}

	.day-precip {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		color: var(--text-muted);
		margin-top: var(--sp-1);
	}

	.day-precip.warn {
		color: var(--accent, #f2c037);
	}

	.forecast-row::-webkit-scrollbar {
		height: var(--sp-2);
	}

	.forecast-row::-webkit-scrollbar-track {
		background: var(--surface);
		border-radius: var(--sp-1);
	}

	.forecast-row::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: var(--sp-1);
	}
</style>
