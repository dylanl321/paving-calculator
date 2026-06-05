<script lang="ts">
	import { Cloud, CloudFog, CloudRain, CloudSnow, CloudSun, MapPin } from 'lucide-svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { placementCheck } from '$lib/config';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import { fetchWeather, type WeatherSnapshot } from '$lib/services/weather';

	let snapshot = $state<WeatherSnapshot | null>(null);
	let loading = $state(false);
	let fetchError = $state(false);
	let fetchKey = $state<string | null>(null);

	const plantLat = $derived(orgSettingsStore.plantLat);
	const plantLng = $derived(orgSettingsStore.plantLng);
	const hasPlantLocation = $derived(plantLat != null && plantLng != null);
	const locationLabel = $derived(orgSettingsStore.plantName || 'Org plant');
	const effectiveTempF = $derived(snapshot?.airTempF ?? null);
	const conditions = $derived(snapshot?.conditions ?? '');
	const isRaining = $derived(snapshot?.isRaining ?? false);
	const lastFetchedAt = $derived(snapshot?.fetchedAt ?? null);

	const tempStatus = $derived.by(() => {
		const temp = effectiveTempF;
		const thickness = calcContext.lift_thickness.value;

		if (temp == null || thickness <= 0 || !hasPlantLocation) {
			return 'neutral';
		}

		const check = placementCheck(temp, thickness);
		if (!check) return 'neutral';

		if (check.status === 'pass') return 'good';
		if (check.status === 'warn') return 'warn';
		return 'bad';
	});

	const statusLabel = $derived.by(() => {
		if (!hasPlantLocation) return 'Plant weather';
		if (loading) return 'Loading plant weather';
		if (fetchError) return 'Plant weather unavailable';
		if (effectiveTempF == null) return 'Plant weather';
		if (tempStatus === 'good') return 'Plant temp OK';
		if (tempStatus === 'warn') return 'Plant temp close';
		if (tempStatus === 'bad') return 'Plant temp low';
		return 'Plant weather';
	});

	const conditionIcon = $derived.by(() => {
		const cond = conditions.toLowerCase();
		if (cond.includes('rain')) return CloudRain;
		if (cond.includes('snow')) return CloudSnow;
		if (cond.includes('fog')) return CloudFog;
		if (cond.includes('cloud')) return Cloud;
		return CloudSun;
	});

	const lastUpdatedText = $derived.by(() => {
		if (!lastFetchedAt) return null;
		const minutes = Math.floor((Date.now() - lastFetchedAt) / 60000);
		if (minutes < 1) return 'Updated just now';
		if (minutes === 1) return 'Updated 1 min ago';
		if (minutes < 60) return `Updated ${minutes} min ago`;
		const hours = Math.floor(minutes / 60);
		if (hours === 1) return 'Updated 1 hour ago';
		return `Updated ${hours} hours ago`;
	});

	async function loadPlantWeather(lat: number, lng: number, key: string) {
		loading = true;
		fetchError = false;
		try {
			const next = await fetchWeather(lat, lng);
			if (fetchKey === key) {
				snapshot = next;
			}
		} catch {
			if (fetchKey === key) {
				fetchError = true;
				snapshot = null;
			}
		} finally {
			if (fetchKey === key) {
				loading = false;
			}
		}
	}

	$effect(() => {
		const lat = plantLat;
		const lng = plantLng;
		if (lat == null || lng == null) {
			fetchKey = null;
			snapshot = null;
			fetchError = false;
			loading = false;
			return;
		}

		const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
		if (key === fetchKey) return;
		fetchKey = key;
		snapshot = null;
		void loadPlantWeather(lat, lng, key);
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
	{#if !hasPlantLocation}
		<div class="weather-bar__icon" aria-hidden="true">
			<CloudSun size={18} />
		</div>
		<div class="weather-bar__body">
			<span class="weather-bar__label">Plant weather</span>
			<span class="weather-bar__meta">Set plant location</span>
		</div>
	{:else}
		{@const ConditionIcon = conditionIcon}
		<div class="weather-bar__icon" aria-hidden="true">
			<ConditionIcon size={18} />
		</div>
		<div class="weather-bar__body">
			<div class="weather-bar__topline">
				<span class="weather-bar__temp">
					{effectiveTempF != null ? `${Math.round(effectiveTempF)}°F` : '--°F'}
				</span>
				<span class="weather-bar__label">{statusLabel}</span>
			</div>
			<div class="weather-bar__details">
				<span class="weather-bar__conditions">{conditions || (fetchError ? 'Unavailable' : 'Loading')}</span>
				<span class="weather-bar__dot"></span>
				<span class="weather-bar__location">
					<MapPin size={12} aria-hidden="true" />
					{locationLabel}
				</span>
			</div>
			{#if lastUpdatedText}
				<span class="weather-bar__updated">{lastUpdatedText}</span>
			{/if}
		</div>
		{#if isRaining}
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
		flex-shrink: 0;
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

	@media (max-height: 760px) and (min-width: 900px) {
		.weather-bar {
			align-items: center;
			margin: 6px 8px 0;
			padding: 8px;
		}

		.weather-bar__details,
		.weather-bar__updated {
			display: none;
		}
	}

	@media (max-height: 640px) and (min-width: 900px) {
		.weather-bar {
			justify-content: center;
			padding: 8px 0;
			border-left-width: 1px;
		}

		.weather-bar__body,
		.weather-bar__rain {
			display: none;
		}
	}

	@media (max-height: 560px) and (min-width: 900px) {
		.weather-bar {
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
