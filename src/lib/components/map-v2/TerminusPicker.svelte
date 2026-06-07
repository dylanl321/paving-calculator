<script lang="ts">
	/**
	 * TerminusPicker — set a project's BEGIN and END termini by clicking the
	 * actual road. Every click/marker is snapped to the route centerline via the
	 * shared projection (coordinateToStation/stationToCoordinate), so points can
	 * only ever land ON the road — no free/off-road pins. Roads-only by design.
	 *
	 * Built on map-v2 MapView (MapLibre). Mirrors MapStationPicker's UX but is
	 * framed around named termini (Begin/End) and emits both the station offset
	 * and the snapped [lat, lng] coordinate.
	 */
	import { MapView } from '$lib/components/map-v2';
	import { TerminusEditController, type TerminusEditApi } from '$lib/components/map-v2/editors';
	import { formatStation } from '$lib/services/gpsStation';
	import type { ParsedTerminus } from '$lib/server/terminus-parser.js';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface Props {
		/** Route centerline the termini snap to ([lat,lng] objects). */
		waypoints?: Waypoint[];
		/** Begin terminus as a station offset along the route (ft / 100). */
		beginStation?: number | null;
		/** End terminus as a station offset along the route. */
		endStation?: number | null;
		/** Parsed terminus text shown as a hint (e.g. "THE FLORIDA STATE LINE"). */
		beginLabel?: string | null;
		endLabel?: string | null;
		/** Parsed terminus structures for better display. */
		beginParsed?: ParsedTerminus | null;
		endParsed?: ParsedTerminus | null;
		height?: string;
		/** Fired when a terminus is set: station + snapped [lat,lng]. */
		onPick?: (field: 'begin' | 'end', station: number, coord: [number, number]) => void;
	}

	let {
		waypoints = [],
		beginStation = $bindable(null),
		endStation = $bindable(null),
		beginLabel = null,
		endLabel = null,
		beginParsed = null,
		endParsed = null,
		height = '320px',
		onPick
	}: Props = $props();

	type ActiveField = 'begin' | 'end' | null;
	let terminusApi = $state<TerminusEditApi | null>(null);

	const activeField = $derived<ActiveField>(terminusApi?.activeField ?? 'begin');
	const flashMessage = $derived(terminusApi?.flashMessage ?? '');

	const hasRoute = $derived(waypoints.length >= 2);

	const mapBounds = $derived.by(() => {
		if (waypoints.length === 0) return undefined;
		const lats = waypoints.map((w) => w.lat);
		const lngs = waypoints.map((w) => w.lng);
		return [
			[Math.min(...lats), Math.min(...lngs)],
			[Math.max(...lats), Math.max(...lngs)]
		] as [[number, number], [number, number]];
	});

	const summaryText = $derived.by(() => {
		if (beginStation == null || endStation == null) return '';
		const distFt = Math.abs(endStation - beginStation) * 100;
		return `Start ${formatStation(beginStation)}  \u2192  End ${formatStation(endStation)}  (${distFt.toFixed(0)} ft)`;
	});

	const overlayText = $derived.by(() => {
		if (flashMessage) return flashMessage;
		if (activeField === 'begin') return 'Tap the road to set the project START';
		if (activeField === 'end') return 'Tap the road to set the project END';
		return 'Choose Start or End, then tap the road';
	});

	function toggleField(field: 'begin' | 'end') {
		terminusApi?.setActiveField(activeField === field ? null : field);
	}

	function clearTermini() {
		terminusApi?.clear();
	}

	function useFullRoute() {
		terminusApi?.useFullRoute();
	}

</script>

{#if !hasRoute}
	<div class="no-route-placeholder">
		<span class="no-route-icon" aria-hidden="true">🛣</span>
		<p>No road line yet — load a route or draw the road alignment first.</p>
	</div>
{:else}
	<div class="terminus-picker">
		<div class="plain-help">
			<strong>Project Start &amp; End</strong>
			<span>These are the limits you are paving along the saved road line. They snap onto the road.</span>
		</div>

		<div class="toggle-row">
			<button
				type="button"
				class="toggle-btn {activeField === 'begin' ? 'toggle-btn--active' : ''}"
				onclick={() => toggleField('begin')}
			>
				<span class="toggle-dot toggle-dot--begin"></span>
				Set Start
				{#if beginStation != null}
					<span class="toggle-value">{formatStation(beginStation)}</span>
				{/if}
			</button>

			<button
				type="button"
				class="toggle-btn {activeField === 'end' ? 'toggle-btn--active' : ''}"
				onclick={() => toggleField('end')}
			>
				<span class="toggle-dot toggle-dot--end"></span>
				Set End
				{#if endStation != null}
					<span class="toggle-value">{formatStation(endStation)}</span>
				{/if}
			</button>

			{#if beginStation != null || endStation != null}
				<button type="button" class="clear-btn" onclick={clearTermini}>
					Clear
				</button>
			{/if}

			<button type="button" class="clear-btn clear-btn--accent" onclick={useFullRoute}>
				Use Full Route
			</button>
		</div>

		{#if beginLabel || endLabel || beginParsed || endParsed}
			<div class="terminus-hint">
				{#if beginLabel}
					<span><strong>Start:</strong> {beginLabel}</span>
					{#if beginParsed && beginParsed.type === 'intersection'}
						<span class="parsed-hint">Parsed as {beginParsed.summary}</span>
					{:else if beginParsed && beginParsed.type === 'milepost'}
						<span class="parsed-hint">Parsed as {beginParsed.summary}</span>
					{:else if beginParsed && beginParsed.type === 'landmark'}
						<span class="parsed-hint">Parsed as {beginParsed.summary}</span>
					{/if}
				{/if}
				{#if endLabel}
					<span><strong>End:</strong> {endLabel}</span>
					{#if endParsed && endParsed.type === 'intersection'}
						<span class="parsed-hint">Parsed as {endParsed.summary}</span>
					{:else if endParsed && endParsed.type === 'milepost'}
						<span class="parsed-hint">Parsed as {endParsed.summary}</span>
					{:else if endParsed && endParsed.type === 'landmark'}
						<span class="parsed-hint">Parsed as {endParsed.summary}</span>
					{/if}
				{/if}
			</div>
		{/if}

		<div class="map-wrap" style="height: {height}">
			<MapView bounds={mapBounds} {height}>
				{#snippet layers()}
					<TerminusEditController
						{waypoints}
						bind:beginStation
						bind:endStation
						beginColor="#f2c037"
						endColor="#3b82f6"
						active={true}
						{onPick}
						bind:api={terminusApi}
					/>
				{/snippet}
			</MapView>

			<div class="map-overlay-pill {flashMessage ? 'map-overlay-pill--flash' : ''}">
				{overlayText}
			</div>
		</div>

		{#if summaryText}
			<div class="terminus-summary">{summaryText}</div>
		{/if}
	</div>
{/if}

<style>
	.no-route-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 32px 16px;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		text-align: center;
	}

	.no-route-icon {
		font-size: 2rem;
	}

	.no-route-placeholder p {
		margin: 0;
		font-size: 0.9rem;
		max-width: 320px;
	}

	.terminus-picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.plain-help {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
		border-radius: var(--radius);
	}

	.plain-help strong {
		color: var(--text);
		font-size: 0.9rem;
	}

	.plain-help span {
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1.35;
	}

	.toggle-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.toggle-btn {
		flex: 1;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 0 12px;
		background: var(--surface);
		border: 2px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s, background 0.15s;
	}

	.toggle-btn--active {
		border-color: var(--accent);
		color: var(--text);
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
	}

	.toggle-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.toggle-dot--begin {
		background: #f2c037;
	}

	.toggle-dot--end {
		background: #3b82f6;
	}

	.toggle-value {
		font-size: 0.75rem;
		color: var(--accent);
		font-weight: 700;
		margin-left: 2px;
	}

	.clear-btn {
		min-height: 48px;
		padding: 0 14px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}

	.clear-btn:hover {
		color: var(--text);
		border-color: var(--text-muted);
	}

	.clear-btn--accent {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
	}

	.clear-btn--accent:hover {
		color: var(--accent-text);
		background: var(--accent);
		border-color: var(--accent);
	}

	.terminus-hint {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.terminus-hint > span {
		display: block;
	}

	.parsed-hint {
		font-size: 0.75rem;
		color: #14b8a6;
		margin-left: 8px;
		font-weight: 500;
	}

	.map-wrap {
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
	}

	.map-overlay-pill {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		pointer-events: none;
		background: rgba(0, 0, 0, 0.72);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 5px 14px;
		border-radius: 20px;
		white-space: nowrap;
		letter-spacing: 0.3px;
		transition: opacity 0.2s;
	}

	.map-overlay-pill--flash {
		background: rgba(239, 68, 68, 0.9);
	}

	.terminus-summary {
		text-align: center;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--accent);
		padding: 6px 8px;
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		border-radius: var(--radius);
	}
</style>
