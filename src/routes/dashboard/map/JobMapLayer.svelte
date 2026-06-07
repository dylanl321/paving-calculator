<script lang="ts">
	/**
	 * JobMapLayer — draws one job site's persisted geometry inside a <MapView>.
	 *
	 * Renders (roads-only, never fabricated):
	 *   - road-section LineStrings (stored GeoJSON [lng,lat])
	 *   - the saved route centerline (waypoints) when a job has no section geometry
	 *   - a pin at the job's lat/lng
	 *   - roadway-log markers (focused job only) via RoadwayLogLayer
	 *
	 * The focused job is drawn in the brand yellow accent; overlay jobs use a
	 * muted neutral color so the selected job stays prominent.
	 */
	import { MapMarker, MapPolyline, RoadwayLogLayer } from '$lib/components/map-v2';
	import type { RoadwayLogEventMarker } from '$lib/components/map-v2/RoadwayLogLayer.svelte';

	interface RouteWaypoint {
		lat: number;
		lng: number;
	}

	interface RoadSection {
		id: string;
		name: string;
		status: string;
		geometry: object | null;
		segment_group: string | null;
		treatment: string | null;
	}

	interface MapJobSite {
		id: string;
		name: string;
		status: string;
		latitude: number | null;
		longitude: number | null;
		location_description: string | null;
		route_designation: string | null;
		crew_name: string | null;
		waypoints: RouteWaypoint[];
		sections: RoadSection[];
		roadway_log_events: RoadwayLogEventMarker[];
	}

	let {
		site,
		focused = false,
		onSelect
	}: {
		site: MapJobSite;
		focused?: boolean;
		onSelect?: (id: string) => void;
	} = $props();

	const ACCENT = '#f2c037';
	const NEUTRAL = '#94a3b8';

	const lineColor = $derived(focused ? ACCENT : NEUTRAL);
	const lineWidth = $derived(focused ? 5 : 3);
	const lineOpacity = $derived(focused ? 0.95 : 0.6);

	/** Pull every LineString coordinate run out of an arbitrary section geometry. */
	function lineStringsFrom(geometry: object | null): [number, number][][] {
		if (!geometry || typeof geometry !== 'object') return [];
		const geo = geometry as {
			type?: string;
			coordinates?: unknown;
			geometry?: { type?: string; coordinates?: unknown };
		};
		// Some sections may store a Feature wrapper.
		const g = geo.type === 'Feature' && geo.geometry ? geo.geometry : geo;
		const out: [number, number][][] = [];

		const asLatLng = (coords: unknown): [number, number][] => {
			if (!Array.isArray(coords)) return [];
			return coords
				.filter(
					(c): c is [number, number] =>
						Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number'
				)
				.map(([lng, lat]) => [lat, lng] as [number, number]);
		};

		if (g.type === 'LineString') {
			const line = asLatLng(g.coordinates);
			if (line.length >= 2) out.push(line);
		} else if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
			for (const part of g.coordinates as unknown[]) {
				const line = asLatLng(part);
				if (line.length >= 2) out.push(line);
			}
		}
		return out;
	}

	const sectionLines = $derived.by(() => {
		const lines: { id: string; coords: [number, number][] }[] = [];
		for (const sec of site.sections) {
			const runs = lineStringsFrom(sec.geometry);
			runs.forEach((coords, i) => {
				lines.push({ id: `${site.id}-${sec.id}-${i}`, coords });
			});
		}
		return lines;
	});

	// Fall back to the saved route centerline when no section geometry exists.
	const routeLine = $derived.by<[number, number][]>(() =>
		site.waypoints.length >= 2 ? site.waypoints.map((w) => [w.lat, w.lng]) : []
	);

	const showRouteLine = $derived(sectionLines.length === 0 && routeLine.length >= 2);

	const pin = $derived.by<[number, number] | null>(() => {
		if (site.latitude != null && site.longitude != null) return [site.latitude, site.longitude];
		if (routeLine.length > 0) return routeLine[Math.floor(routeLine.length / 2)];
		if (sectionLines.length > 0) {
			const c = sectionLines[0].coords;
			return c[Math.floor(c.length / 2)];
		}
		return null;
	});

	function escapeHtml(s: string): string {
		return s.replace(
			/[&<>"']/g,
			(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
		);
	}

	function popupHtml(): string {
		const statusColor = focused ? ACCENT : NEUTRAL;
		const route = site.route_designation
			? `<div style="font-size:0.8rem;color:#94a3b8;margin-top:2px">${escapeHtml(site.route_designation)}</div>`
			: '';
		const loc = site.location_description
			? `<div style="font-size:0.8rem;color:#94a3b8;margin-top:2px">${escapeHtml(site.location_description)}</div>`
			: '';
		return `<div style="min-width:170px;font-family:system-ui,sans-serif;line-height:1.4">
			<strong style="font-size:0.95rem">${escapeHtml(site.name)}</strong>
			<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:${statusColor};color:#000;font-size:0.66rem;font-weight:700;text-transform:uppercase">${escapeHtml(site.status)}</span>
			${route}${loc}
			<a href="/dashboard/job-sites/${site.id}" style="display:inline-block;margin-top:8px;font-size:0.82rem;color:${ACCENT};text-decoration:underline">Open project &rarr;</a>
		</div>`;
	}
</script>

{#each sectionLines as line (line.id)}
	<MapPolyline
		id={line.id}
		coordinates={line.coords}
		color={lineColor}
		width={lineWidth}
		opacity={lineOpacity}
		onclick={() => onSelect?.(site.id)}
	/>
{/each}

{#if showRouteLine}
	<MapPolyline
		id={`route-${site.id}`}
		coordinates={routeLine}
		color={lineColor}
		width={lineWidth}
		opacity={lineOpacity}
		dashArray={focused ? undefined : [2, 2]}
		onclick={() => onSelect?.(site.id)}
	/>
{/if}

{#if pin}
	<MapMarker
		lat={pin[0]}
		lng={pin[1]}
		color={lineColor}
		label={site.name.charAt(0).toUpperCase()}
		popupHtml={popupHtml()}
		onclick={() => onSelect?.(site.id)}
	/>
{/if}

{#if focused && site.waypoints.length >= 2 && site.roadway_log_events.length > 0}
	<RoadwayLogLayer waypoints={site.waypoints} events={site.roadway_log_events} />
{/if}
