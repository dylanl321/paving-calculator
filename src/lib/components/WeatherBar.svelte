<script lang="ts">
	import { weather } from '$lib/stores/weather.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { placementCheck } from '$lib/config';
	import OfflineBadge from '$lib/components/ui/OfflineBadge.svelte';

	let collapsed = $state(true);

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

	const weatherEmoji = $derived.by(() => {
		const cond = weather.conditions.toLowerCase();
		if (cond.includes('rain')) return '🌧️';
		if (cond.includes('snow')) return '❄️';
		if (cond.includes('fog')) return '🌫️';
		if (cond.includes('cloud')) return '☁️';
		if (cond.includes('clear') || cond.includes('sun')) return '☀️';
		if (cond.includes('partly')) return '⛅';
		return '🌤️';
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

	function toggleCollapse() {
		collapsed = !collapsed;
	}
</script>

<div class="weather-bar" class:weather-bar--good={tempStatus === 'good'} class:weather-bar--warn={tempStatus === 'warn'} class:weather-bar--bad={tempStatus === 'bad'} class:weather-bar--neutral={tempStatus === 'neutral'} class:weather-bar--collapsed={collapsed}>
	{#if !weather.hasLocation}
		<div class="weather-bar__hint">Set location for weather</div>
		<OfflineBadge />
	{:else}
		<button type="button" class="weather-bar__toggle" onclick={toggleCollapse} aria-label={collapsed ? 'Expand weather bar' : 'Collapse weather bar'}>
			{#if weather.effectiveTempF != null}
				<span class="weather-bar__temp">{Math.round(weather.effectiveTempF)}°F</span>
			{:else}
				<span class="weather-bar__temp">--°F</span>
			{/if}
		</button>

		{#if !collapsed}
			<div class="weather-bar__content">
				<span class="weather-bar__icon">{weatherEmoji}</span>
				<span class="weather-bar__conditions">{weather.conditions || 'Loading...'}</span>
				{#if weather.isRaining}
					<span class="weather-bar__rain" title="Currently raining">💧</span>
				{/if}
				<span class="weather-bar__location">{weather.locationLabel}</span>
				{#if lastUpdatedText}
					<span class="weather-bar__updated">{lastUpdatedText}</span>
				{/if}
			</div>
		{/if}
		<OfflineBadge />
	{/if}
</div>

<style>
	.weather-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		font-size: 0.875rem;
		transition: all 0.2s ease;
	}

	.weather-bar--good {
		background: color-mix(in srgb, var(--good) 8%, var(--surface));
		border-bottom-color: var(--good);
	}

	.weather-bar--warn {
		background: color-mix(in srgb, var(--warn) 8%, var(--surface));
		border-bottom-color: var(--warn);
	}

	.weather-bar--bad {
		background: color-mix(in srgb, var(--bad) 8%, var(--surface));
		border-bottom-color: var(--bad);
	}

	.weather-bar--neutral {
		background: var(--surface);
		border-bottom-color: var(--border);
	}

	.weather-bar__hint {
		flex: 1;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

	.weather-bar__toggle {
		min-width: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text);
		font-weight: 600;
		font-size: 1rem;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.weather-bar__toggle:hover {
		opacity: 0.8;
	}

	.weather-bar__temp {
		white-space: nowrap;
	}

	.weather-bar__content {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.weather-bar__icon {
		font-size: 1.25rem;
		line-height: 1;
	}

	.weather-bar__conditions {
		font-weight: 500;
		color: var(--text);
	}

	.weather-bar__rain {
		font-size: 1rem;
	}

	.weather-bar__location {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

	.weather-bar__updated {
		color: var(--text-muted);
		font-size: 0.75rem;
		margin-left: auto;
	}

	@media (max-width: 899px) {
		.weather-bar--collapsed .weather-bar__content {
			display: none;
		}
	}

	@media (min-width: 900px) {
		.weather-bar {
			padding: 10px 24px;
		}

		.weather-bar__toggle {
			cursor: default;
			pointer-events: none;
		}

		.weather-bar__content {
			display: flex !important;
		}
	}
</style>
