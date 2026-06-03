<script lang="ts">
	import { detectStation, formatStation, type RouteWaypoint } from '$lib/services/gpsStation';

	interface Props {
		/** Route waypoints - required for station detection. If empty the button is hidden. */
		waypoints: RouteWaypoint[];
		/** Called when a station is detected. Parent binds station_start / station_end via this. */
		onDetected?: (station: number) => void;
		/** Optional label override */
		label?: string;
		/** Compact icon-only mode for use inline with an input */
		compact?: boolean;
	}

	let {
		waypoints = [],
		onDetected,
		label = 'GPS Station',
		compact = false
	}: Props = $props();

	type DetectState = 'idle' | 'acquiring' | 'done' | 'error';

	let detectState = $state<DetectState>('idle');
	let detectedStation = $state<number | null>(null);
	let errorMsg = $state<string>('');

	const hasRoute = $derived(waypoints.length >= 2);

	async function detect() {
		if (!hasRoute) return;
		if (!('geolocation' in navigator)) {
			detectState = 'error';
			errorMsg = 'GPS not available on this device';
			return;
		}

		detectState = 'acquiring';
		detectedStation = null;
		errorMsg = '';

		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const result = detectStation(pos.coords.latitude, pos.coords.longitude, waypoints);
				if (!result) {
					detectState = 'error';
					errorMsg = 'Could not detect station';
					return;
				}
				detectedStation = parseFloat(result.station.toFixed(2));
				detectState = 'done';
				onDetected?.(detectedStation);
			},
			(err) => {
				detectState = 'error';
				if (err.code === 1) {
					errorMsg = 'Location permission denied';
				} else if (err.code === 2) {
					errorMsg = 'Location unavailable';
				} else {
					errorMsg = 'GPS timeout - try again';
				}
			},
			{
				enableHighAccuracy: true,
				maximumAge: 10_000,
				timeout: 12_000
			}
		);
	}

	function reset() {
		detectState = 'idle';
		detectedStation = null;
		errorMsg = '';
	}
</script>

{#if hasRoute}
	{#if compact}
		<button
			type="button"
			class="gps-btn-compact"
			class:acquiring={detectState === 'acquiring'}
			class:done={detectState === 'done'}
			class:error={detectState === 'error'}
			onclick={detectState === 'done' || detectState === 'error' ? reset : detect}
			disabled={detectState === 'acquiring'}
			title={detectState === 'done' && detectedStation != null
				? 'Detected: Sta ' + formatStation(detectedStation) + ' - tap to reset'
				: detectState === 'error'
					? errorMsg + ' - tap to retry'
					: 'Auto-detect station from GPS'}
			aria-label={detectState === 'acquiring' ? 'Detecting GPS position...' : label}
		>
			{#if detectState === 'acquiring'}
				<svg
					class="spin"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12a9 9 0 11-6.219-8.56" />
				</svg>
			{:else if detectState === 'done'}
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<polyline points="20 6 9 17 4 12" />
				</svg>
			{:else if detectState === 'error'}
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path
						d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
					/>
					<line x1="12" y1="9" x2="12" y2="13" />
					<line x1="12" y1="17" x2="12.01" y2="17" />
				</svg>
			{:else}
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="3" />
					<line x1="12" y1="2" x2="12" y2="6" />
					<line x1="12" y1="18" x2="12" y2="22" />
					<line x1="2" y1="12" x2="6" y2="12" />
					<line x1="18" y1="12" x2="22" y2="12" />
				</svg>
			{/if}
		</button>
	{:else}
		<div class="gps-station-widget">
			<button
				type="button"
				class="gps-btn"
				class:acquiring={detectState === 'acquiring'}
				class:done={detectState === 'done'}
				class:error={detectState === 'error'}
				onclick={detectState === 'done' || detectState === 'error' ? reset : detect}
				disabled={detectState === 'acquiring'}
				aria-label={detectState === 'acquiring' ? 'Detecting GPS position...' : label}
			>
				{#if detectState === 'acquiring'}
					<svg
						class="spin"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M21 12a9 9 0 11-6.219-8.56" />
					</svg>
					<span>Detecting...</span>
				{:else if detectState === 'done' && detectedStation != null}
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<polyline points="20 6 9 17 4 12" />
					</svg>
					<span>Sta {formatStation(detectedStation)} - tap to reset</span>
				{:else if detectState === 'error'}
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path
							d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
						/>
						<line x1="12" y1="9" x2="12" y2="13" />
						<line x1="12" y1="17" x2="12.01" y2="17" />
					</svg>
					<span>{errorMsg} - tap to retry</span>
				{:else}
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="3" />
						<line x1="12" y1="2" x2="12" y2="6" />
						<line x1="12" y1="18" x2="12" y2="22" />
						<line x1="2" y1="12" x2="6" y2="12" />
						<line x1="18" y1="12" x2="22" y2="12" />
					</svg>
					<span>{label}</span>
				{/if}
			</button>
		</div>
	{/if}
{/if}

<style>
	.gps-station-widget {
		width: 100%;
	}

	.gps-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 48px;
		padding: 10px 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
		text-align: left;
	}

	.gps-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}

	.gps-btn:disabled {
		cursor: default;
		opacity: 0.7;
	}

	.gps-btn.acquiring {
		border-color: var(--accent);
		color: var(--accent);
	}

	.gps-btn.done {
		border-color: var(--good);
		color: var(--good);
		background: color-mix(in srgb, var(--good) 8%, transparent);
	}

	.gps-btn.error {
		border-color: var(--warn);
		color: var(--warn);
	}

	/* Compact icon-only variant */
	.gps-btn-compact {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
		width: 48px;
		height: 48px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
		flex-shrink: 0;
	}

	.gps-btn-compact:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}

	.gps-btn-compact:disabled {
		cursor: default;
		opacity: 0.7;
	}

	.gps-btn-compact.acquiring {
		border-color: var(--accent);
		color: var(--accent);
	}

	.gps-btn-compact.done {
		border-color: var(--good);
		color: var(--good);
		background: color-mix(in srgb, var(--good) 8%, transparent);
	}

	.gps-btn-compact.error {
		border-color: var(--warn);
		color: var(--warn);
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.spin {
		animation: spin 1s linear infinite;
	}
</style>
