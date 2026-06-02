<script lang="ts">
	import { MapContainer, MapMarker } from '$lib/components/map';

	interface SitePin {
		id: string;
		name: string;
		status: 'active' | 'completed' | 'archived';
		latitude: number | null;
		longitude: number | null;
		location_description?: string | null;
	}

	interface Props {
		sites: SitePin[];
		height?: string;
	}

	let { sites, height = '320px' }: Props = $props();

	const STATUS_COLORS: Record<string, string> = {
		active: '#22c55e',
		completed: '#94a3b8',
		archived: '#475569'
	};

	const pinned = $derived(sites.filter((s) => s.latitude != null && s.longitude != null));

	const center = $derived<[number, number] | undefined>(
		pinned.length === 1 ? [pinned[0].latitude as number, pinned[0].longitude as number] : undefined
	);

	const bounds = $derived.by<[[number, number], [number, number]] | undefined>(() => {
		if (pinned.length < 2) return undefined;
		const lats = pinned.map((s) => s.latitude as number);
		const lngs = pinned.map((s) => s.longitude as number);
		return [
			[Math.min(...lats), Math.min(...lngs)],
			[Math.max(...lats), Math.max(...lngs)]
		];
	});

	function popupFor(site: SitePin, color: string): string {
		const statusLabel = site.status.charAt(0).toUpperCase() + site.status.slice(1);
		return `<div style="min-width:160px;font-family:system-ui,sans-serif">
				<strong style="font-size:0.95rem">${site.name}</strong><br>
				<span style="display:inline-block;margin:4px 0;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:0.7rem;font-weight:700;text-transform:uppercase">${statusLabel}</span>
				${site.location_description ? `<br><span style="font-size:0.8rem;color:#666">${site.location_description}</span>` : ''}
				<br><a href="/dashboard/job-sites/${site.id}" style="display:inline-block;margin-top:8px;font-size:0.82rem;color:#2563eb;text-decoration:underline">Open job site</a>
			</div>`;
	}
</script>

{#if pinned.length === 0}
	<div class="empty-map">
		<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
			<circle cx="12" cy="10" r="3"></circle>
		</svg>
		<p>No coordinates set — edit job sites to add a location.</p>
	</div>
{:else}
	<div class="map-wrap" style="height:{height}">
		<MapContainer
			class="job-site-map"
			{height}
			center={center}
			zoom={13}
			bounds={bounds}
			boundsPadding={32}
		>
			{#each pinned as site (site.id)}
				{@const color = STATUS_COLORS[site.status] ?? STATUS_COLORS.active}
				<MapMarker
					lat={site.latitude as number}
					lng={site.longitude as number}
					title={site.name}
					{color}
					popupHtml={popupFor(site, color)}
					popupMinWidth={160}
				/>
			{/each}
		</MapContainer>
	</div>
{/if}

<style>
	.map-wrap {
		width: 100%;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.map-wrap :global(.job-site-map) {
		height: 100%;
		border-radius: 0;
	}

	.empty-map {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 40px 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		text-align: center;
	}

	.empty-map svg {
		opacity: 0.4;
	}

	.empty-map p {
		margin: 0;
		font-size: 0.875rem;
	}
</style>
