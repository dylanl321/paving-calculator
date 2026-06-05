<script lang="ts">
	import { Cloud, CloudFog, CloudRain, CloudSnow, CloudSun, MapPin } from 'lucide-svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { placementCheck } from '$lib/config';

	const tempStatus = $derived.by(() => {
		const temp = weather.effectiveTempF;
		const thickness = calcContext.lift_thickness.value;

		if (temp == null || thickness <= 0 || !weather.hasLocation) {
			return 'neutral';
		}

		const check = placementCheck(temp, thickness);
		if (!check) return 'neutral';

		if (check.status === 'pass') return 'good';
		if (check.status === 'warn') return 'warn';
		return 'bad';
	});

	const statusLabel = $derived.by(() => {
		if (!weather.hasLocation || weather.effectiveTempF == null) return 'Weather';
		if (tempStatus === 'good') return 'Paving window OK';
		if (tempStatus === 'warn') return 'Check conditions';
		if (tempStatus === 'bad') return 'Weather hold';
		return 'Weather';
	});

	const conditionIcon = $derived.by(() => {
		const cond = weather.conditions.toLowerCase();
		if (cond.includes('rain')) return CloudRain;
		if (cond.includes('snow')) return CloudSnow;
		if (cond.includes('fog')) return CloudFog;
		if (cond.includes('cloud')) return Cloud;
		return CloudSun;
	});

	const lastUpdatedText = $derived.by(() => {
		if (!weather.lastFetchedAt) return null;
		const minutes = Math.floor((Date.now() - weather.lastFetchedAt) / 60000);
		if (minutes < 1) return 'Updated just now';
		if (minutes === 1) return 'Updated 1 min ago';
		if (minutes < 60) return `Updated ${minutes} min ago`;
		const hours = Math.floor(minutes / 60);
		if (hours === 1) return 'Updated 1 hour ago';
		return `Updated ${hours} hours ago`;
	});
</script>

<div
	class="weather-bar"
	class:weather-bar--good={tempStatus === 'good'}
	class:weather-bar--warn={tempStatus === 'warn'}
	class:weather-bar--bad={tempStatus === 'bad'}
	class:weather-bar--neutral={tempStatus === 'neutral'}
	aria-label="Weather status"
>
	{#if !weather.hasLocation}
		<div class="weather-bar__icon" aria-hidden="true">
			<CloudSun size={18} />
		</div>
		<div class="weather-bar__body">
			<span class="weather-bar__label">Weather</span>
			<span class="weather-bar__meta">Set location</span>
		</div>
	{:else}
		{@const ConditionIcon = conditionIcon}
		<div class="weather-bar__icon" aria-hidden="true">
			<ConditionIcon size={18} />
		</div>
		<div class="weather-bar__body">
			<div class="weather-bar__topline">
				<span class="weather-bar__temp">
					{weather.effectiveTempF != null ? `${Math.round(weather.effectiveTempF)}°F` : '--°F'}
				</span>
				<span class="weather-bar__label">{statusLabel}</span>
			</div>
			<div class="weather-bar__details">
				<span class="weather-bar__conditions">{weather.conditions || 'Loading'}</span>
				<span class="weather-bar__dot"></span>
				<span class="weather-bar__location">
					<MapPin size={12} aria-hidden="true" />
					{weather.locationLabel}
				</span>
			</div>
			{#if lastUpdatedText}
				<span class="weather-bar__updated">{lastUpdatedText}</span>
			{/if}
		</div>
		{#if weather.isRaining}
			<div class="weather-bar__rain" title="Currently raining" aria-label="Currently raining">
				<CloudRain size={16} />
			</div>
		{/if}
	{/if}
</div>

<style>
	.weather-bar {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin: 8px 12px 0;
		padding: 10px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-left: 3px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 0.8125rem;
	}

	.weather-bar--good {
		border-left-color: var(--good);
	}

	.weather-bar--warn {
		border-left-color: var(--warn);
	}

	.weather-bar--bad {
		border-left-color: var(--bad);
	}

	.weather-bar--neutral {
		border-left-color: var(--border);
	}

	.weather-bar__icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.weather-bar--good .weather-bar__icon {
		color: var(--good);
	}

	.weather-bar--warn .weather-bar__icon {
		color: var(--warn);
	}

	.weather-bar--bad .weather-bar__icon {
		color: var(--bad);
	}

	.weather-bar__body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.weather-bar__topline {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}

	.weather-bar__temp {
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
	}

	.weather-bar__label {
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.weather-bar__meta {
		color: var(--text-muted);
	}

	.weather-bar__details {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.weather-bar__conditions {
		white-space: nowrap;
	}

	.weather-bar__dot {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--text-muted);
		opacity: 0.45;
		flex-shrink: 0;
	}

	.weather-bar__location {
		display: flex;
		align-items: center;
		gap: 3px;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.weather-bar__updated {
		color: var(--text-muted);
		font-size: 0.7rem;
		opacity: 0.75;
	}

	.weather-bar__rain {
		color: var(--warn);
		flex-shrink: 0;
	}

	@media (min-width: 900px) and (max-width: 1099px) {
		.weather-bar {
			justify-content: center;
			align-items: center;
			margin: 8px;
			padding: 10px 0;
			border-left-width: 1px;
		}

		.weather-bar__body,
		.weather-bar__rain {
			display: none;
		}
	}

	:global(.sidebar.nav-collapsed) .weather-bar {
		justify-content: center;
		align-items: center;
		margin: 8px;
		padding: 10px 0;
		border-left-width: 1px;
	}

	:global(.sidebar.nav-collapsed) .weather-bar__body,
	:global(.sidebar.nav-collapsed) .weather-bar__rain {
		display: none;
	}

	@media (max-width: 899px) {
		.weather-bar {
			margin: 8px 12px 0;
		}
	}
</style>
