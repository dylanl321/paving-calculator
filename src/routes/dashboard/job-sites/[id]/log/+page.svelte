<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { config, spreadSpecCheck, spreadToleranceFor } from '$lib/config';
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
	import DailyRunningTotalBanner from '$lib/components/DailyRunningTotalBanner.svelte';
	import { today } from '$lib/stores/today.svelte';
	import { confirmStore } from '$lib/stores/confirm.svelte';
	import SignatureModal from '$lib/components/SignatureModal.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';
	import ProjectContextBar from '$lib/components/ProjectContextBar.svelte';

	let { data }: { data: PageData } = $props();

	const projectSummary = $derived(data.summary as typeof data.summary & { total_days?: number });

	// Auto-derived project context (read-only) — surface config so the user
	// never re-enters per-day what the project already defines.
	const cfg = $derived((data.siteConfig as any)?.config ?? null);

	// Persistent project context bar — shares the same wayfinding strip as the
	// project detail page. Values degrade to nothing when absent.
	const ctxTodayLogState = $derived.by(() => {
		const log = data.todayLog;
		if (!log) return 'Not started';
		return (log as { closed_at?: number | null }).closed_at ? 'Closed' : 'Logging';
	});
	const ctxSetupScore = $derived.by(() => {
		if (!cfg) return null;
		const required = [
			'road_type',
			'num_lanes',
			'lane_width_ft',
			'total_length_ft',
			'scope_of_work',
			'mix_type',
			'target_thickness_in',
			'target_spread_rate'
		];
		const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || v === 0;
		let filled = 0;
		for (const f of required) if (!isEmpty(cfg[f])) filled++;
		// +2 for name/status, which always exist on a loaded project.
		return Math.round(((filled + 2) / (required.length + 2)) * 100);
	});
	const projectContext = $derived.by(() => {
		if (!cfg) return [] as { label: string; value: string }[];
		const items: { label: string; value: string }[] = [];
		if (cfg.mix_type) items.push({ label: 'Mix', value: String(cfg.mix_type) });
		if (cfg.target_spread_rate != null)
			items.push({ label: 'Target rate', value: `${cfg.target_spread_rate} lbs/SY` });
		if (cfg.target_thickness_in != null)
			items.push({ label: 'Thickness', value: `${cfg.target_thickness_in}"` });
		if (cfg.lane_width_ft != null)
			items.push({ label: 'Lane width', value: `${cfg.lane_width_ft} ft` });
		if (cfg.total_length_ft != null)
			items.push({ label: 'Total length', value: formatFeet(cfg.total_length_ft) });
		return items;
	});

	// Progressive disclosure — keep secondary tools collapsed by default so the
	// page reads top-to-bottom as: today's context → record a pass → entries.
	let showQc = $state(false);
	let showActions = $state(false);

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
	// svelte-ignore state_referenced_locally
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
	let showSignatureModal = $state(false);

	let isAdmin = $derived(
		data.userRole === 'owner' || data.userRole === 'admin' || data.isGlobalAdmin
	);

	// Route waypoints for GPS station detection
	let routeWaypoints = $state<RouteWaypoint[]>([]);

	async function loadRoute() {
		try {
			const { waypoints } = await api.get<RouteResponse>(`/api/job-sites/${data.jobSite.id}/route`);
			routeWaypoints = Array.isArray(waypoints) ? waypoints : [];
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
		try {
			const result = await api.get<LogDetailsResponse>(`/api/job-sites/${data.jobSite.id}/logs/${viewedLog.id}`);
			entries = result.entries;
			entrySummary = result.summary;
		} catch (e) {
			console.error('Failed to load log details:', e);
		}
	}

	async function startLog() {
		try {
			const { log } = await api.post<LogResponse>(`/api/job-sites/${data.jobSite.id}/logs`, {});
			currentLog = log;
			await invalidateAll();
			toastStore.success('Log started successfully');
		} catch (e) {
			// api.post already shows toast on error
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
		try {
			await api.patch(`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}`, updates);
			await loadLogDetails();
			toastStore.success('Log updated');
		} catch (err: any) {
			if (err.status === 423) {
				toastStore.error('This day is locked after close-out. Ask an admin to unlock it.');
			}
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

		// Auto-compute spread_rate_actual for paving entries when not manually set
		const payload = { ...entryForm };
		if (
			payload.entry_type === 'paving' &&
			payload.spread_rate_actual == null &&
			payload.tons_placed != null &&
			payload.tons_placed > 0
		) {
			const distFt =
				payload.distance_ft ??
				(payload.station_start != null && payload.station_end != null
					? (payload.station_end - payload.station_start) * 100
					: null);
			const widthFt = (data.siteConfig as any)?.config?.lane_width_ft || 12;
			if (distFt != null && distFt > 0) {
				payload.spread_rate_actual = actualSpreadRate({
					tons: payload.tons_placed,
					distanceFt: distFt,
					widthFt
				});
			}
		}

		try {
			if (editingEntry) {
				await api.patch(
					`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/entries/${editingEntry.id}`,
					payload
				);
				showEntryForm = false;
				await loadLogDetails();
				toastStore.success('Entry updated');
			} else {
				await api.post(`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/entries`, payload);
				showEntryForm = false;
				await loadLogDetails();
				toastStore.success('Entry added');
			}
		} catch (err: any) {
			if (err.status === 423) {
				toastStore.error('This day is locked after close-out. Ask an admin to unlock it.');
			}
		}
	}

	async function deleteEntry(entryId: string) {
		const confirmed = await confirmStore.ask({
			title: 'Delete Entry',
			message: 'Delete this entry? This cannot be undone.',
			confirmLabel: 'Delete',
			destructive: true
		});
		if (!confirmed) return;
		try {
			await api.delete(`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/entries/${entryId}`);
			await loadLogDetails();
			toastStore.success('Entry deleted');
		} catch (err: any) {
			if (err.status === 423) {
				toastStore.error('This day is locked after close-out. Ask an admin to unlock it.');
			}
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

	async function exportLogPDF(signatureDataUrl?: string) {
		if (!currentLog) return;
		pdfExporting = true;
		try {
			const { generateDailyReportPDF } = await import('$lib/utils/pdf-export');

			let loads: any[] = [];
			try {
				const currentDate = currentLog.log_date;
				const loadData = await api.get<LoadsResponse>(`/api/job-sites/${data.jobSite.id}/loads?start_date=${currentDate}`);
				loads = loadData.loads || [];
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

			// Compute compliance stats
			const courseType = (data.siteConfig as any)?.config?.course_type || null;
			const pavingEntries = entries.filter((e: any) => e.entry_type === 'paving' && e.spread_rate_actual != null);
			let goodCount = 0;
			let warnCount = 0;
			let badCount = 0;

			for (const entry of pavingEntries) {
				const check = spreadSpecCheck(
					entry.spread_rate_actual,
					targetRate,
					courseType,
					orgSettingsStore.overrides
				);
				if (check) {
					if (check.status === 'good') goodCount++;
					else if (check.status === 'warn') warnCount++;
					else if (check.status === 'bad') badCount++;
				}
			}

			const totalPavingEntries = pavingEntries.length;
			const pctInSpec = totalPavingEntries > 0 ? (goodCount / totalPavingEntries) * 100 : 0;
			const tolerance = spreadToleranceFor(courseType, orgSettingsStore.overrides);

			const compliance = totalPavingEntries > 0 ? {
				targetSpreadRate: targetRate,
				courseType: tolerance.label,
				totalPavingEntries,
				goodCount,
				warnCount,
				badCount,
				pctInSpec,
				toleranceLbsSy: tolerance.toleranceLbsSy
			} : null;

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
					orgName: (data as any).org?.name ?? undefined,
					gdotProjectNumber: (data as any).jobSite?.project_number ?? null,
					gdotCounty:
						(data as any).jobSite?.gdot_county ||
						(data.siteConfig as any)?.config?.route_county ||
						null,
					gdotRoute: (data.siteConfig as any)?.config?.route_designation ?? null,
					gdotContractor: (data as any).org?.name ?? null,
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
					compliance,
					loads: loads.map((l: any) => ({
						id: l.id,
						ticket_number: l.ticket_number,
						tons: l.tons,
						timestamp: l.timestamp,
						spread_rate: l.spread_rate,
						notes: l.notes
					}))
				},
				signatureDataUrl
			);
		} catch (err) {
			console.error('PDF export failed:', err);
		} finally {
			pdfExporting = false;
		}
	}

	function handleSignAndExport(signatureDataUrl: string) {
		showSignatureModal = false;
		exportLogPDF(signatureDataUrl);
	}

	async function unlockLog() {
		if (!currentLog) return;
		unlocking = true;
		try {
			const { log } = await api.post<LogResponse>(`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/unlock`, {});
			currentLog = log;
			await invalidateAll();
			toastStore.success('Log unlocked successfully');
		} catch (err) {
			// api.post already shows toast on error
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

	<ProjectContextBar
		name={data.jobSite.name}
		status={data.jobSite.status}
		href="/dashboard/job-sites/{data.jobSite.id}"
		contractValue={cfg?.total_contract_value ?? null}
		routeDesignation={cfg?.route_designation ?? null}
		county={cfg?.route_county ?? null}
		todayLogState={ctxTodayLogState}
		setupScore={ctxSetupScore}
	/>

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
			<div class="calendar-picker-popover" role="dialog" aria-label="Select date" tabindex="-1" onkeydown={handleCalendarKeydown}>
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

	{#if currentLog && entries.length > 0}
		<DailyRunningTotalBanner
			totalTons={entrySummary.total_tons}
			totalLf={todayPavingFt}
			entryCount={entries.length}
			targetTons={currentLog.target_tons ?? null}
		/>
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
				<div class="more-actions">
					<button
						class="btn-secondary more-actions-toggle"
						aria-expanded={showActions}
						onclick={() => (showActions = !showActions)}
					>
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
							<circle cx="12" cy="12" r="1"></circle>
							<circle cx="19" cy="12" r="1"></circle>
							<circle cx="5" cy="12" r="1"></circle>
						</svg>
						More
					</button>
					{#if showActions}
						<div class="more-actions-menu" role="menu">
							<button class="more-action-item" onclick={() => { exportLogPDF(); showActions = false; }} disabled={pdfExporting}>
								<FileDown size={18} />
								{pdfExporting ? 'Generating…' : 'Download PDF'}
							</button>
							<button class="more-action-item" onclick={() => { showSignatureModal = true; showActions = false; }} disabled={pdfExporting}>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
								</svg>
								Sign &amp; Export
							</button>
							<button class="more-action-item" onclick={() => { showSummary = true; showActions = false; }}>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
									<line x1="9" y1="9" x2="15" y2="9"></line>
									<line x1="9" y1="15" x2="15" y2="15"></line>
								</svg>
								Day Summary
							</button>
							<button class="more-action-item" onclick={() => { showComparison = !showComparison; showActions = false; }}>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<rect x="3" y="3" width="7" height="7"></rect>
									<rect x="14" y="3" width="7" height="7"></rect>
									<rect x="14" y="14" width="7" height="7"></rect>
									<rect x="3" y="14" width="7" height="7"></rect>
								</svg>
								{showComparison ? 'Hide comparison' : 'Compare days'}
							</button>
							<a class="more-action-item" href="/dashboard/job-sites/{data.jobSite.id}/log/history">
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
									<line x1="16" y1="2" x2="16" y2="6"></line>
									<line x1="8" y1="2" x2="8" y2="6"></line>
									<line x1="3" y1="10" x2="21" y2="10"></line>
								</svg>
								Full history
							</a>
						</div>
					{/if}
				</div>
			{:else}
				<a href="/dashboard/job-sites/{data.jobSite.id}/log/history" class="btn-secondary">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
						<line x1="16" y1="2" x2="16" y2="6"></line>
						<line x1="8" y1="2" x2="8" y2="6"></line>
						<line x1="3" y1="10" x2="21" y2="10"></line>
					</svg>
					History
				</a>
			{/if}
		</div>
	</div>

	{#if showComparison && currentLog}
		<ComparativeDayView jobSiteId={data.jobSite.id} currentLogDate={viewedLog?.log_date ?? data.today} isLogClosed={!!currentLog?.closed_at} />
	{/if}

	{#if !isHistoricalView}
		<div class="completeness-bar-wrapper">
			<CompletenessBar data={todayState} />
		</div>
	{/if}

	{#if projectContext.length > 0}
		<div class="project-context" aria-label="Project settings (read only)">
			<span class="project-context-label">Project</span>
			<div class="project-context-chips">
				{#each projectContext as item}
					<span class="context-chip">
						<span class="context-chip-label">{item.label}</span>
						<span class="context-chip-value">{item.value}</span>
					</span>
				{/each}
			</div>
			<a class="project-context-edit" href="/dashboard/job-sites/{data.jobSite.id}?tab=config">Edit</a>
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
			<div class="section-intro">
				<h3>Site Conditions</h3>
				<p class="section-hint">Logged once per day. Auto-filled from weather when available.</p>
			</div>
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

		{#if currentLog && !isHistoricalView}
			<StationProgressLogger
				jobSiteId={data.jobSite.id}
				logId={currentLog.id}
				waypoints={routeWaypoints}
				onLogged={loadLogDetails}
			/>
		{/if}

		<section class="section qc-section">
			<button
				class="qc-toggle"
				aria-expanded={showQc}
				onclick={() => (showQc = !showQc)}
			>
				<span class="qc-toggle-label">
					<Droplets size={18} />
					Quality Control
					<span class="qc-toggle-sub">Spread-rate compliance &amp; nuclear density</span>
				</span>
				<svg
					class="qc-chevron"
					class:open={showQc}
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="6 9 12 15 18 9"></polyline>
				</svg>
			</button>

			{#if showQc}
				<div class="qc-body">
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
				</div>
			{/if}
		</section>

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
											{#if entry.entry_type === 'paving' && entry.spread_rate_actual != null}
												{@const targetRate = (data.siteConfig as any)?.config?.target_spread_rate ?? null}
												{@const courseType = (data.siteConfig as any)?.config?.course_type ?? null}
												{@const check = spreadSpecCheck(entry.spread_rate_actual, targetRate, courseType, orgSettingsStore.overrides)}
												<span
													class="spread-rate-badge spread-rate-{check ? check.status : 'neutral'}"
													title={check ? check.message : 'No target set'}
												>
													{entry.spread_rate_actual.toFixed(0)} lbs/SY{check ? (check.status === 'good' ? ' ✓' : check.status === 'warn' ? ' ⚠' : ' ✗') : ''}
												</span>
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
	<button class="fab" aria-label="Add log entry" onclick={openEntryForm}>
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
	<div
		class="modal-overlay"
		role="button"
		tabindex="-1"
		aria-label="Close dialog"
		onclick={() => (showEntryForm = false)}
		onkeydown={(e) => { if (e.key === 'Escape') showEntryForm = false; }}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>{editingEntry ? 'Edit Entry' : 'Add Entry'}</h3>
				<button class="btn-icon" onclick={() => (showEntryForm = false)}>✕</button>
			</div>

			<div class="modal-body">
				<div class="entry-form-grid">
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

					<div class="field-compact">
						<label for="distance">Distance (ft)</label>
						<input type="number" id="distance" bind:value={entryForm.distance_ft} />
					</div>

					<div class="field-compact">
						<label for="tons">Tons</label>
						<input type="number" id="tons" bind:value={entryForm.tons_placed} step="0.1" />
					</div>
					<div class="field-compact">
						<label for="loads">Loads</label>
						<input type="number" id="loads" bind:value={entryForm.loads_count} />
					</div>

					<div class="field-compact">
						<label for="spread-rate">Spread Rate (lbs/SY)</label>
						<input type="number" id="spread-rate" bind:value={entryForm.spread_rate_actual} step="0.1" />
						{#if entryForm.entry_type === 'paving' && entryForm.spread_rate_actual == null}
							{@const previewDist = entryForm.distance_ft ?? (entryForm.station_start != null && entryForm.station_end != null ? (entryForm.station_end - entryForm.station_start) * 100 : null)}
							{@const previewWidth = (data.siteConfig as any)?.config?.lane_width_ft || 12}
							{#if entryForm.tons_placed != null && entryForm.tons_placed > 0 && previewDist != null && previewDist > 0}
								{@const previewRate = actualSpreadRate({ tons: entryForm.tons_placed, distanceFt: previewDist, widthFt: previewWidth })}
								{@const targetRate = (data.siteConfig as any)?.config?.target_spread_rate ?? null}
								{@const courseType = (data.siteConfig as any)?.config?.course_type ?? null}
								{@const previewCheck = spreadSpecCheck(previewRate, targetRate, courseType, orgSettingsStore.overrides)}
								<div class="spread-rate-preview">
									Auto: <span class="spread-rate-badge spread-rate-{previewCheck ? previewCheck.status : 'neutral'}">
										{previewRate.toFixed(0)} lbs/SY{previewCheck ? (previewCheck.status === 'good' ? ' ✓' : previewCheck.status === 'warn' ? ' ⚠' : ' ✗') : ''}
									</span>
								</div>
							{/if}
						{/if}
					</div>
					<div class="field-compact">
						<label for="tack">Tack (gallons)</label>
						<input type="number" id="tack" bind:value={entryForm.tack_gallons} step="0.1" />
					</div>

					<div class="field-compact">
						<label for="lane">Lane</label>
						<input type="text" id="lane" bind:value={entryForm.lane} placeholder="e.g., left, right" />
					</div>
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
		orgName={(data as any).org?.name ?? null}
		jobSite={data.jobSite}
		onClose={() => (showCloseOut = false)}
		onComplete={handleCloseOutComplete}
	/>
{/if}

{#if showSummary && currentLog}
	<DailySummaryReport
		jobSiteId={data.jobSite.id}
		log={currentLog}
		onClose={() => (showSummary = false)}
		onGeneratePDF={() => exportLogPDF()}
	/>
{/if}

{#if showSignatureModal}
	<SignatureModal
		onConfirm={handleSignAndExport}
		onCancel={() => (showSignatureModal = false)}
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
		border-left-color: var(--accent);
	}

	.entry-type-cyan {
		border-left-color: color-mix(in srgb, var(--accent) 70%, var(--good));
	}

	.entry-type-gray {
		border-left-color: var(--text-muted);
	}

	.entry-type-red {
		border-left-color: var(--bad);
	}

	.entry-type-yellow {
		border-left-color: var(--warn);
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

	.spread-rate-badge {
		display: inline-flex;
		align-items: center;
		padding: 1px 7px;
		border-radius: 10px;
		font-size: 0.78rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.spread-rate-good {
		background: color-mix(in srgb, var(--good) 18%, transparent);
		color: var(--good);
		border: 1px solid color-mix(in srgb, var(--good) 35%, transparent);
	}

	.spread-rate-warn {
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
		border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
	}

	.spread-rate-bad {
		background: color-mix(in srgb, var(--bad) 18%, transparent);
		color: var(--bad);
		border: 1px solid color-mix(in srgb, var(--bad) 35%, transparent);
	}

	.spread-rate-neutral {
		background: var(--surface-alt);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.spread-rate-preview {
		margin-top: 5px;
		font-size: 0.8rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 5px;
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
		box-shadow: var(--shadow-md);
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
		box-shadow: var(--shadow-md);
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
		background: color-mix(in srgb, var(--warn) 12%, transparent);
		color: var(--warn);
		border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
		border-radius: var(--radius);
		padding: 12px 16px;
		margin-bottom: 16px;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.closed-banner {
		background: color-mix(in srgb, var(--good) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--good) 30%, transparent);
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
		color: var(--good);
	}

	.btn-unlock {
		background: var(--warn);
		color: var(--accent-text);
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
		background: color-mix(in srgb, var(--warn) 85%, black);
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

	/* Read-only project context strip */
	.project-context {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px 16px;
		margin-bottom: 16px;
	}

	.project-context-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.project-context-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}

	.context-chip {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		padding: 4px 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 999px;
		white-space: nowrap;
	}

	.context-chip-label {
		font-size: 0.72rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.context-chip-value {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
	}

	.project-context-edit {
		flex-shrink: 0;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--accent);
		text-decoration: none;
		padding: 6px 4px;
	}

	.project-context-edit:hover {
		text-decoration: underline;
	}

	/* More-actions overflow menu */
	.more-actions {
		position: relative;
	}

	.more-actions-toggle {
		padding: 0 14px;
	}

	.more-actions-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 50;
		min-width: 220px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow-lg);
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.more-action-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 48px;
		padding: 0 12px;
		background: none;
		border: none;
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 500;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition: background 0.15s;
	}

	.more-action-item:hover:not(:disabled) {
		background: var(--surface-alt);
	}

	.more-action-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Section intro */
	.section-intro {
		margin-bottom: 16px;
	}

	.section-intro h3 {
		margin: 0 0 2px;
		font-size: 1.2rem;
	}

	.section-hint {
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	/* Collapsible QC section */
	.qc-section {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0;
		overflow: hidden;
	}

	.qc-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		min-height: 56px;
		padding: 14px 18px;
		background: none;
		border: none;
		color: var(--text);
		cursor: pointer;
		text-align: left;
	}

	.qc-toggle-label {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 1.05rem;
		font-weight: 600;
		flex-wrap: wrap;
	}

	.qc-toggle-sub {
		font-size: 0.78rem;
		font-weight: 400;
		color: var(--text-muted);
	}

	.qc-chevron {
		flex-shrink: 0;
		color: var(--text-muted);
		transition: transform 0.2s;
	}

	.qc-chevron.open {
		transform: rotate(180deg);
	}

	.qc-body {
		padding: 0 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.entry-form-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-md);
	}

	@media (min-width: 640px) {
		.entry-form-grid {
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		}
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
