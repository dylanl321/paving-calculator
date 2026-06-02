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
		margin: 12px 0;
	}

	.forecast-title {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		display: block;
		margin-bottom: 8px;
	}

	.forecast-row {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 4px;
		-webkit-overflow-scrolling: touch;
	}

	.day-card {
		flex: 0 0 auto;
		background: var(--surface-alt, #2e3b46);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 10px 8px;
		min-width: 72px;
		min-height: 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		text-align: center;
	}

	.day-weekday {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--text-muted);
		letter-spacing: 0.3px;
	}

	.day-icon {
		font-size: 1.4rem;
		line-height: 1;
	}

	.day-temp {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
	}

	.day-precip {
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--text-muted);
		margin-top: 2px;
	}

	.day-precip.warn {
		color: var(--accent, #f2c037);
	}

	.forecast-row::-webkit-scrollbar {
		height: 6px;
	}

	.forecast-row::-webkit-scrollbar-track {
		background: var(--surface);
		border-radius: 3px;
	}

	.forecast-row::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: 3px;
	}
</style>
