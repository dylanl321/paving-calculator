<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { MapPin } from 'lucide-svelte';
	import LoadTracker from '$lib/components/LoadTracker.svelte';
	import TruckQueue from '$lib/components/TruckQueue.svelte';
	import SpreadRateHistogram from '$lib/components/SpreadRateHistogram.svelte';
	import WasteYieldAnalysis from '$lib/components/WasteYieldAnalysis.svelte';
	import ETACalculator from '$lib/components/ETACalculator.svelte';
	import JobSiteLocationPicker from '$lib/components/JobSiteLocationPicker.svelte';
	import SchematicViewer from '$lib/components/SchematicViewer.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { spreadToleranceFor } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { fmt, fmtDollars, type ConfigForm } from './shared';
	import type { PageData } from '../$types';
	import { browser } from '$app/environment';
	import { haversineFeet } from '$lib/services/mapUtils';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Photo {
		id: string;
		filename: string;
		caption?: string | null;
		taken_at: number;
		lat?: number | null;
		lng?: number | null;
	}
	interface PhotosResponse {
		photos?: Photo[];
	}

	let {
		data,
		configForm,
		totalAreaSqYd,
		estTonnage,
		estCostByTon,
		estCostBySY,
		estCostByMile,
		costSummary,
		configComplete,
		milestonePct,
		equipmentCount,
		roadTypeLabel,
		scopeLabel,
		tackLabel,
		onGoToTab
	}: {
		data: PageData;
		configForm: ConfigForm;
		totalAreaSqYd: number | null;
		estTonnage: number | null;
		estCostByTon: number | null;
		estCostBySY: number | null;
		estCostByMile: number | null;
		costSummary: { value: number; method: string } | null;
		configComplete: boolean;
		milestonePct: number | null;
		equipmentCount: number;
		roadTypeLabel: string | null;
		scopeLabel: string | null;
		tackLabel: string | null;
		onGoToTab: (tab: string) => void;
	} = $props();

	let showLocationSearch = $state(false);
	let locationSaving = $state(false);
	let pickerLat = $state<number | null>(data.jobSite.latitude ?? null);
	let pickerLng = $state<number | null>(data.jobSite.longitude ?? null);

	const REQUIRED_CONFIG_FIELDS = [
		'road_type',
		'num_lanes',
		'lane_width_ft',
		'total_length_ft',
		'scope_of_work',
		'mix_type',
		'target_thickness_in',
		'target_spread_rate'
	];
	const REQUIRED_SITE_FIELDS = ['name', 'status'];
	const OPTIONAL_CONFIG_FIELDS = ['tack_type', 'target_tack_rate', 'num_lifts', 'total_tonnage'];
	const OPTIONAL_SITE_FIELDS = ['est_start_date', 'completion_date', 'customer_name', 'project_manager', 'latitude', 'longitude'];

	const FIELD_LABELS: Record<string, string> = {
		road_type: 'Road Type',
		num_lanes: 'Number of Lanes',
		lane_width_ft: 'Lane Width',
		total_length_ft: 'Total Length',
		scope_of_work: 'Scope of Work',
		mix_type: 'Mix Type',
		target_thickness_in: 'Target Thickness',
		target_spread_rate: 'Target Spread Rate',
		name: 'Job Name',
		status: 'Status'
	};

	function isEmpty(value: any): boolean {
		return value === null || value === undefined || value === '' || value === 0;
	}

	const completeness = $derived.by(() => {
		const missingRequired: string[] = [];
		let filledRequired = 0;
		const totalRequired = REQUIRED_CONFIG_FIELDS.length + REQUIRED_SITE_FIELDS.length;

		for (const field of REQUIRED_CONFIG_FIELDS) {
			if (isEmpty((configForm as any)[field])) {
				missingRequired.push(field);
			} else {
				filledRequired++;
			}
		}

		for (const field of REQUIRED_SITE_FIELDS) {
			if (isEmpty((data.jobSite as any)[field])) {
				missingRequired.push(field);
			} else {
				filledRequired++;
			}
		}

		const score = Math.round((filledRequired / totalRequired) * 100);
		const status = score >= 90 ? 'complete' : score >= 60 ? 'needs-attention' : 'incomplete';
		const color = status === 'complete' ? 'var(--good, #22c55e)' : status === 'needs-attention' ? '#f59e0b' : '#ef4444';

		return { score, status, color, missingRequired, filledRequired, totalRequired };
	});

	interface OverviewSection {
		id: string;
		name: string;
		lane?: string | null;
		station_start?: number | null;
		station_end?: number | null;
		status: 'active' | 'completed' | 'skipped';
		paving_status?: string | null;
		geometry_geojson: string | null;
		crew_name?: string | null;
		notes?: string | null;
	}

	let sections = $state<OverviewSection[]>([]);
	let sectionsLoading = $state(true);
	let selectedSection = $state<OverviewSection | null>(null);

	type PavingStatus = 'planned' | 'scheduled_today' | 'in_progress' | 'completed' | 'behind_schedule' | 'skipped';

	function dbStatus(s: string | undefined | null): PavingStatus {
		switch (s) {
			case 'completed': return 'completed';
			case 'active':    return 'in_progress';
			case 'skipped':   return 'skipped';
			default:          return 'planned';
		}
	}

	const STATUS_COLORS_MAP: Record<PavingStatus, string> = {
		planned:         '#94a3b8',
		scheduled_today: '#f2c037',
		in_progress:     '#f59e0b',
		completed:       '#22c55e',
		behind_schedule: '#ef4444',
		skipped:         '#475569',
	};

	const STATUS_LABELS: Record<PavingStatus, string> = {
		planned:         'Planned',
		scheduled_today: 'Today',
		in_progress:     'In Progress',
		completed:       'Completed',
		behind_schedule: 'Behind',
		skipped:         'Skipped',
	};

	function statusColor(s: PavingStatus): string {
		return STATUS_COLORS_MAP[s] ?? '#94a3b8';
	}

	function statusLabel(s: PavingStatus): string {
		return STATUS_LABELS[s] ?? s;
	}

	$effect(() => {
		if (!browser) return;
		sectionsLoading = true;
		fetch(`/api/job-sites/${data.jobSite.id}/sections`)
			.then((res) => (res.ok ? res.json() : { sections: [] }))
			.then((d) => {
				sections = (d as { sections?: OverviewSection[] }).sections || [];
				sectionsLoading = false;
			})
			.catch(() => {
				sections = [];
				sectionsLoading = false;
			});
	});

	interface ProgressData {
		geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
		logEntries: Array<{
			station_start: number | null;
			station_end: number | null;
			tons_placed: number | null;
			log_date: string | null;
		}>;
		totalLengthFt: number | null;
		today: string;
	}

	let progressData = $state<ProgressData | null>(null);

	$effect(() => {
		if (!browser) return;
		fetch(`/api/job-sites/${data.jobSite.id}/progress`)
			.then((res) => (res.ok ? res.json() : null))
			.then((d) => {
				progressData = d as ProgressData | null;
			})
			.catch(() => {
				progressData = null;
			});
	});

	interface ContractInfo {
		job_number: string | null;
		project_number: string | null;
		contract_id: string | null;
		work_type: string | null;
		contract_type: string | null;
		contract_amount: number | null;
		retainage_pct: number | null;
		est_start_date: string | null;
		completion_date: string | null;
		customer_name: string | null;
		customer_address: string | null;
		customer_contact: string | null;
		customer_phone: string | null;
		customer_email: string | null;
		owner_name: string | null;
		owner_address: string | null;
		project_manager: string | null;
		asphalt_supplier: string | null;
	}

	interface BidItem {
		line_number: string | null;
		item_id: string | null;
		description: string;
		quantity: number | null;
		unit: string | null;
		unit_price: number | null;
		bid_amount: number | null;
		section: string | null;
		is_alternate: number;
		selected: number;
	}

	interface ProductionMix {
		mix_name: string;
		unit: string | null;
		bid_quantity: number | null;
		takeoff_tonnage: number | null;
		quantity_per_day: number | null;
		est_days: number | null;
	}

	interface BidItemsResponse {
		bid_items?: BidItem[];
		production_mixes?: ProductionMix[];
		scopes?: string[];
		contract?: ContractInfo;
	}

	let contractData = $state<ContractInfo | null>(null);
	let bidItems = $state<BidItem[]>([]);
	let productionMixes = $state<ProductionMix[]>([]);
	let scopes = $state<string[]>([]);
	let contractLoading = $state(true);

	interface Schematic {
		id: string;
		page_number: number | null;
		label: string | null;
	}
	let schematics = $state<Schematic[]>([]);

	$effect(() => {
		if (!browser) return;
		fetch(`/api/job-sites/${data.jobSite.id}/schematics`, { credentials: 'include' })
			.then((res) => (res.ok ? res.json() : { schematics: [] }))
			.then((d: { schematics?: Schematic[] }) => {
				schematics = d.schematics ?? [];
			})
			.catch(() => {
				schematics = [];
			});
	});

	interface SourceDocument {
		id: string;
		filename: string;
		doc_type: string | null;
		created_at: number;
	}
	let sourceDocuments = $state<SourceDocument[]>([]);

	$effect(() => {
		if (!browser) return;
		fetch(`/api/job-sites/${data.jobSite.id}/documents`, { credentials: 'include' })
			.then((res) => (res.ok ? res.json() : { documents: [] }))
			.then((d: { documents?: SourceDocument[] }) => {
				sourceDocuments = d.documents ?? [];
			})
			.catch(() => {
				sourceDocuments = [];
			});
	});

	function docTypeLabel(t: string | null): string {
		if (t === 'contract_summary') return 'Contract Summary';
		if (t === 'job_setup') return 'Job Setup';
		return 'Document';
	}

	$effect(() => {
		if (!browser) return;
		contractLoading = true;
		fetch(`/api/job-sites/${data.jobSite.id}/bid-items`, { credentials: 'include' })
			.then((res) => (res.ok ? res.json() : {}))
			.then((d: BidItemsResponse) => {
				contractData = d.contract ?? null;
				bidItems = d.bid_items ?? [];
				productionMixes = d.production_mixes ?? [];
				scopes = d.scopes ?? [];
				contractLoading = false;
			})
			.catch(() => {
				contractLoading = false;
			});
	});

	const hasContractData = $derived(
		contractData != null && Object.values(contractData).some((v) => v != null)
	);

	// Total paving length (feet) derived from the drawn route, falling back to
	// the configured total length.
	const routeLengthFt = $derived.by(() => {
		const wps = data.routeWaypoints;
		if (wps && wps.length >= 2) {
			let ft = 0;
			for (let i = 0; i < wps.length - 1; i++) {
				ft += haversineFeet(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng);
			}
			return ft;
		}
		return data.config?.total_length_ft ?? null;
	});

	function sectionLengthFt(section: OverviewSection): number {
		if (!section.geometry_geojson) return 0;
		try {
			const geom = JSON.parse(section.geometry_geojson);
			if (geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) return 0;
			const pts = geom.coordinates as number[][];
			let ft = 0;
			for (let i = 0; i < pts.length - 1; i++) {
				ft += haversineFeet(pts[i][1], pts[i][0], pts[i + 1][1], pts[i + 1][0]);
			}
			return ft;
		} catch {
			return 0;
		}
	}

	const completedLengthFt = $derived(
		sections.filter((s) => s.status === 'completed').reduce((sum, s) => sum + sectionLengthFt(s), 0)
	);

	const remainingLengthFt = $derived(
		routeLengthFt != null ? Math.max(0, routeLengthFt - completedLengthFt) : null
	);

	// Persist a begin/end terminus station (snapped to the route) via the config
	// endpoint. The TerminusPicker already constrains the value to the road.
	async function saveTerminus(field: 'begin' | 'end', station: number) {
		const patch =
			field === 'begin' ? { begin_station: station } : { end_station: station };
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
				credentials: 'include'
			});
			if (res.ok) {
				toastStore.success(`${field === 'begin' ? 'Begin' : 'End'} terminus saved`);
			} else {
				toastStore.error('Failed to save terminus');
			}
		} catch {
			toastStore.error('Failed to save terminus');
		}
	}

	// When a project has a parsed route designation but no stored centerline yet,
	// fetch the real GDOT route polyline and save it as the route so the terminus
	// picker has a road to snap to. Never fabricates geometry — only persists what
	// the GDOT service actually returns.
	let loadingRoute = $state(false);
	async function loadRouteCenterline() {
		const designation = configForm.route_designation;
		if (!designation || loadingRoute) return;
		loadingRoute = true;
		try {
			const q = encodeURIComponent(designation);
			const res = await fetch(`/api/gdot-routes?q=${q}&geometry=true`, { credentials: 'include' });
			if (!res.ok) {
				toastStore.error('Could not reach GDOT route service');
				return;
			}
			const body = (await res.json()) as {
				routes?: Array<{ geometry?: { coordinates?: [number, number][] } | null }>;
			};
			const coords = body.routes?.find((r) => r.geometry?.coordinates?.length)?.geometry
				?.coordinates;
			if (!coords || coords.length < 2) {
				toastStore.error(`No GDOT geometry found for ${designation}`);
				return;
			}
			// gdot-routes returns [lng,lat]; route waypoints are stored as {lat,lng}.
			const waypoints = coords.map(([lng, lat]) => ({ lat, lng }));
			const save = await fetch(`/api/job-sites/${data.jobSite.id}/route`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ waypoints }),
				credentials: 'include'
			});
			if (save.ok) {
				toastStore.success(`Loaded ${designation} centerline`);
				await invalidateAll();
			} else {
				toastStore.error('Failed to save route');
			}
		} catch {
			toastStore.error('Could not load route centerline');
		} finally {
			loadingRoute = false;
		}
	}

	function loadPlantLocation() {
		if (typeof localStorage === 'undefined') return { name: '', latitude: null, longitude: null };
		const key = `plant_${data.jobSite.id}`;
		const stored = localStorage.getItem(key);
		if (!stored) return { name: '', latitude: null, longitude: null };
		try {
			return JSON.parse(stored);
		} catch {
			return { name: '', latitude: null, longitude: null };
		}
	}

	let plantForm = $state({
		name: '',
		latitude: null as number | null,
		longitude: null as number | null
	});
	let plantSaved = $state(false);
	let plantLocation = $state(loadPlantLocation());

	function savePlantLocation() {
		if (typeof localStorage === 'undefined') return;
		const key = `plant_${data.jobSite.id}`;
		const location = {
			name: plantForm.name,
			latitude: plantForm.latitude,
			longitude: plantForm.longitude
		};
		localStorage.setItem(key, JSON.stringify(location));
		plantLocation = location;
		plantSaved = true;
		setTimeout(() => {
			plantSaved = false;
		}, 2000);
	}

	function clearPlantLocation() {
		if (typeof localStorage === 'undefined') return;
		const key = `plant_${data.jobSite.id}`;
		localStorage.removeItem(key);
		plantLocation = { name: '', latitude: null, longitude: null };
		plantForm = { name: '', latitude: null, longitude: null };
	}

	async function handleLocationChange(lat: number | null, lng: number | null) {
		locationSaving = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ latitude: lat, longitude: lng }),
				credentials: 'include'
			});
			if (res.ok) {
				toastStore.success('Location updated successfully');
				goto(`/dashboard/job-sites/${data.jobSite.id}`);
			} else {
				toastStore.error('Failed to update location');
			}
		} catch {
			toastStore.error('Failed to update location');
		} finally {
			locationSaving = false;
		}
	}

	async function clearCoordinates() {
		await handleLocationChange(null, null);
	}

	let photos = $state<any[]>([]);
	let photosLoading = $state(true);
	let selectedPhoto = $state<any | null>(null);
	let gdotLookupLoading = $state(false);

	async function loadPhotos() {
		photosLoading = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/photos`);
			if (!res.ok) return;
			const result = (await res.json()) as PhotosResponse;
			photos = result.photos ?? [];
			renderPhotoGrid();
		} catch {
			// ignore
		} finally {
			photosLoading = false;
		}
	}

	function renderPhotoGrid() {
		const grid = document.getElementById('photo-grid');
		if (!grid) return;

		if (photos.length === 0) {
			grid.innerHTML = '<div class="empty-state-mini"><p>No photos yet</p></div>';
			return;
		}

		const escapeHtml = (str: string) =>
				str
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;')
					.replace(/'/g, '&#039;');

		grid.innerHTML = photos
			.map(
				(photo) => `
			<div class="photo-thumb" data-photo-id="${escapeHtml(String(photo.id))}">
				<img src="/api/job-sites/${escapeHtml(String(data.jobSite.id))}/photos/${escapeHtml(String(photo.id))}/view" alt="${escapeHtml(photo.caption || photo.filename)}" />
				${photo.caption ? `<div class="photo-caption">${escapeHtml(photo.caption)}</div>` : ''}
			</div>
		`
			)
			.join('');

		grid.querySelectorAll('.photo-thumb').forEach((el) => {
			el.addEventListener('click', () => {
				const photoId = el.getAttribute('data-photo-id');
				const photo = photos.find((p) => p.id === photoId);
				if (photo) openLightbox(photo);
			});
		});
	}

	function openLightbox(photo: any) {
		selectedPhoto = photo;
	}

	function closeLightbox() {
		selectedPhoto = null;
	}

	async function lookupGdotBoundaries() {
		gdotLookupLoading = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/gdot-lookup`, {
				method: 'POST',
				credentials: 'include'
			});
			if (res.ok) {
				const result = (await res.json()) as { county?: string | null; district?: string | null };
				data.jobSite.gdot_county = result.county ?? null;
				data.jobSite.gdot_district = result.district ?? null;
				toastStore.success('GDOT information updated');
			} else {
				const errorData = (await res.json()) as { error?: string };
				toastStore.error(errorData.error || 'Failed to lookup GDOT information');
			}
		} catch (error) {
			toastStore.error('Failed to lookup GDOT information');
		} finally {
			gdotLookupLoading = false;
		}
	}
</script>

<section class="project-status-bar">
	<div class="psb-item">
		<span class="psb-label">Status</span>
		<span class="status-badge status-{data.jobSite.status.toLowerCase()}">{data.jobSite.status}</span>
	</div>
	<div class="psb-item">
		<span class="psb-label">Crew</span>
		<span class="psb-value">
			{data.assignments.length
				? `${data.assignments.length} assigned`
				: 'Unassigned'}
		</span>
	</div>
	<div class="psb-item">
		<span class="psb-label">Schedule</span>
		<span class="psb-value">
			{milestonePct != null ? `${milestonePct}% complete` : 'No milestones'}
		</span>
	</div>
	<div class="psb-item">
		<span class="psb-label">Planned Tonnage</span>
		<span class="psb-value">
			{configForm.total_tonnage
				? `${fmt(configForm.total_tonnage, 1)} t`
				: estTonnage
					? `${fmt(estTonnage, 1)} t`
					: '—'}
		</span>
	</div>
</section>

{#if completeness.score < 90}
	<section class="setup-progress-panel">
		<div class="panel-head">
			<h3>Setup Progress</h3>
		</div>
		<div class="setup-progress-content">
			<div class="progress-ring-wrapper">
				<svg class="progress-ring" width="80" height="80" viewBox="0 0 80 80">
					<circle class="progress-ring-bg" cx="40" cy="40" r="34" fill="none" stroke="var(--border)" stroke-width="8"></circle>
					<circle
						class="progress-ring-fill"
						cx="40"
						cy="40"
						r="34"
						fill="none"
						stroke={completeness.color}
						stroke-width="8"
						stroke-linecap="round"
						stroke-dasharray="213.6"
						stroke-dashoffset={213.6 * (1 - completeness.score / 100)}
						transform="rotate(-90 40 40)"
					></circle>
				</svg>
				<div class="progress-ring-label" style="color: {completeness.color}">
					{completeness.score}%
				</div>
			</div>
			<div class="setup-progress-info">
				<p class="setup-progress-summary">
					<strong>{completeness.filledRequired} of {completeness.totalRequired} required fields filled</strong>
				</p>
				{#if completeness.missingRequired.length > 0}
					<div class="missing-fields">
						<p class="missing-fields-title">Missing required fields:</p>
						<ul class="missing-fields-list">
							{#each completeness.missingRequired as field}
								<li>{FIELD_LABELS[field] || field}</li>
							{/each}
						</ul>
						<button class="btn-primary btn-sm" onclick={() => onGoToTab('configuration')}>
							Fill in Configuration
						</button>
					</div>
				{:else}
					<div class="setup-complete">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="20 6 9 17 4 12"></polyline>
						</svg>
						<span>Required fields complete</span>
					</div>
				{/if}
			</div>
		</div>
	</section>
{/if}

<div class="overview-grid">
	<section class="panel panel-span">
		<div class="panel-head">
			<h3>Paving Targets</h3>
			<button class="link-btn" onclick={() => onGoToTab('configuration')}>Edit</button>
		</div>
		<dl class="spec-list">
			<div class="spec-item">
				<dt>Mix Type</dt>
				<dd>{configForm.mix_type || '—'}</dd>
			</div>
			<div class="spec-item">
				<dt>Scope</dt>
				<dd>{scopeLabel || '—'}</dd>
			</div>
			<div class="spec-item">
				<dt>Target Thickness</dt>
				<dd>{configForm.target_thickness_in ? `${configForm.target_thickness_in} in` : '—'}</dd>
			</div>
			<div class="spec-item">
				<dt>Target Spread</dt>
				<dd>{configForm.target_spread_rate ? `${configForm.target_spread_rate} lbs/yd²` : '—'}</dd>
			</div>
			<div class="spec-item">
				<dt>Tack Coat</dt>
				<dd>{tackLabel || '—'}</dd>
			</div>
			<div class="spec-item">
				<dt>Target Tack</dt>
				<dd>{configForm.target_tack_rate ? `${configForm.target_tack_rate} gal/yd²` : '—'}</dd>
			</div>
		</dl>
	</section>

	<section class="panel">
		<div class="panel-head">
			<h3>Roadway</h3>
			<button class="link-btn" onclick={() => onGoToTab('configuration')}>Edit</button>
		</div>
		<dl class="spec-list">
				<div class="spec-item">
					<dt>Road Type</dt>
					<dd>{roadTypeLabel || '—'}</dd>
				</div>
				<div class="spec-item">
					<dt>Length</dt>
					<dd>{configForm.total_length_ft ? `${fmt(configForm.total_length_ft)} ft` : '—'}</dd>
				</div>
				<div class="spec-item">
					<dt>Lanes × Width</dt>
					<dd>
						{configForm.num_lanes ?? '—'} × {configForm.lane_width_ft ? `${configForm.lane_width_ft} ft` : '—'}
					</dd>
				</div>
				<div class="spec-item">
					<dt>Lifts</dt>
					<dd>{configForm.num_lifts ?? '—'}</dd>
				</div>
				<div class="spec-item">
					<dt>Total Tonnage</dt>
					<dd>{configForm.total_tonnage ? `${fmt(configForm.total_tonnage, 1)} t` : (estTonnage ? `${fmt(estTonnage, 1)} t (est.)` : '—')}</dd>
				</div>
			</dl>
			<div class="derived-caption">Calculated automatically from this project's configuration</div>
			<div class="derived-row">
				<div class="derived">
					<span class="derived-label">Total Area</span>
					<span class="derived-value">{totalAreaSqYd ? `${fmt(totalAreaSqYd)} yd²` : '—'}</span>
				</div>
				<div class="derived">
					<span class="derived-label">Est. Tonnage at Target</span>
					<span class="derived-value">{estTonnage ? `${fmt(estTonnage, 1)} t` : '—'}</span>
				</div>
			</div>
			{#if configForm.total_contract_value || estCostByTon || estCostBySY || estCostByMile}
				<div class="derived-row">
					{#if configForm.total_contract_value}
						<div class="derived">
							<span class="derived-label">Contract Value</span>
							<span class="derived-value">{fmtDollars(configForm.total_contract_value)}</span>
						</div>
					{/if}
					{#if estCostByTon}
						<div class="derived">
							<span class="derived-label">Est. Cost (by ton)</span>
							<span class="derived-value">{fmtDollars(estCostByTon)}</span>
						</div>
					{/if}
					{#if estCostBySY}
						<div class="derived">
							<span class="derived-label">Est. Cost (by area)</span>
							<span class="derived-value">{fmtDollars(estCostBySY)}</span>
						</div>
					{/if}
					{#if estCostByMile}
						<div class="derived">
							<span class="derived-label">Est. Cost (by mile)</span>
							<span class="derived-value">{fmtDollars(estCostByMile)}</span>
						</div>
					{/if}
				</div>
			{/if}
		</section>

		{#if configForm.cost_per_ton || configForm.cost_per_sy || configForm.cost_per_mile || configForm.total_contract_value}
			<section class="panel">
				<div class="panel-head">
					<h3>Cost Breakdown</h3>
					<button class="link-btn" onclick={() => onGoToTab('configuration')}>Edit</button>
				</div>
				<dl class="spec-list">
					{#if configForm.cost_per_ton}
						<div class="spec-item">
							<dt>Cost per Ton</dt>
							<dd>{fmtDollars(configForm.cost_per_ton)}/ton</dd>
						</div>
					{/if}
					{#if configForm.cost_per_sy}
						<div class="spec-item">
							<dt>Cost per SY</dt>
							<dd>{fmtDollars(configForm.cost_per_sy)}/yd²</dd>
						</div>
					{/if}
					{#if configForm.cost_per_mile}
						<div class="spec-item">
							<dt>Cost per Mile</dt>
							<dd>{fmtDollars(configForm.cost_per_mile)}/mi</dd>
						</div>
					{/if}
					{#if configForm.total_contract_value}
						<div class="spec-item">
							<dt>Contract</dt>
							<dd>{fmtDollars(configForm.total_contract_value)}</dd>
						</div>
					{/if}
				</dl>
				{#if costSummary}
					<div class="derived-row">
						<div class="derived">
							<span class="derived-label">{costSummary.method}</span>
							<span class="derived-value">{fmtDollars(costSummary.value)}</span>
						</div>
						{#if costSummary.value && (configForm.total_tonnage || estTonnage)}
							<div class="derived">
								<span class="derived-label">$/ton (derived)</span>
								<span class="derived-value">{fmtDollars(costSummary.value / (configForm.total_tonnage || estTonnage || 1))}/t</span>
							</div>
						{/if}
						{#if costSummary.value && totalAreaSqYd}
							<div class="derived">
								<span class="derived-label">$/SY (derived)</span>
								<span class="derived-value">{fmtDollars(costSummary.value / totalAreaSqYd)}/yd²</span>
							</div>
						{/if}
						{#if costSummary.value && configForm.total_length_ft}
							<div class="derived">
								<span class="derived-label">$/mile (derived)</span>
								<span class="derived-value">{fmtDollars(costSummary.value / (configForm.total_length_ft / 5280))}/mi</span>
							</div>
						{/if}
					</div>
				{/if}
			</section>
		{/if}
</div>

{#if !contractLoading && (hasContractData || productionMixes.length > 0 || bidItems.length > 0)}
<div class="contract-section">
	{#if hasContractData && contractData}
		<section class="panel panel-span">
			<div class="panel-head">
				<h3>Contract</h3>
			</div>
			<dl class="spec-list contract-grid">
				{#if contractData.project_number}
					<div class="spec-item"><dt>Project #</dt><dd>{contractData.project_number}</dd></div>
				{/if}
				{#if contractData.contract_id}
					<div class="spec-item"><dt>Contract ID</dt><dd>{contractData.contract_id}</dd></div>
				{/if}
				{#if contractData.job_number}
					<div class="spec-item"><dt>Job #</dt><dd>{contractData.job_number}</dd></div>
				{/if}
				{#if contractData.work_type}
					<div class="spec-item"><dt>Work Type</dt><dd>{contractData.work_type}</dd></div>
				{/if}
				{#if contractData.contract_type}
					<div class="spec-item"><dt>Contract Type</dt><dd>{contractData.contract_type}</dd></div>
				{/if}
				{#if contractData.contract_amount}
					<div class="spec-item"><dt>Contract Amount</dt><dd>{fmtDollars(contractData.contract_amount)}</dd></div>
				{/if}
				{#if contractData.est_start_date}
					<div class="spec-item"><dt>Start Date</dt><dd>{contractData.est_start_date}</dd></div>
				{/if}
				{#if contractData.completion_date}
					<div class="spec-item"><dt>Completion</dt><dd>{contractData.completion_date}</dd></div>
				{/if}
				{#if contractData.customer_name}
					<div class="spec-item"><dt>Customer</dt><dd>{contractData.customer_name}</dd></div>
				{/if}
				{#if contractData.customer_contact}
					<div class="spec-item"><dt>Contact</dt><dd>{contractData.customer_contact}</dd></div>
				{/if}
				{#if contractData.project_manager}
					<div class="spec-item"><dt>Project Manager</dt><dd>{contractData.project_manager}</dd></div>
				{/if}
				{#if contractData.asphalt_supplier}
					<div class="spec-item"><dt>Asphalt Supplier</dt><dd>{contractData.asphalt_supplier}</dd></div>
				{/if}
			</dl>
			{#if scopes.length > 0}
				<div class="scope-tags-row">
					{#each scopes as scope}
						<span class="scope-tag">{scope.replace(/_/g, ' ')}</span>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	{#if productionMixes.length > 0}
		<section class="panel panel-span">
			<div class="panel-head">
				<h3>Production Goals</h3>
			</div>
			<div class="table-scroll">
				<table class="mini-table">
					<thead>
						<tr>
							<th>Mix</th>
							<th>Unit</th>
							<th>Bid Qty</th>
							<th>Takeoff</th>
							<th>Qty/Day</th>
							<th>Est Days</th>
						</tr>
					</thead>
					<tbody>
						{#each productionMixes as mix}
							<tr>
								<td class="mix-cell">{mix.mix_name}</td>
								<td>{mix.unit ?? '—'}</td>
								<td class="num-cell">{mix.bid_quantity != null ? fmt(mix.bid_quantity, 0) : '—'}</td>
								<td class="num-cell">{mix.takeoff_tonnage != null ? fmt(mix.takeoff_tonnage, 0) : '—'}</td>
								<td class="num-cell">{mix.quantity_per_day != null ? fmt(mix.quantity_per_day, 0) : '—'}</td>
								<td class="num-cell">{mix.est_days != null ? fmt(mix.est_days, 1) : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	{#if bidItems.length > 0}
		<section class="panel panel-span">
			<div class="panel-head">
				<h3>Bid Items <span class="bid-item-count">{bidItems.filter(i => i.selected).length}/{bidItems.length}</span></h3>
			</div>
			<div class="table-scroll">
				<table class="mini-table bid-items-table">
					<thead>
						<tr>
							<th>Item</th>
							<th>Description</th>
							<th>Qty</th>
							<th>Unit</th>
							<th>$/Unit</th>
							<th>Amount</th>
						</tr>
					</thead>
					<tbody>
						{#each bidItems.filter(i => i.selected) as it}
							<tr class:alt-row={it.is_alternate}>
								<td class="mono-cell">{it.item_id ?? ''}</td>
								<td class="desc-cell">{it.description}</td>
								<td class="num-cell">{it.quantity != null ? fmt(it.quantity, 1) : ''}</td>
								<td>{it.unit ?? ''}</td>
								<td class="num-cell">{it.unit_price != null ? fmtDollars(it.unit_price) : ''}</td>
								<td class="num-cell">{it.bid_amount != null ? fmtDollars(it.bid_amount) : ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>
{/if}

{#if sourceDocuments.length > 0}
	<section class="panel panel-span source-docs-panel">
		<div class="panel-head">
			<h3>Source Documents</h3>
		</div>
		<div class="doc-list">
			{#each sourceDocuments as doc (doc.id)}
				<a
					class="doc-row"
					href={`/api/job-sites/${data.jobSite.id}/documents/${doc.id}/download`}
					download
				>
					<svg class="doc-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
					<div class="doc-info">
						<span class="doc-name">{doc.filename}</span>
						<span class="doc-type">{docTypeLabel(doc.doc_type)}</span>
					</div>
					<svg class="doc-dl" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</svg>
				</a>
			{/each}
		</div>
	</section>
{/if}

{#if schematics.length > 0}
	<section class="panel panel-span schematics-panel">
		<div class="panel-head">
			<h3>Plan Sheets &amp; Schematics <span class="bid-item-count">{schematics.length}</span></h3>
		</div>
		<SchematicViewer jobSiteId={data.jobSite.id} {schematics} />
	</section>
{/if}

{#if progressData !== null}
	<section class="panel progress-map-panel">
		<div class="panel-head">
			<h3>Paving Progress Map</h3>
		</div>
		{#if progressData.geometry === null}
			<div class="empty-state-mini">
				<p>Draw a route alignment to see progress visualization</p>
				<button class="btn-secondary" onclick={() => onGoToTab('location')}>
					Go to Map Tab
				</button>
			</div>
		{:else}
			{#await import('$lib/components/map-v2/MapView.svelte')}
				<div class="map-mini-loading">Loading progress map&hellip;</div>
			{:then { default: MapView }}
				{@const pd = progressData!}
				{@const geom = pd.geometry!}
				{@const coords = geom.coordinates}
				{@const midIndex = Math.floor(coords.length / 2)}
				{@const center = [coords[midIndex][1], coords[midIndex][0]] as [number, number]}
				{@const routeGeojson = { type: 'Feature' as const, properties: {}, geometry: geom }}
				<div class="progress-map-container">
					<MapView {center} zoom={14} height="360px">
						{#snippet layers()}
							{#await import('$lib/components/map-v2/MapGeoJSON.svelte') then { default: MapGeoJSON }}
								<MapGeoJSON
									id="progress-route"
									geojson={routeGeojson}
									styleFunction={() => ({ color: '#22c55e', width: 5, opacity: 0.85 })}
								/>
							{/await}
						{/snippet}
					</MapView>
				</div>
			{/await}
		{/if}
	</section>
{/if}

<div class="link-tiles">
	<button class="link-tile" onclick={() => onGoToTab('equipment')}>
		<span class="link-tile-count">{equipmentCount}</span>
		<span class="link-tile-label">Equipment</span>
	</button>
	<button class="link-tile" onclick={() => onGoToTab('calculations')}>
		<span class="link-tile-count">{data.calculations.length}</span>
		<span class="link-tile-label">Saved Calcs</span>
	</button>
	<button class="link-tile" onclick={() => onGoToTab('overview')}>
		<span class="link-tile-count">{data.assignments.length}</span>
		<span class="link-tile-label">Crew</span>
	</button>
	<a class="link-tile" href="/dashboard/job-sites/{data.jobSite.id}/log/history">
		<span class="link-tile-count link-tile-arrow">→</span>
		<span class="link-tile-label">Log History</span>
	</a>
</div>

<section class="panel location-panel">
	<div class="panel-head">
		<h3>Location & Route</h3>
		{#if data.jobSite.latitude != null}
			<button class="link-btn" onclick={() => (showLocationSearch = !showLocationSearch)}>
				{showLocationSearch ? 'Cancel' : 'Change'}
			</button>
		{/if}
	</div>

	{#if data.jobSite.latitude != null && !showLocationSearch}
		{#await import('$lib/components/RouteAlignmentMap.svelte')}
			<div class="map-mini-loading">Loading map&hellip;</div>
		{:then { default: RouteAlignmentMap }}
			<RouteAlignmentMap
				site={{
					id: data.jobSite.id,
					name: data.jobSite.name,
					status: data.jobSite.status as 'active' | 'completed' | 'archived',
					latitude: data.jobSite.latitude,
					longitude: data.jobSite.longitude,
					location_description: data.jobSite.location_description
				}}
				initialWaypoints={data.routeWaypoints}
				numLanes={data.config?.num_lanes}
				laneWidthFt={data.config?.lane_width_ft}
				height="400px"
				onRouteSave={async (waypoints) => {
					const res = await fetch(`/api/job-sites/${data.jobSite.id}/route`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ waypoints }),
						credentials: 'include'
					});
					if (res.ok) {
						toastStore.success('Route saved');
					} else {
						toastStore.error('Failed to save route');
					}
				}}
			/>
		{/await}
		<p class="location-coords">
			{data.jobSite.latitude.toFixed(5)}, {data.jobSite.longitude?.toFixed(5)}
			<button class="link-btn-sm" onclick={clearCoordinates}>Clear</button>
		</p>

		<div class="gdot-info-section">
			<h4>GDOT Information</h4>
			<dl class="gdot-spec-list">
				<div class="spec-item">
					<dt>County</dt>
					<dd>{data.jobSite.gdot_county || 'Unknown'}</dd>
				</div>
				<div class="spec-item">
					<dt>District</dt>
					<dd>{data.jobSite.gdot_district || 'Unknown'}</dd>
				</div>
			</dl>
			{#if data.jobSite.latitude != null && data.jobSite.longitude != null}
				{#if gdotLookupLoading}
					<button class="btn-secondary" disabled>Updating...</button>
				{:else}
					<button class="btn-secondary" onclick={lookupGdotBoundaries}>
						{data.jobSite.gdot_county ? 'Refresh' : 'Lookup'} GDOT Info
					</button>
				{/if}
			{/if}
		</div>

		<div class="progress-map-section">
			<div class="progress-map-head">
				<h4>Haul Route</h4>
				<span class="progress-map-sub">Distance from asphalt plant to job site</span>
			</div>
			{#await import('$lib/components/HaulRouteMap.svelte')}
				<div class="map-mini-loading">Loading haul route&hellip;</div>
			{:then { default: HaulRouteMap }}
				<HaulRouteMap
					site={{
						id: data.jobSite.id,
						name: data.jobSite.name,
						latitude: data.jobSite.latitude,
						longitude: data.jobSite.longitude
					}}
					plant={plantLocation}
					avgSpeedMph={30}
					height="280px"
				/>
			{/await}
			{#if !plantLocation.latitude || !plantLocation.longitude}
				<div class="plant-form">
					<h5>Set Plant Location</h5>
					<div class="form-row">
						<div class="form-group">
							<label for="plant_name">Plant Name</label>
							<input
								type="text"
								id="plant_name"
								bind:value={plantForm.name}
								placeholder="e.g., Metro Asphalt Plant"
							/>
						</div>
					</div>
					<div class="form-row">
						<div class="form-group">
							<label for="plant_lat">Latitude</label>
							<input
								type="number"
								id="plant_lat"
								bind:value={plantForm.latitude}
								step="0.000001"
								placeholder="e.g., 39.7392"
							/>
						</div>
						<div class="form-group">
							<label for="plant_lng">Longitude</label>
							<input
								type="number"
								id="plant_lng"
								bind:value={plantForm.longitude}
								step="0.000001"
								placeholder="e.g., -104.9903"
							/>
						</div>
					</div>
					<button
						class="btn-primary"
						onclick={savePlantLocation}
						disabled={!plantForm.name || plantForm.latitude == null || plantForm.longitude == null}
					>
						Set Plant Location
					</button>
					{#if plantSaved}
						<div class="plant-saved">Plant location saved</div>
					{/if}
				</div>
			{:else}
				<div class="plant-info">
					<div class="plant-info-row">
						<span class="plant-info-label">Plant:</span>
						<span class="plant-info-value">{plantLocation.name}</span>
					</div>
					<div class="plant-info-row">
						<span class="plant-info-label">Location:</span>
						<span class="plant-info-value">{plantLocation.latitude?.toFixed(5)}, {plantLocation.longitude?.toFixed(5)}</span>
					</div>
					<button class="link-btn" onclick={clearPlantLocation}>Change Plant</button>
				</div>
			{/if}
		</div>

		{#if configForm.route_designation}
			<div class="route-designation-section">
				<h4>Route Designation</h4>
				<div class="route-badge">{configForm.route_designation}</div>
				{#if configForm.route_county || configForm.route_district}
					<div class="route-info-rows">
						{#if configForm.route_county}
							<div class="info-row">
								<span class="info-label">County:</span>
								<span>{configForm.route_county}</span>
							</div>
						{/if}
						{#if configForm.route_district}
							<div class="info-row">
								<span class="info-label">District:</span>
								<span>{configForm.route_district}</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if sections.some((s) => s.geometry_geojson)}
			<div class="progress-map-section">
				<div class="progress-map-head">
					<h4>Road Section Progress</h4>
					<span class="progress-map-sub">Color-coded by paving status — tap a segment for details</span>
				</div>
				<!-- Status legend -->
				<div class="rpl-legend">
					{#each ([['planned','#94a3b8','Planned'],['scheduled_today','#f2c037','Today'],['in_progress','#f59e0b','In Progress'],['completed','#22c55e','Done'],['behind_schedule','#ef4444','Behind']] as const) as [, color, label]}
						<div class="rpl-legend-item">
							<span class="rpl-swatch" style:background={color}></span>
							<span>{label}</span>
						</div>
					{/each}
				</div>
				{#await Promise.all([import('$lib/components/map-v2/MapView.svelte'), import('$lib/components/map-v2/RoadProgressLayer.svelte')])}
					<div class="map-mini-loading">Loading road progress map&hellip;</div>
				{:then [{ default: MapView }, { default: RoadProgressLayer }]}
					{@const sectionsWithGeo = sections.filter((s) => s.geometry_geojson)}
					{@const firstGeo = (() => { try { const g = JSON.parse(sectionsWithGeo[0]?.geometry_geojson ?? 'null'); return g?.type === 'LineString' ? g.coordinates as [number,number][] : null; } catch { return null; } })()}
					{@const midPt = firstGeo ? firstGeo[Math.floor(firstGeo.length / 2)] : null}
					{@const mapCenter = midPt ? ([midPt[1], midPt[0]] as [number,number]) : (data.jobSite.latitude != null ? [data.jobSite.latitude, data.jobSite.longitude ?? 0] as [number,number] : [39.5, -98.35] as [number,number])}
					<div class="rpl-map-wrap">
						<MapView center={mapCenter} zoom={14} height="340px">
							{#snippet layers()}
								<RoadProgressLayer
									sections={sectionsWithGeo}
									defaultLaneWidthFt={data.config?.lane_width_ft ?? 12}
									onSectionClick={(sec) => { selectedSection = sec; }}
								/>
							{/snippet}
						</MapView>
						<!-- Today's progress overlay -->
						<div class="rpl-overlay">
							{#await import('$lib/components/map-v2/TodayProgressOverlay.svelte') then { default: TodayProgressOverlay }}
								<TodayProgressOverlay
									completedLengthFt={completedLengthFt}
									targetLengthFt={routeLengthFt}
								/>
							{/await}
						</div>
					</div>
				{/await}
				<!-- Section detail drawer -->
				{#if selectedSection}
					<div class="rpl-detail-card" role="region" aria-label="Section details">
						<div class="rpl-detail-head">
							<strong>{selectedSection.name}</strong>
							<button class="rpl-close" onclick={() => { selectedSection = null; }} aria-label="Close">✕</button>
						</div>
						<dl class="rpl-detail-list">
							{#if selectedSection.station_start != null || selectedSection.station_end != null}
								<div class="rpl-dl-row">
									<dt>Stations</dt>
									<dd>{selectedSection.station_start ?? '?'} – {selectedSection.station_end ?? '?'}</dd>
								</div>
							{/if}
							<div class="rpl-dl-row">
								<dt>Status</dt>
								<dd class="rpl-status-badge" style:background={statusColor(selectedSection.paving_status ?? dbStatus(selectedSection.status))}>
									{statusLabel(selectedSection.paving_status ?? dbStatus(selectedSection.status))}
								</dd>
							</div>
							{#if selectedSection.lane}
								<div class="rpl-dl-row">
									<dt>Lane</dt>
									<dd>{selectedSection.lane}</dd>
								</div>
							{/if}
							{#if selectedSection.crew_name}
								<div class="rpl-dl-row">
									<dt>Crew</dt>
									<dd>{selectedSection.crew_name}</dd>
								</div>
							{/if}
							{#if selectedSection.notes}
								<div class="rpl-dl-row">
									<dt>Notes</dt>
									<dd>{selectedSection.notes}</dd>
								</div>
							{/if}
						</dl>
					</div>
				{/if}
			</div>
		{/if}

		{#if data.routeWaypoints.length < 2 && configForm.route_designation}
			<div class="progress-map-section">
				<div class="progress-map-head">
					<h4>Project Termini</h4>
					<span class="progress-map-sub">Load the route centerline to set termini on the road</span>
				</div>
				<div class="terminus-load">
					<p>
						This project is on <strong>{configForm.route_designation}</strong>. Load the GDOT
						centerline so you can pinpoint the begin and end termini on the actual road.
					</p>
					<button class="btn-secondary" onclick={loadRouteCenterline} disabled={loadingRoute}>
						{loadingRoute ? 'Loading…' : `Load ${configForm.route_designation} centerline`}
					</button>
				</div>
			</div>
		{/if}

		{#if data.routeWaypoints.length >= 2}
			<div class="progress-map-section">
				<div class="progress-map-head">
					<h4>Project Termini</h4>
					<span class="progress-map-sub">Tap the road to set the begin/end points</span>
				</div>
				{#await import('$lib/components/map-v2/TerminusPicker.svelte')}
					<div class="map-mini-loading">Loading terminus picker&hellip;</div>
				{:then { default: TerminusPicker }}
					<TerminusPicker
						waypoints={data.routeWaypoints}
						bind:beginStation={configForm.begin_station}
						bind:endStation={configForm.end_station}
						beginLabel={configForm.begin_terminus}
						endLabel={configForm.end_terminus}
						height="320px"
						onPick={(field, station) => saveTerminus(field, station)}
					/>
				{/await}
			</div>

			<div class="progress-map-section">
				<div class="progress-map-head">
					<h4>Paving Progress</h4>
					<span class="progress-map-sub">Completed segments shown in green</span>
				</div>
				{#if routeLengthFt != null && routeLengthFt > 0}
					<div class="length-remaining-bar">
						<div class="lr-stat">
							<span class="lr-label">Total</span>
							<span class="lr-value">{fmt(routeLengthFt)} ft</span>
						</div>
						<div class="lr-stat">
							<span class="lr-label">Completed</span>
							<span class="lr-value lr-done">{fmt(completedLengthFt)} ft</span>
						</div>
						<div class="lr-stat">
							<span class="lr-label">Remaining</span>
							<span class="lr-value lr-remaining"
								>{remainingLengthFt != null ? `${fmt(remainingLengthFt)} ft` : '—'}</span
							>
						</div>
					</div>
				{/if}
				{#await import('$lib/components/StationProgressMap.svelte')}
					<div class="map-mini-loading">Loading progress map&hellip;</div>
				{:then { default: StationProgressMap }}
					<StationProgressMap
						site={{
							id: data.jobSite.id,
							name: data.jobSite.name,
							status: data.jobSite.status as 'active' | 'completed' | 'archived',
							latitude: data.jobSite.latitude,
							longitude: data.jobSite.longitude,
							location_description: data.jobSite.location_description
						}}
						waypoints={data.routeWaypoints}
						numLanes={data.config?.num_lanes}
						laneWidthFt={data.config?.lane_width_ft}
						totalLengthFt={data.config?.total_length_ft}
						height="320px"
					/>
				{/await}
			</div>

			<div class="progress-map-section">
				<div class="progress-map-head">
					<h4>Spread Rate Map</h4>
					<span class="progress-map-sub">Color-coded by spread rate vs target</span>
				</div>
				{#await import('$lib/components/SpreadRateHeatMap.svelte')}
					<div class="map-mini-loading">Loading spread rate map&hellip;</div>
				{:then { default: SpreadRateHeatMap }}
					<SpreadRateHeatMap
						site={{
							id: data.jobSite.id,
							name: data.jobSite.name,
							status: data.jobSite.status as 'active' | 'completed' | 'archived',
							latitude: data.jobSite.latitude,
							longitude: data.jobSite.longitude,
							location_description: data.jobSite.location_description
						}}
						waypoints={data.routeWaypoints}
						targetRate={configForm.target_spread_rate}
						toleranceLbsSy={5}
						height="320px"
					/>
				{/await}
			</div>
		{/if}

		{#if data.jobSite.latitude != null && data.jobSite.longitude != null}
			<div class="photos-section">
				<div class="photos-head">
					<h4>Field Photos</h4>
					{#await import('$lib/components/PhotoCapture.svelte')}
						<span class="loading-text">Loading...</span>
					{:then { default: PhotoCapture }}
						<PhotoCapture
							jobSiteId={data.jobSite.id}
							onUploaded={loadPhotos}
							compact={false}
						/>
					{/await}
				</div>

				{#await import('$lib/components/PhotoGeoMap.svelte')}
					<div class="map-mini-loading">Loading photo map&hellip;</div>
				{:then { default: PhotoGeoMap }}
					<PhotoGeoMap
						jobSiteId={data.jobSite.id}
						lat={data.jobSite.latitude}
						lng={data.jobSite.longitude}
						height="360px"
					/>
				{/await}

				{#if photosLoading}
					<div class="photo-grid-loading">
						{#each Array(4) as _, i (i)}
							<Skeleton width="100px" height="100px" borderRadius="6px" />
						{/each}
					</div>
				{/if}
				<div class="photo-grid" id="photo-grid"></div>
			</div>
		{/if}
	{:else}
		<!-- Location picker: shown when no coords yet, or when "Change" is clicked -->
		<JobSiteLocationPicker
			bind:latitude={pickerLat}
			bind:longitude={pickerLng}
			onchange={handleLocationChange}
			mapHeight="280px"
			showMapEager={showLocationSearch}
		/>
		{#if locationSaving}
			<p class="location-saving">Saving&hellip;</p>
		{/if}
	{/if}
</section>

<LoadTracker jobSiteId={data.jobSite.id} isAuthenticated={!!data.user} numLanes={data.config?.num_lanes} targetTonnage={configForm.total_tonnage || estTonnage || null} />

<WasteYieldAnalysis
	jobSiteId={data.jobSite.id}
	plannedTonnage={configForm.total_tonnage || estTonnage || null}
	isAuthenticated={!!data.user}
/>

<ETACalculator
	jobSiteId={data.jobSite.id}
	targetTonnage={configForm.total_tonnage || estTonnage || null}
	isAuthenticated={!!data.user}
	latitude={data.jobSite.latitude}
	longitude={data.jobSite.longitude}
/>

<TruckQueue jobSiteId={data.jobSite.id} isAuthenticated={!!data.user} />

<SpreadRateHistogram
	jobSiteId={data.jobSite.id}
	targetRate={configForm.target_spread_rate}
	toleranceLbsSy={spreadToleranceFor(job.courseType).toleranceLbsSy}
/>

<section class="panel">
	<div class="panel-head">
		<h3>Assigned Crew</h3>
	</div>
	{#if data.assignments.length === 0}
		<div class="empty-state-mini">
			<p>No crew members assigned yet</p>
		</div>
	{:else}
		<div class="crew-list">
			{#each data.assignments as assignment}
				<div class="crew-card">
					<div class="crew-avatar">{assignment.user_name.charAt(0).toUpperCase()}</div>
					<div class="crew-info">
						<div class="crew-name">{assignment.user_name}</div>
						<div class="crew-role">{assignment.role}</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

{#if selectedPhoto}
	<dialog class="lightbox" open onclick={closeLightbox}>
		<div class="lightbox-content" onclick={(e) => e.stopPropagation()}>
			<button type="button" class="lightbox-close" onclick={closeLightbox} aria-label="Close">
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
			<img
				src="/api/job-sites/{data.jobSite.id}/photos/{selectedPhoto.id}/view"
				alt={selectedPhoto.caption || selectedPhoto.filename}
				class="lightbox-img"
			/>
			{#if selectedPhoto.caption}
				<div class="lightbox-caption">{selectedPhoto.caption}</div>
			{/if}
			<div class="lightbox-meta">
				{new Date(selectedPhoto.taken_at * 1000).toLocaleString()}
				{#if selectedPhoto.lat != null && selectedPhoto.lng != null}
					<span class="lightbox-gps">
						<MapPin size={14} style="display: inline-block; vertical-align: text-bottom;" /> {selectedPhoto.lat.toFixed(6)}, {selectedPhoto.lng.toFixed(6)}
					</span>
				{/if}
			</div>
		</div>
	</dialog>
{/if}

<style>
	.project-status-bar {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 1px;
		background: var(--border);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		margin-bottom: 20px;
	}
	.psb-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 16px;
		background: var(--surface);
	}
	.psb-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}
	.psb-value {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--text);
	}
	.psb-item :global(.status-badge) {
		align-self: flex-start;
	}

	.setup-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		background: var(--surface);
		border: 1px solid var(--accent);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 16px 20px;
		margin-bottom: 24px;
	}

	.setup-banner-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.setup-banner-text strong {
		font-size: 0.95rem;
	}

	.setup-banner-text span {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.overview-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin-bottom: 16px;
	}

	.link-tiles {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
		margin-bottom: 24px;
	}

	@media (min-width: 640px) {
		.link-tiles {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.link-tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		cursor: pointer;
		text-decoration: none;
		transition: border-color 0.2s, transform 0.1s;
		text-align: left;
	}

	.link-tile:hover {
		border-color: var(--accent);
		transform: translateY(-1px);
	}

	.link-tile-count {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--text);
		line-height: 1;
	}

	.link-tile-arrow {
		color: var(--accent);
	}

	.link-tile-label {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.crew-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.crew-card {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
	}

	.crew-avatar {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 50%;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.crew-info {
		flex: 1;
	}

	.crew-name {
		font-weight: 600;
		margin-bottom: 2px;
	}

	.crew-role {
		font-size: 0.8rem;
		color: var(--text-muted);
		text-transform: capitalize;
	}

	/* Location panel */
	.location-panel {
		margin-top: 16px;
	}

	.location-coords {
		margin: 8px 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.link-btn-sm {
		background: none;
		border: 0;
		color: var(--accent);
		font-size: 0.75rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
		min-height: 32px;
	}

	.location-saving {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.gdot-info-section {
		margin-top: 20px;
		padding: 16px;
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.gdot-info-section h4 {
		margin: 0 0 12px;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
	}

	.gdot-spec-list {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
		margin-bottom: 12px;
	}

	.progress-map-section {
		margin-top: 20px;
	}

	.progress-map-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 10px;
	}

	.progress-map-head h4 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
	}

	.progress-map-sub {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.length-remaining-bar {
		display: flex;
		gap: 10px;
		margin-bottom: 12px;
	}

	.lr-stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 12px;
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.lr-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.lr-value {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
	}

	.lr-value.lr-done {
		color: #22c55e;
	}

	.lr-value.lr-remaining {
		color: var(--accent);
	}

	/* Photos section */
	.photos-section {
		margin-top: 20px;
	}

	.photos-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.photos-head h4 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
	}

	.loading-text {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.photo-grid-loading {
		display: inline-flex;
		gap: 8px;
		margin-top: 12px;
	}

	.photo-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-top: 12px;
	}

	.photo-thumb {
		position: relative;
		aspect-ratio: 1;
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
		border: 1px solid var(--border);
		transition: transform 0.15s;
	}

	.photo-thumb:hover {
		transform: scale(1.02);
	}

	.photo-thumb :global(img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	:global(.photo-caption) {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
		color: white;
		font-size: 0.75rem;
		padding: 8px 6px 4px;
		line-height: 1.2;
	}

	/* Lightbox */
	.lightbox {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		border: none;
		padding: 20px;
		max-width: 100vw;
		max-height: 100vh;
	}

	.lightbox-content {
		position: relative;
		max-width: 90vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.lightbox-close {
		position: absolute;
		top: -40px;
		right: 0;
		background: transparent;
		border: none;
		color: white;
		cursor: pointer;
		padding: 8px;
		z-index: 1001;
		min-height: 48px;
		min-width: 48px;
	}

	.lightbox-close:hover {
		opacity: 0.7;
	}

	.lightbox-img {
		max-width: 100%;
		max-height: calc(90vh - 100px);
		object-fit: contain;
		border-radius: 8px;
	}

	.lightbox-caption {
		color: white;
		font-size: 1rem;
		margin-top: 12px;
		text-align: center;
		font-weight: 500;
	}

	.lightbox-meta {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		margin-top: 8px;
		text-align: center;
		display: flex;
		gap: 16px;
		align-items: center;
	}

	.lightbox-gps {
		font-family: monospace;
	}

	/* Plant location form */
	.plant-form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		padding: 16px;
		margin-top: 12px;
	}

	.plant-form h5 {
		margin: 0 0 12px;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
	}

	.plant-saved {
		margin-top: 8px;
		padding: 8px;
		background: rgba(34, 197, 94, 0.1);
		color: var(--good, #22c55e);
		border-radius: var(--radius);
		font-size: 0.85rem;
		text-align: center;
	}

	.plant-info {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		padding: 12px 16px;
		margin-top: 12px;
	}

	.plant-info-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.plant-info-row:last-child {
		margin-bottom: 8px;
	}

	.plant-info-label {
		font-size: 0.8rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.plant-info-value {
		font-size: 0.85rem;
		color: var(--text);
	}

	/* Route designation section */
	.route-designation-section {
		margin-top: 20px;
		padding: 16px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.route-designation-section h4 {
		margin: 0 0 12px;
		font-size: 0.9rem;
		color: var(--text);
		font-weight: 600;
	}

	.route-badge {
		display: inline-block;
		padding: 8px 16px;
		background: color-mix(in srgb, var(--accent) 15%, var(--surface));
		color: var(--accent);
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 700;
		margin-bottom: 12px;
	}

	.route-info-rows {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.route-info-rows .info-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
	}

	.route-info-rows .info-label {
		font-weight: 600;
		color: var(--text-muted);
	}

	/* Road Progress Layer section */
	.rpl-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 14px;
		margin-bottom: 10px;
	}

	.rpl-legend-item {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.rpl-swatch {
		display: inline-block;
		width: 14px;
		height: 5px;
		border-radius: 999px;
		flex-shrink: 0;
	}

	.rpl-map-wrap {
		position: relative;
	}

	.rpl-overlay {
		position: absolute;
		bottom: 12px;
		right: 12px;
		z-index: 10;
		pointer-events: none;
	}

	.rpl-detail-card {
		margin-top: 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px 14px;
	}

	.rpl-detail-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
		gap: 8px;
	}

	.rpl-detail-head strong {
		font-size: 0.95rem;
	}

	.rpl-close {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 1rem;
		min-width: 32px;
		min-height: 32px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.rpl-detail-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
	}

	.rpl-dl-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.rpl-dl-row dt {
		min-width: 80px;
		font-size: 0.75rem;
		color: var(--text-muted);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		padding-top: 2px;
	}

	.rpl-dl-row dd {
		font-size: 0.85rem;
		color: var(--text);
		margin: 0;
	}

	.rpl-status-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 700;
		color: #fff;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	/* Progress map panel */
	.progress-map-panel {
		margin-bottom: 24px;
	}

	.map-mini-loading {
		padding: 40px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.terminus-load {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius);
	}

	.terminus-load p {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	@media (max-width: 640px) {
		.overview-grid {
			grid-template-columns: 1fr;
		}

		.link-tiles {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 768px) {
		.photo-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	/* Contract & Bid Items section */
	.contract-section {
		margin-bottom: 24px;
	}

	.contract-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 8px 16px;
	}

	.scope-tags-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}

	.scope-tag {
		padding: 4px 10px;
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
		color: var(--accent);
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.table-scroll {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.mini-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.mini-table th,
	.mini-table td {
		padding: 7px 10px;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}

	.mini-table th {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		font-weight: 700;
		white-space: nowrap;
	}

	.mini-table .mix-cell {
		font-weight: 600;
	}

	.mini-table .num-cell {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.mini-table .mono-cell {
		font-family: monospace;
		font-size: 0.75rem;
	}

	.mini-table .desc-cell {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bid-item-count {
		font-size: 0.72rem;
		padding: 2px 8px;
		background: var(--surface-alt, var(--border));
		border-radius: 999px;
		color: var(--text-muted);
		font-weight: 600;
		margin-left: 8px;
	}

	.bid-items-table .alt-row {
		background: color-mix(in srgb, var(--accent) 4%, transparent);
	}

	.schematics-panel {
		margin-bottom: 24px;
	}

	.source-docs-panel {
		margin-bottom: 24px;
	}

	.doc-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.doc-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
		transition: border-color 0.2s;
	}

	.doc-row:hover {
		border-color: var(--accent);
	}

	.doc-icon {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.doc-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.doc-name {
		font-weight: 600;
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.doc-type {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.doc-dl {
		color: var(--accent);
		flex-shrink: 0;
	}

	.setup-progress-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 24px;
	}

	.setup-progress-content {
		display: flex;
		align-items: flex-start;
		gap: 24px;
	}

	.progress-ring-wrapper {
		position: relative;
		width: 80px;
		height: 80px;
		flex-shrink: 0;
	}

	.progress-ring {
		transform: rotate(-90deg);
	}

	.progress-ring-label {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 1.4rem;
		font-weight: 700;
	}

	.setup-progress-info {
		flex: 1;
		min-width: 0;
	}

	.setup-progress-summary {
		margin: 0 0 12px;
		font-size: 0.95rem;
		color: var(--text);
	}

	.missing-fields-title {
		margin: 0 0 8px;
		font-size: 0.85rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.missing-fields-list {
		margin: 0 0 12px;
		padding-left: 20px;
		font-size: 0.85rem;
		color: var(--text);
	}

	.missing-fields-list li {
		margin-bottom: 4px;
	}

	.btn-sm {
		padding: 8px 16px;
		min-height: 38px;
		font-size: 0.85rem;
	}

	.setup-complete {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--good, #22c55e);
		font-weight: 600;
		font-size: 0.9rem;
	}
</style>
