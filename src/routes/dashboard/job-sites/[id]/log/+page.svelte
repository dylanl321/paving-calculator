<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { config } from '$lib/config';
	import type { PageData } from './$types';
	import GpsStationButton from '$lib/components/GpsStationButton.svelte';
	import type { RouteWaypoint } from '$lib/services/gpsStation';
	import TimeInput from '$lib/components/TimeInput.svelte';
	import { Droplets, FileText, Clock, ChevronLeft, ChevronRight, Calendar, FileDown } from 'lucide-svelte';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import ComplianceGauge from '$lib/components/ComplianceGauge.svelte';
	import NuclearGaugeLog from '$lib/components/NuclearGaugeLog.svelte';
	import StationProgressLogger from '$lib/components/StationProgressLogger.svelte';
	import { formatFeet } from '$lib/utils/format';
	import { actualSpreadRate } from '$lib/config/formulas';
	import CloseOutModal from '$lib/components/CloseOutModal.svelte';
	import DailySummaryReport from '$lib/components/DailySummaryReport.svelte';
	import ComparativeDayView from '$lib/components/ComparativeDayView.svelte';
	import FeatureDiscovery from '$lib/components/FeatureDiscovery.svelte';
	import CompletenessBar from '$lib/components/CompletenessBar.svelte';
	import { today } from '$lib/stores/today.svelte';

	let { data }: { data: PageData } = $props();

	const projectSummary = $derived(data.summary as typeof data.summary & { total_days?: number });

	// Reactive object for CompletenessBar from today store
	const todayState = $derived({
		weather_temp_f: today.weatherTempF,
		crew_count: today.crewCount,
		start_time: today.startTime,
		end_time: today.endTime,
		entries: today.entries,
		notes: today.notes,
		wind_speed_mph: today.windSpeedMph,
		plant_name: today.plantName
	});

	interface LogDetailsResponse {
		entries: any[];
		summary: { total_distance_ft: number; total_tons: number; total_loads: number };
	}
	interface RouteResponse {
		waypoints?: RouteWaypoint[];
	}
	interface LogResponse {
		log: any;
	}
	interface LoadsResponse {
		loads?: any[];
	}
	interface UnlockErrorResponse {
		message?: string;
	}

	let isHistoricalView = $derived(!!data.isHistoricalView);
	let viewedLog = $derived(data.activeLog ?? data.todayLog);
	let currentLog = $state<any>(data.activeLog);
	let entries = $state<any[]>([]);
	let entrySummary = $state<any>({ total_distance_ft: 0, total_tons: 0, total_loads: 0 });
	let showEntryForm = $state(false);
	let editingEntry = $state<any>(null);
	let showCloseOut = $state(false);
	let unlocking = $state(false);
	let showSummary = $state(false);
	let showComparison = $state(false);
	let showCalendarPicker = $state(false);

	let isAdmin = $derived(
		data.userRole === 'owner' || data.userRole === 'admin' || data.isGlobalAdmin
	);

	// Route waypoints for GPS station detection
	let routeWaypoints = $state<RouteWaypoint[]>([]);

	async function loadRoute() {
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/route`);
			if (res.ok) {
				const { waypoints } = (await res.json()) as RouteResponse;
				routeWaypoints = Array.isArray(waypoints) ? waypoints : [];
			}
		} catch {
			// Route loading is best-effort; failure is non-fatal
		}
	}

	// Load route once on mount
	$effect(() => {
		loadRoute();
	});

	let entryForm = $state({
		entry_type: 'paving' as 'paving' | 'milling' | 'tack' | 'break' | 'delay' | 'note',
		timestamp: '',
		station_start: null as number | null,
		station_end: null as number | null,
		distance_ft: null as number | null,
		tons_placed: null as number | null,
		loads_count: null as number | null,
		spread_rate_actual: null as number | null,
		tack_gallons: null as number | null,
		lane: '',
		notes: ''
	});

	$effect(() => {
		if (viewedLog) {
			currentLog = viewedLog;
			loadLogDetails();
		}
	});

	async function loadLogDetails() {
		if (!viewedLog) return;
		const res = await fetch(`/api/job-sites/${data.jobSite.id}/logs/${viewedLog.id}`);
		if (res.ok) {
			const result = (await res.json()) as LogDetailsResponse;
			entries = result.entries;
			entrySummary = result.summary;
		}
	}

	async function startLog() {
		const res = await fetch(`/api/job-sites/${data.jobSite.id}/logs`, { method: 'POST' });
		if (res.ok) {
			const { log } = (await res.json()) as LogResponse;
			currentLog = log;
			await invalidateAll();
		}
	}

	async function updateLog() {
		if (!currentLog) return;
		const updates = {
			weather_temp_f: currentLog.weather_temp_f,
			weather_conditions: currentLog.weather_conditions,
			wind_speed_mph: currentLog.wind_speed_mph,
			crew_count: currentLog.crew_count,
			start_time: currentLog.start_time,
			end_time: currentLog.end_time,
			notes: currentLog.notes
		};
		const res = await fetch(`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});
		if (res.ok) {
			await loadLogDetails();
		} else if (res.status === 423) {
			alert('This day is locked after close-out. Ask an admin to unlock it.');
		}
	}

	function handlePhotoUploaded() {
		// Photo uploaded successfully - could reload log details here if needed
		console.log('Photo uploaded');
	}

	function openEntryForm() {
		const now = new Date();
		entryForm = {
			entry_type: 'paving',
			timestamp: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
			station_start: null,
			station_end: null,
			distance_ft: null,
			tons_placed: null,
			loads_count: null,
			spread_rate_actual: null,
			tack_gallons: null,
			lane: '',
			notes: ''
		};
		editingEntry = null;
		showEntryForm = true;
	}

	function fillFromCalculator() {
		if (!logDraft.current) return;
		const draft = logDraft.current;
		const now = new Date();
		entryForm = {
			entry_type: draft.entryType,
			timestamp: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
			station_start: draft.fields.station_start ?? null,
			station_end: draft.fields.station_end ?? null,
			distance_ft: draft.fields.distance_ft ?? null,
			tons_placed: draft.fields.tons_placed ?? null,
			loads_count: draft.fields.loads_count ?? null,
			spread_rate_actual: draft.fields.spread_rate_actual ?? null,
			tack_gallons: draft.fields.tack_gallons ?? null,
			lane: draft.fields.lane ?? '',
			notes: draft.fields.notes ?? ''
		};
		editingEntry = null;
		showEntryForm = true;
	}

	function editEntry(entry: any) {
		entryForm = {
			entry_type: entry.entry_type,
			timestamp: entry.timestamp,
			station_start: entry.station_start,
			station_end: entry.station_end,
			distance_ft: entry.distance_ft,
			tons_placed: entry.tons_placed,
			loads_count: entry.loads_count,
			spread_rate_actual: entry.spread_rate_actual,
			tack_gallons: entry.tack_gallons,
			lane: entry.lane || '',
			notes: entry.notes || ''
		};
		editingEntry = entry;
		showEntryForm = true;
	}

	async function saveEntry() {
		if (!currentLog) return;

		if (editingEntry) {
			const res = await fetch(
				`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/entries/${editingEntry.id}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(entryForm)
				}
			);
			if (res.ok) {
				showEntryForm = false;
				await loadLogDetails();
			} else if (res.status === 423) {
				alert('This day is locked after close-out. Ask an admin to unlock it.');
			}
		} else {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/entries`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(entryForm)
			});
			if (res.ok) {
				showEntryForm = false;
				await loadLogDetails();
			} else if (res.status === 423) {
				alert('This day is locked after close-out. Ask an admin to unlock it.');
			}
		}
	}

	async function deleteEntry(entryId: string) {
		if (!confirm('Delete this entry?')) return;
		const res = await fetch(
			`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/entries/${entryId}`,
			{ method: 'DELETE' }
		);
		if (res.ok) {
			await loadLogDetails();
		} else if (res.status === 423) {
			alert('This day is locked after close-out. Ask an admin to unlock it.');
		}
	}

	function navigateToPrevDay() {
		if (data.prevLogId) {
			goto(`/dashboard/job-sites/${data.jobSite.id}/log?date=${data.prevLogId}`);
		}
	}

	function navigateToNextDay() {
		if (data.nextLogId) {
			goto(`/dashboard/job-sites/${data.jobSite.id}/log?date=${data.nextLogId}`);
		}
	}

	function navigateToToday() {
		goto(`/dashboard/job-sites/${data.jobSite.id}/log`);
	}

	function formatLogDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function getEntryTypeIcon(type: string): string {
		const icons: Record<string, string> = {
			paving: '🛣️',
			milling: '⚙️',
			tack: '💧',
			break: '☕',
			delay: '⏸️',
			note: '📝'
		};
		return icons[type] || '📌';
	}

	function getEntryTypeColor(type: string): string {
		const colors: Record<string, string> = {
			paving: 'green',
			milling: 'blue',
			tack: 'cyan',
			break: 'gray',
			delay: 'red',
			note: 'yellow'
		};
		return colors[type] || 'gray';
	}

	$effect(() => {
		if (
			entryForm.station_start != null &&
			entryForm.station_end != null &&
			!entryForm.distance_ft
		) {
			entryForm.distance_ft = (entryForm.station_end - entryForm.station_start) * 100;
		}
	});

	// Real-time ETA — updates every 30 seconds
	let now = $state(new Date());
	$effect(() => {
		const interval = setInterval(() => {
			now = new Date();
		}, 30000);
		return () => clearInterval(interval);
	});

	// ETA calculations
	const todayPavingFt = $derived(
		entries.filter((e) => e.entry_type === 'paving').reduce((sum: number, e: any) => sum + (e.distance_ft || 0), 0)
	);

	const sessionStartMinutes = $derived.by(() => {
		if (currentLog?.start_time) {
			const [h, m] = currentLog.start_time.split(':').map(Number);
			return h * 60 + m;
		}
		const firstPaving = entries.find((e: any) => e.entry_type === 'paving');
		if (firstPaving?.timestamp) {
			const [h, m] = firstPaving.timestamp.split(':').map(Number);
			return h * 60 + m;
		}
		return null;
	});

	const nowMinutes = $derived(now.getHours() * 60 + now.getMinutes());
	const elapsedHours = $derived(
		sessionStartMinutes !== null ? Math.max(0.25, (nowMinutes - sessionStartMinutes) / 60) : 0.25
	);
	const pavingRateFtPerHr = $derived(
		todayPavingFt > 0 && elapsedHours > 0 ? todayPavingFt / elapsedHours : 0
	);
	const targetFt = $derived((data.siteConfig as any)?.config?.total_length_ft ?? null);
	const remainingFt = $derived(targetFt ? Math.max(0, targetFt - todayPavingFt) : null);
	const etaHours = $derived(
		pavingRateFtPerHr > 0 && remainingFt !== null ? remainingFt / pavingRateFtPerHr : null
	);
	const etaTime = $derived.by(() => {
		if (etaHours === null) return null;
		const eta = new Date(now.getTime() + etaHours * 60 * 60 * 1000);
		const h = eta.getHours();
		const m = String(eta.getMinutes()).padStart(2, '0');
		const period = h >= 12 ? 'PM' : 'AM';
		const displayHour = h % 12 || 12;
		return `${displayHour}:${m} ${period}`;
	});
	const percentComplete = $derived(
		targetFt && targetFt > 0 ? Math.min(100, (todayPavingFt / targetFt) * 100) : null
	);

	// PDF export state
	let pdfExporting = $state(false);

	async function exportLogPDF() {
		if (!currentLog) return;
		pdfExporting = true;
		try {
			const { generateDailyReportPDF } = await import('$lib/utils/pdf-export');

			let loads: any[] = [];
			try {
				const currentDate = currentLog.log_date;
				const res = await fetch(`/api/job-sites/${data.jobSite.id}/loads?start_date=${currentDate}`);
				if (res.ok) {
					const loadData = (await res.json()) as LoadsResponse;
					loads = loadData.loads || [];
				}
			} catch {
				// Non-fatal - continue without loads
			}

			const hoursWorked = currentLog.start_time && currentLog.end_time
				? (() => {
					const [startH, startM] = currentLog.start_time.split(':').map(Number);
					const [endH, endM] = currentLog.end_time.split(':').map(Number);
					return Math.max(0, (endH * 60 + endM - (startH * 60 + startM)) / 60);
				})()
				: 0;

			const actualRate = entrySummary.total_distance_ft > 0 && entrySummary.total_tons > 0
				? actualSpreadRate({
						tons: entrySummary.total_tons,
						distanceFt: entrySummary.total_distance_ft,
						widthFt: 1
					})
				: null;
			const targetRate = (data.siteConfig as any)?.config?.target_spread_rate || null;
			const diffPct = actualRate && targetRate ? ((actualRate - targetRate) / targetRate) * 100 : null;

			await generateDailyReportPDF(
				{
					widthFt: (data.siteConfig as any)?.config?.lane_width_ft || 12,
					thicknessIn: (data.siteConfig as any)?.config?.target_thickness_in || 2,
					machineId: 'none',
					firstPass: false,
					truckLoadTons: 22,
					tackApplication: 'new-to-new',
					wastePct: 5,
					siteName: data.jobSite.name,
					siteDescription: data.jobSite.location_description || '',
					courseType: ''
				},
				{
					date: currentLog.log_date,
					siteName: data.jobSite.name,
					weatherTempF: currentLog.weather_temp_f,
					weatherConditions: currentLog.weather_conditions,
					windSpeedMph: currentLog.wind_speed_mph,
					crewCount: currentLog.crew_count,
					startTime: currentLog.start_time,
					endTime: currentLog.end_time,
					notes: currentLog.notes,
					entries: entries.map((e) => ({
						entry_type: e.entry_type,
						timestamp: e.timestamp,
						station_start: e.station_start,
						station_end: e.station_end,
						distance_ft: e.distance_ft,
						tons_placed: e.tons_placed,
						loads_count: e.loads_count,
						truck_tickets: null,
						spread_rate_actual: e.spread_rate_actual,
						tack_gallons: e.tack_gallons,
						lane: e.lane,
						notes: e.notes
					})),
					totals: {
						totalTons: entrySummary.total_tons,
						totalDistanceFt: entrySummary.total_distance_ft,
						totalLoads: entrySummary.total_loads,
						totalTackGallons: 0,
						hoursWorked
					},
					yield: {
						actualRate,
						targetRate,
						diffPct
					},
					loads: loads.map((l: any) => ({
						id: l.id,
						ticket_number: l.ticket_number,
						tons: l.tons,
						timestamp: l.timestamp,
						spread_rate: l.spread_rate,
						notes: l.notes
					}))
				}
			);
		} catch (err) {
			console.error('PDF export failed:', err);
		} finally {
			pdfExporting = false;
		}
	}

	async function unlockLog() {
		if (!currentLog) return;
		unlocking = true;
		try {
			const res = await fetch(
				`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/unlock`,
				{ method: 'POST' }
			);
			if (res.ok) {
				const { log } = (await res.json()) as LogResponse;
				currentLog = log;
				await invalidateAll();
			} else {
				const err = (await res.json()) as UnlockErrorResponse;
				alert(err.message || 'Failed to unlock log');
			}
		} catch (err) {
			alert('Failed to unlock log');
		} finally {
			unlocking = false;
		}
	}

	function formatClosedDate(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	async function handleCloseOutComplete() {
		await loadLogDetails();
		await invalidateAll();
	}

	function handleCalendarSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const selectedDate = input.value;
		if (!selectedDate) return;

		const matchingLog = data.logs.find((l) => l.log_date === selectedDate);
		if (matchingLog) {
			goto(`/dashboard/job-sites/${data.jobSite.id}/log?date=${matchingLog.id}`);
			showCalendarPicker = false;
		}
	}

	function handleCalendarKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			showCalendarPicker = false;
		}
	}
</script>

<svelte:head>
	<title>Daily Log{isHistoricalView && currentLog ? ` — ${formatLogDate(currentLog.log_date)}` : ''} — {data.jobSite.name} — {config.app.name}</title>
</svelte:head>

<div class="dashboard">
	<div class="breadcrumb">
		<a href="/dashboard">Dashboard</a>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
		<a href="/dashboard/job-sites/{data.jobSite.id}">{data.jobSite.name}</a>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
		<span>Daily Log</span>
	</div>

	{#if data.logs && data.logs.length > 0}
		<div class="date-nav">
			<a
				href={data.prevLogId ? `/dashboard/job-sites/${data.jobSite.id}/log?date=${data.prevLogId}` : '#'}
				class="date-nav-arrow"
				class:disabled={!data.prevLogId}
				aria-label="Previous day"
			>
				← {data.prevLabel}
			</a>
			<span class="date-nav-current">
				{formatLogDate(viewedLog?.log_date ?? data.today)}
			</span>
			<button
				class="date-nav-calendar"
				onclick={() => (showCalendarPicker = !showCalendarPicker)}
				aria-label="Select date"
				title="Jump to date"
			>
				<Calendar size={18} />
			</button>
			<a
				href={data.nextLogId ? `/dashboard/job-sites/${data.jobSite.id}/log?date=${data.nextLogId}` : '#'}
				class="date-nav-arrow"
				class:disabled={!data.nextLogId}
				aria-label="Next day"
			>
				{data.nextLabel} →
			</a>
			{#if isHistoricalView}
				<a href="/dashboard/job-sites/{data.jobSite.id}/log" class="date-nav-today">Today</a>
			{/if}
		</div>
		{#if showCalendarPicker}
			<div class="calendar-picker-popover" onkeydown={handleCalendarKeydown}>
				<input
					type="date"
					value={viewedLog?.log_date ?? data.today}
					onchange={handleCalendarSelect}
					onkeydown={handleCalendarKeydown}
					class="calendar-picker-input"
				/>
			</div>
		{/if}
	{/if}

	{#if isHistoricalView}
		<div class="history-banner">
			📖 Viewing past log — read only
		</div>
	{/if}

	{#if currentLog?.closed_at}
		<div class="closed-banner">
			<div class="closed-content">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
					<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
				</svg>
				<div>
					<strong>Day Closed — {currentLog.foreman_name}</strong>
					<p>{formatClosedDate(currentLog.closed_at)}</p>
				</div>
			</div>
			{#if isAdmin}
				<button class="btn-unlock" disabled={unlocking} onclick={unlockLog}>
					{unlocking ? 'Unlocking...' : 'Admin Unlock'}
				</button>
			{/if}
		</div>
	{/if}

	<div class="page-header">
		<div>
			<h2 class="page-title">Daily Log</h2>
			<p class="page-subtitle">
				{isHistoricalView && viewedLog ? formatLogDate(viewedLog.log_date) : new Date(data.today).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
			</p>
		</div>
		<div class="page-header-actions">
			{#if currentLog}
				{#if !currentLog.closed_at && !isHistoricalView}
					<button class="btn-primary" onclick={() => (showCloseOut = true)}>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M9 11l3 3L22 4"></path>
							<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
						</svg>
						Close Out Day
					</button>
				{/if}
				<button
					class="btn-secondary btn-pdf"
					onclick={exportLogPDF}
					disabled={pdfExporting}
					title="Download daily production PDF"
				>
					<FileDown size={18} />
					{pdfExporting ? 'Generating...' : 'PDF'}
				</button>
			<button class="btn-secondary" onclick={() => (showSummary = true)}>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
					<line x1="9" y1="9" x2="15" y2="9"></line>
					<line x1="9" y1="15" x2="15" y2="15"></line>
				</svg>
				Day Summary
			</button>
			<button class="btn-secondary" onclick={() => (showComparison = !showComparison)}>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="3" width="7" height="7"></rect>
					<rect x="14" y="3" width="7" height="7"></rect>
					<rect x="14" y="14" width="7" height="7"></rect>
					<rect x="3" y="14" width="7" height="7"></rect>
				</svg>
				{showComparison ? 'Hide' : 'Compare'} Days
			</button>
			{/if}
			<a href="/dashboard/job-sites/{data.jobSite.id}/log/history" class="btn-secondary">
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
				<line x1="16" y1="2" x2="16" y2="6"></line>
				<line x1="8" y1="2" x2="8" y2="6"></line>
				<line x1="3" y1="10" x2="21" y2="10"></line>
			</svg>
			History
		</a>
		</div>
	</div>

	{#if showComparison && currentLog}
		<ComparativeDayView jobSiteId={data.jobSite.id} currentLogDate={viewedLog?.log_date ?? data.today} isLogClosed={!!currentLog?.closed_at} />
	{/if}

	{#if !isHistoricalView}
		<div class="completeness-bar-wrapper">
			<CompletenessBar state={todayState} />
		</div>
	{/if}

	{#if data.summary.total_distance_ft > 0}
		<div class="project-summary">
			<h3>Project to Date</h3>
			<div class="summary-stat">
				<span class="stat-value">{formatFeet(data.summary.total_distance_ft)}</span>
				<span class="stat-label">Distance</span>
			</div>
			<div class="summary-stat">
				<span class="stat-value">{data.summary.total_tons.toLocaleString()} tons</span>
				<span class="stat-label">Material Placed</span>
			</div>
			<div class="summary-stat">
				<span class="stat-value">{projectSummary.total_days} days</span>
				<span class="stat-label">Work Days</span>
			</div>
		</div>
	{/if}

	{#if !currentLog && !isHistoricalView}
		<div class="empty-state">
			<svg
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
				<line x1="12" y1="18" x2="12" y2="12"></line>
				<line x1="9" y1="15" x2="15" y2="15"></line>
			</svg>
			<h4>No log started for today</h4>
			<p>Start today's log to track production and site conditions</p>
			<button class="btn-primary" style="margin-top: 16px;" onclick={startLog}>
				Start Today's Log
			</button>
		</div>
	{:else if currentLog}
		{#if logDraft.current}
			<div class="draft-banner">
				<div class="draft-content">
					<span class="draft-icon">🧮</span>
					<div class="draft-text">
						<strong>Calculator result ready</strong>
						<p>{logDraft.current.summary}</p>
					</div>
				</div>
				<button class="btn-primary" onclick={fillFromCalculator}>Fill from Calculator</button>
			</div>
		{/if}

		<!-- Day Session ETA Widget -->
		<div class="eta-card">
			<div class="eta-card-header">
				<Clock size={18} />
				<span>Session Progress</span>
			</div>

			{#if percentComplete !== null}
				<div class="progress-bar">
					<div
						class="progress-fill"
						style="width: {percentComplete}%; background: {percentComplete >= 80 ? 'var(--good)' : 'var(--accent)'}"
					></div>
				</div>
			{/if}

			<div class="eta-stats">
				<div>
					<span>{formatFeet(todayPavingFt)}</span>
					{#if targetFt}
						<span style="color: var(--text-muted)"> / {formatFeet(targetFt)}</span>
					{/if}
				</div>
				{#if pavingRateFtPerHr > 0}
					<div class="eta-rate">
						{pavingRateFtPerHr.toFixed(0)} ft/hr
					</div>
				{/if}
			</div>

			{#if etaTime}
				<div class="eta-time">✓ ETA: Done by {etaTime}</div>
			{:else if targetFt === null}
				<div style="color: var(--text-muted); font-size: 0.85rem;">Set total length in job config for ETA</div>
			{:else if pavingRateFtPerHr === 0 && entries.length > 0}
				<div style="color: var(--text-muted); font-size: 0.85rem;">Set start time for rate calculation</div>
			{/if}
		</div>

		<section class="section">
			<h3>Site Conditions</h3>
			<div class="conditions-grid">
				<div class="field-compact">
					<label for="temp">Temp (°F)</label>
					<input type="number" id="temp" bind:value={currentLog.weather_temp_f} onblur={updateLog} disabled={isHistoricalView} />
				</div>
				<div class="field-compact">
					<label for="conditions">Conditions</label>
					<select id="conditions" bind:value={currentLog.weather_conditions} onchange={updateLog} disabled={isHistoricalView}>
						<option value={null}>—</option>
						<option value="clear">Clear</option>
						<option value="cloudy">Cloudy</option>
						<option value="rain">Rain</option>
						<option value="wind">Wind</option>
						<option value="fog">Fog</option>
					</select>
				</div>
				<div class="field-compact">
					<label for="wind">Wind (mph)</label>
					<input type="number" id="wind" bind:value={currentLog.wind_speed_mph} onblur={updateLog} disabled={isHistoricalView} />
				</div>
				<div class="field-compact">
					<label for="crew">Crew</label>
					<input type="number" id="crew" bind:value={currentLog.crew_count} onblur={updateLog} disabled={isHistoricalView} />
				</div>
				<div class="field-compact">
					<label for="start">Start</label>
					<TimeInput bind:value={currentLog.start_time} id="start" onchange={updateLog} disabled={isHistoricalView} />
				</div>
				<div class="field-compact">
					<label for="end">End</label>
					<TimeInput bind:value={currentLog.end_time} id="end" onchange={updateLog} disabled={isHistoricalView} />
				</div>
			</div>
		</section>

		{#if entrySummary.total_distance_ft > 0 || entrySummary.total_tons > 0}
			<div class="today-summary">
				<div class="summary-item">
					<span class="summary-label">Today</span>
					<span class="summary-value"
						>{formatFeet(entrySummary.total_distance_ft)} | {entrySummary.total_tons.toFixed(
							1
						)} tons | {entrySummary.total_loads} loads</span
					>
				</div>
			</div>
		{/if}

		<ComplianceGauge
			entries={entries}
			targetSpreadRate={(data.siteConfig as any)?.config?.target_spread_rate ?? null}
			courseType={(data.siteConfig as any)?.config?.course_type ?? null}
			overrides={orgSettingsStore.overrides}
		/>

		{#if currentLog}
			<NuclearGaugeLog
				logId={currentLog.id}
				jobSiteId={data.jobSite.id}
				targetDensityPcf={(data.siteConfig as any)?.config?.target_density_pcf ?? null}
				targetThicknessIn={(data.siteConfig as any)?.config?.target_thickness_in ?? null}
			/>
		{/if}

		{#if currentLog && !isHistoricalView}
			<StationProgressLogger
				jobSiteId={data.jobSite.id}
				logId={currentLog.id}
				waypoints={routeWaypoints}
				onLogged={loadLogDetails}
			/>
		{/if}

		<section class="section">
			<div class="section-header">
				<h3>Timeline</h3>
				{#if !isHistoricalView}
					<button class="btn-primary" onclick={openEntryForm}>+ Add Entry</button>
				{/if}
			</div>

			<FeatureDiscovery
				feature="photo"
				condition={entrySummary.total_loads >= 3 && !entries.some((e) => e.photo_url)}
			/>

			<FeatureDiscovery feature="closeout" condition={true} />

			{#if entries.length === 0}
				<div class="empty-state-small">
					<p>No entries yet.{#if !isHistoricalView} Tap the + button to add your first entry.{/if}</p>
					{#if !isHistoricalView}
						<button class="btn-primary" style="margin-top: 16px;" onclick={openEntryForm}>+ Add Entry</button>
					{/if}
				</div>
			{:else}
				<div class="timeline">
					{#each entries as entry}
						<div class="timeline-entry entry-type-{getEntryTypeColor(entry.entry_type)}">
							<div class="entry-time">{entry.timestamp}</div>
							<div class="entry-icon">{getEntryTypeIcon(entry.entry_type)}</div>
							<div class="entry-content">
								<div class="entry-header">
									<span class="entry-type">{entry.entry_type}</span>
									{#if entry.lane}
										<span class="entry-lane">{entry.lane}</span>
									{/if}
								</div>
								<div class="entry-details">
									{#if entry.station_start != null && entry.station_end != null}
										<span>Sta {entry.station_start.toFixed(2)} → {entry.station_end.toFixed(2)}</span
										>
									{/if}
									{#if entry.distance_ft}
										<span>{formatFeet(entry.distance_ft)}</span>
									{/if}
									{#if entry.tons_placed}
										<span>{entry.tons_placed.toFixed(1)} tons</span>
									{/if}
									{#if entry.loads_count}
										<span>{entry.loads_count} loads</span>
									{/if}
									{#if entry.tack_gallons}
										<span>{entry.tack_gallons.toFixed(1)} gal tack</span>
									{/if}
								</div>
								{#if entry.notes}
									<div class="entry-notes">{entry.notes}</div>
								{/if}
								{#if !isHistoricalView}
									<div class="entry-actions">
										<button class="btn-icon" onclick={() => editEntry(entry)}>Edit</button>
										<button class="btn-icon" onclick={() => deleteEntry(entry.id)}>Delete</button>
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

{#if currentLog && !showEntryForm && !isHistoricalView}
	<button class="fab" onclick={openEntryForm}>
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
			<line x1="12" y1="5" x2="12" y2="19"></line>
			<line x1="5" y1="12" x2="19" y2="12"></line>
		</svg>
	</button>
{/if}

{#if showEntryForm}
	<div class="modal-overlay" onclick={() => (showEntryForm = false)}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>{editingEntry ? 'Edit Entry' : 'Add Entry'}</h3>
				<button class="btn-icon" onclick={() => (showEntryForm = false)}>✕</button>
			</div>

			<div class="modal-body">
				<div class="field-compact">
					<label for="entry-type">Type</label>
					<select id="entry-type" bind:value={entryForm.entry_type}>
						<option value="paving">Paving</option>
						<option value="milling">Milling</option>
						<option value="tack">Tack</option>
						<option value="break">Break</option>
						<option value="delay">Delay</option>
						<option value="note">Note</option>
					</select>
				</div>

				<div class="field-compact">
					<label for="entry-time">Time</label>
					<TimeInput bind:value={entryForm.timestamp} id="entry-time" />
				</div>

				<div class="field-row">
					<div class="field-compact">
						<label for="sta-start">Station Start</label>
						<div class="input-with-gps">
							<input type="number" id="sta-start" bind:value={entryForm.station_start} step="0.01" />
							<GpsStationButton
								waypoints={routeWaypoints}
								label="GPS"
								compact
								onDetected={(sta) => {
									entryForm.station_start = sta;
								}}
							/>
						</div>
					</div>
					<div class="field-compact">
						<label for="sta-end">Station End</label>
						<div class="input-with-gps">
							<input type="number" id="sta-end" bind:value={entryForm.station_end} step="0.01" />
							<GpsStationButton
								waypoints={routeWaypoints}
								label="GPS"
								compact
								onDetected={(sta) => {
									entryForm.station_end = sta;
								}}
							/>
						</div>
					</div>
				</div>

				<div class="field-compact">
					<label for="distance">Distance (ft)</label>
					<input type="number" id="distance" bind:value={entryForm.distance_ft} />
				</div>

				<div class="field-row">
					<div class="field-compact">
						<label for="tons">Tons</label>
						<input type="number" id="tons" bind:value={entryForm.tons_placed} step="0.1" />
					</div>
					<div class="field-compact">
						<label for="loads">Loads</label>
						<input type="number" id="loads" bind:value={entryForm.loads_count} />
					</div>
				</div>

				<div class="field-row">
					<div class="field-compact">
						<label for="spread-rate">Spread Rate (lbs/SY)</label>
						<input type="number" id="spread-rate" bind:value={entryForm.spread_rate_actual} step="0.1" />
					</div>
					<div class="field-compact">
						<label for="tack">Tack (gallons)</label>
						<input type="number" id="tack" bind:value={entryForm.tack_gallons} step="0.1" />
					</div>
				</div>

				<div class="field-compact">
					<label for="lane">Lane</label>
					<input type="text" id="lane" bind:value={entryForm.lane} placeholder="e.g., left, right" />
				</div>

				<div class="field-compact">
					<label for="notes">Notes</label>
					<textarea id="notes" bind:value={entryForm.notes} rows="3"></textarea>
				</div>

				<div class="field-compact">
					<span class="field-label">Attach Photo</span>
					{#await import('$lib/components/PhotoCapture.svelte')}
						<span class="loading-hint">Loading...</span>
					{:then { default: PhotoCapture }}
						<PhotoCapture
							jobSiteId={data.jobSite.id}
							dailyLogId={currentLog?.id}
							onUploaded={handlePhotoUploaded}
							compact={false}
						/>
					{/await}
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn-secondary" onclick={() => (showEntryForm = false)}>Cancel</button>
				<button class="btn-primary" onclick={saveEntry}>
					{editingEntry ? 'Update' : 'Add'} Entry
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showCloseOut && currentLog}
	<CloseOutModal
		jobSiteId={data.jobSite.id}
		logId={currentLog.id}
		currentLog={currentLog}
		entries={entries}
		entrySummary={entrySummary}
		siteConfig={data.siteConfig}
		siteName={data.jobSite.name}
		onClose={() => (showCloseOut = false)}
		onComplete={handleCloseOutComplete}
	/>
{/if}

{#if showSummary && currentLog}
	<DailySummaryReport
		jobSiteId={data.jobSite.id}
		log={currentLog}
		onClose={() => (showSummary = false)}
		onGeneratePDF={exportLogPDF}
	/>
{/if}

<style>
	.dashboard {
		width: 100%;
		padding-bottom: calc(80px + env(safe-area-inset-bottom));
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 16px;
	}

	.breadcrumb a {
		color: var(--text-muted);
		transition: color 0.2s;
	}

	.eta-card {
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.eta-card-header {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.progress-bar {
		height: 8px;
		background: var(--surface-alt);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.5s ease;
	}

	.eta-stats {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.9rem;
	}

	.eta-rate {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.eta-time {
		color: var(--good);
		font-weight: 600;
		font-size: 0.9rem;
	}

	.draft-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		background: var(--surface);
		border: 2px solid var(--accent);
		border-radius: var(--radius);
		padding: 16px;
		margin-bottom: 24px;
	}

	.draft-content {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		min-width: 0;
	}

	.draft-icon {
		font-size: 2rem;
		flex-shrink: 0;
	}

	.draft-text {
		flex: 1;
		min-width: 0;
	}

	.draft-text strong {
		display: block;
		margin-bottom: 4px;
		font-size: 1rem;
	}

	.draft-text p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.breadcrumb a:hover {
		color: var(--accent);
	}

	.breadcrumb svg {
		width: 14px;
		height: 14px;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 24px;
	}

	.page-header-actions {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-shrink: 0;
	}

	.btn-pdf {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 14px;
	}

	.page-title {
		font-size: 1.75rem;
		margin: 0 0 4px;
	}

	.page-subtitle {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 20px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.btn-primary:hover {
		opacity: 0.9;
	}

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 20px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-secondary:hover {
		background: var(--surface-alt);
	}

	.btn-icon {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.85rem;
		cursor: pointer;
		padding: 4px 8px;
	}

	.btn-icon:hover {
		color: var(--accent);
	}

	.project-summary {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 24px;
	}

	.project-summary h3 {
		margin: 0 0 16px;
		font-size: 1rem;
		color: var(--text-muted);
	}

	.summary-stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--accent);
	}

	.stat-label {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.empty-state {
		text-align: center;
		padding: 48px 20px;
		color: var(--text-muted);
	}

	.empty-state svg {
		opacity: 0.5;
		margin-bottom: 16px;
	}

	.empty-state h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		color: var(--text);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
	}

	.empty-state-small {
		text-align: center;
		padding: 32px 20px;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.section {
		margin-bottom: 32px;
	}

	.section h3 {
		margin: 0 0 16px;
		font-size: 1.2rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.conditions-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	.field-compact {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-compact label,
	.field-compact .field-label {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.field-compact input,
	.field-compact select,
	.field-compact textarea {
		min-height: 48px;
		padding: 0 12px;
		font-size: 1rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
	}

	.field-compact textarea {
		padding: 12px;
		resize: vertical;
		font-family: inherit;
	}

	.field-row {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	.input-with-gps {
		display: flex;
		gap: 6px;
		align-items: stretch;
	}

	.input-with-gps input {
		flex: 1;
		min-width: 0;
	}

	.today-summary {
		background: var(--good);
		color: var(--accent-text);
		border-radius: var(--radius);
		padding: 16px;
		margin-bottom: 24px;
		font-weight: 600;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.summary-label {
		font-size: 0.8rem;
		opacity: 0.9;
	}

	.summary-value {
		font-size: 1rem;
	}

	.timeline {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.timeline-entry {
		display: grid;
		grid-template-columns: 60px 40px 1fr;
		gap: 12px;
		align-items: start;
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 4px solid var(--accent);
		border-radius: var(--radius);
	}

	.entry-type-green {
		border-left-color: var(--good);
	}

	.entry-type-blue {
		border-left-color: #3b82f6;
	}

	.entry-type-cyan {
		border-left-color: #06b6d4;
	}

	.entry-type-gray {
		border-left-color: var(--text-muted);
	}

	.entry-type-red {
		border-left-color: #ef4444;
	}

	.entry-type-yellow {
		border-left-color: #eab308;
	}

	.entry-time {
		font-size: 0.85rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.entry-icon {
		font-size: 1.5rem;
	}

	.entry-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.entry-header {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.entry-type {
		font-weight: 600;
		text-transform: capitalize;
	}

	.entry-lane {
		font-size: 0.75rem;
		padding: 2px 8px;
		background: var(--surface-alt);
		border-radius: 999px;
		color: var(--text-muted);
	}

	.entry-details {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.entry-details span {
		white-space: nowrap;
	}

	.entry-notes {
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.entry-actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}

	.fab {
		position: fixed;
		bottom: calc(24px + env(safe-area-inset-bottom));
		right: 24px;
		width: 56px;
		height: 56px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: 50%;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.2s;
	}

	.fab:hover {
		transform: scale(1.05);
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: flex-end;
		z-index: 1000;
		padding: 0;
	}

	.modal {
		width: 100%;
		max-width: var(--maxw);
		margin: 0 auto;
		background: var(--bg);
		border-radius: var(--radius) var(--radius) 0 0;
		max-height: 90vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid var(--border);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.3rem;
	}

	.modal-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.modal-footer {
		display: flex;
		gap: 12px;
		padding: 20px;
		border-top: 1px solid var(--border);
	}

	.modal-footer .btn-secondary {
		flex: 1;
	}

	.modal-footer .btn-primary {
		flex: 2;
	}

	.date-nav {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		margin-bottom: 12px;
		flex-wrap: wrap;
		position: relative;
	}

	.date-nav-arrow {
		min-height: 48px;
		min-width: 56px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		font-size: 0.9rem;
		padding: 0 12px;
		transition: background 0.2s;
	}

	.date-nav-arrow:hover {
		background: var(--surface-alt);
	}

	.date-nav-arrow.disabled {
		opacity: 0.35;
		pointer-events: none;
	}

	.date-nav-current {
		flex: 1;
		text-align: center;
		font-weight: 600;
		font-size: 0.95rem;
		min-width: 120px;
	}

	.date-nav-calendar {
		min-height: 48px;
		min-width: 48px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		transition: background 0.2s, color 0.2s;
	}

	.date-nav-calendar:hover {
		background: var(--surface-alt);
		color: var(--accent);
	}

	.calendar-picker-popover {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		background: var(--bg-card, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 100;
		margin-top: 4px;
	}

	.calendar-picker-input {
		min-height: 48px;
		padding: 0 12px;
		font-size: 1rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		cursor: pointer;
	}

	.calendar-picker-input::-webkit-calendar-picker-indicator {
		filter: invert(0.7);
		cursor: pointer;
	}

	.date-nav-today {
		min-height: 48px;
		display: inline-flex;
		align-items: center;
		padding: 0 16px;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		text-decoration: none;
		transition: opacity 0.2s;
	}

	.date-nav-today:hover {
		opacity: 0.9;
	}

	.history-banner {
		background: rgba(245, 158, 11, 0.12);
		color: #f59e0b;
		border: 1px solid rgba(245, 158, 11, 0.3);
		border-radius: var(--radius);
		padding: 12px 16px;
		margin-bottom: 16px;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.closed-banner {
		background: rgba(16, 185, 129, 0.12);
		border: 1px solid rgba(16, 185, 129, 0.3);
		border-radius: var(--radius);
		padding: 16px;
		margin-bottom: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.closed-content {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--good, #10b981);
	}

	.btn-unlock {
		background: var(--warning, #f59e0b);
		color: var(--bg-dark, #0f172a);
		border: none;
		border-radius: var(--radius);
		padding: 8px 16px;
		min-height: 48px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.2s;
	}

	.btn-unlock:hover:not(:disabled) {
		background: var(--warning-hover, #d97706);
		transform: scale(1.02);
	}

	.btn-unlock:active:not(:disabled) {
		transform: scale(0.98);
	}

	.btn-unlock:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.closed-content svg {
		flex-shrink: 0;
	}

	.closed-content strong {
		display: block;
		font-size: 0.95rem;
		margin-bottom: 4px;
	}

	.closed-content p {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.completeness-bar-wrapper {
		margin-bottom: 24px;
	}

	@media (min-width: 768px) {
		.modal-overlay {
			align-items: center;
		}

		.modal {
			border-radius: var(--radius);
			max-height: 80vh;
		}

		.conditions-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
