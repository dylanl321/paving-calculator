<script lang="ts" module>
	export type WorkspaceMode = 'view' | 'route' | 'sections' | 'termini';
</script>

<script lang="ts">
	/**
	 * ProjectMapWorkspace — ONE shared <MapView> per project with a mode switcher
	 * (View / Edit Route / Sections / Termini). Instead of stacking four separate
	 * maps (each lazy-loading MapLibre and refetching tiles), this hosts a single
	 * map and mounts the three 4a editing controllers behind it; exactly one is
	 * `active` at a time (driven by `mode`), and View activates none.
	 *
	 * All three controllers render their layers regardless of `active` (route
	 * polyline + buffer, section lines, terminus markers), so switching modes only
	 * toggles interactivity — no per-mode remount/tile jank. Chrome (toolbars,
	 * section panel, terminus toggles) lives here and is driven through each
	 * controller's `bind:api`.
	 *
	 * Coordinates: props are [lat,lng]; stored geometry is GeoJSON [lng,lat].
	 * Roads-only by design — the controllers reject off-road clicks.
	 */
	import { browser } from '$app/environment';
	import { MapView, MapStatus } from '$lib/components/map-v2';
	import {
		RouteEditController,
		SectionEditController,
		TerminusEditController,
		type RouteEditApi,
		type SectionEditApi,
		type TerminusEditApi,
		type RoadSection,
		type AutoSplitSegment,
		type SectionRoadwayLogEvent
	} from '$lib/components/map-v2/editors';
	import Button from '$lib/components/ui/Button.svelte';
	import { polylineLengthFt } from '$lib/services/mapUtils';
	import { formatStation } from '$lib/services/gpsStation';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface Props {
		siteId: string;
		/** Stored route alignment ([lat,lng]). */
		waypoints?: Waypoint[];
		numLanes?: number | null;
		laneWidthFt?: number | null;
		totalLengthFt?: number | null;
		roadwayLogEvents?: SectionRoadwayLogEvent[];
		/** Begin/end project limits (station offsets along the route). */
		beginStation?: number | null;
		endStation?: number | null;
		beginLabel?: string | null;
		endLabel?: string | null;
		height?: string;
		/** Two-way bindable active mode (lets a parent deep-link / preset it). */
		mode?: WorkspaceMode;
		/** Persist the drawn route alignment. */
		onRouteSave?: (waypoints: Waypoint[]) => Promise<void>;
		/** Fired as the editable route changes (draw/undo/clear/flip). */
		onRouteChange?: (waypoints: Waypoint[]) => void;
		/** Persist a terminus pick (begin/end + station). */
		onTerminusPick?: (field: 'begin' | 'end', station: number) => void;
		/** Fired when the loaded section list changes. */
		onSectionsChange?: (sections: RoadSection[]) => void;
	}

	let {
		siteId,
		waypoints = [],
		numLanes = null,
		laneWidthFt = null,
		totalLengthFt = null,
		roadwayLogEvents = [],
		beginStation = $bindable(null),
		endStation = $bindable(null),
		beginLabel = null,
		endLabel = null,
		height = '440px',
		mode = $bindable('view'),
		onRouteSave,
		onRouteChange,
		onTerminusPick,
		onSectionsChange
	}: Props = $props();

	const isMobile = $derived(
		browser && typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
	);

	const hasRoute = $derived(waypoints.length >= 2);

	// Controller handles — one per editor; chrome reads/drives these.
	let routeApi = $state<RouteEditApi | null>(null);
	let sectionApi = $state<SectionEditApi | null>(null);
	let terminusApi = $state<TerminusEditApi | null>(null);

	// Mirror of the controller's editable alignment for chrome stats (length).
	// svelte-ignore state_referenced_locally
	let liveWaypoints = $state<Waypoint[]>([...waypoints]);
	function handleRouteChange(next: Waypoint[]) {
		liveWaypoints = next;
		onRouteChange?.(next);
	}

	// ── route chrome ──────────────────────────────────────────────────────────
	const routeDrawMode = $derived(routeApi?.drawMode ?? false);
	const routeSaving = $derived(routeApi?.saving ?? false);
	const routeSnapping = $derived(routeApi?.snapping ?? false);
	const routeSnapError = $derived(routeApi?.snapError ?? '');
	const routeControlPoints = $derived(routeApi?.controlPoints.length ?? 0);
	const liveLengthFt = $derived(polylineLengthFt(liveWaypoints));

	// ── section chrome ──────────────────────────────────────────────────────────
	const sections = $derived<RoadSection[]>(sectionApi?.sections ?? []);
	const sectionDrawMode = $derived(sectionApi?.drawMode ?? 'idle');
	const sectionFlash = $derived(sectionApi?.flashMessage ?? '');
	const cursorStation = $derived(sectionApi?.cursorStation ?? null);
	const cursorPosition = $derived(sectionApi?.cursorPosition ?? null);
	let plannedLengthFt = $state<number | null>(null);
	let plannedLayerLabel = $state('');
	let plannedMixId = $state('');
	let showAutoSplitModal = $state(false);
	let autoSplitPreview = $state<AutoSplitSegment[]>([]);
	const canAutoSplit = $derived(
		roadwayLogEvents.some(
			(e) => e.event_type === 'width_change' || e.event_type === 'operation_change'
		)
	);

	const SECTION_STATUS_COLORS = {
		active: '#f59e0b',
		completed: '#22c55e',
		skipped: '#6b7280'
	} as const;

	// ── terminus chrome ──────────────────────────────────────────────────────────
	const terminusActiveField = $derived(terminusApi?.activeField ?? 'begin');
	const terminusFlash = $derived(terminusApi?.flashMessage ?? '');
	const terminusSummary = $derived.by(() => {
		if (beginStation == null || endStation == null) return '';
		const distFt = Math.abs(endStation - beginStation) * 100;
		return `Start ${formatStation(beginStation)} → End ${formatStation(endStation)} (${distFt.toFixed(0)} ft)`;
	});

	const MODES: { id: WorkspaceMode; label: string; needsRoute: boolean }[] = [
		{ id: 'view', label: 'View', needsRoute: false },
		{ id: 'route', label: 'Edit Route', needsRoute: false },
		{ id: 'sections', label: 'Sections', needsRoute: true },
		{ id: 'termini', label: 'Termini', needsRoute: true }
	];

	function setMode(next: WorkspaceMode) {
		mode = next;
	}

	const mapCenter = $derived<[number, number]>(
		waypoints.length > 0 ? [waypoints[0].lat, waypoints[0].lng] : [33.749, -84.388]
	);

	// Route action delegates.
	function toggleRouteDraw() {
		routeApi?.toggleDrawMode();
	}
	function addRoutePoint() {
		routeApi?.addPointAtCenter();
	}
	function undoRoutePoint() {
		routeApi?.undoLastPoint();
	}
	function clearRoute() {
		routeApi?.clearRoute();
	}
	function flipRoute() {
		routeApi?.flipRoute();
	}
	function saveRoute() {
		void routeApi?.saveRoute();
	}

	// Section action delegates.
	function startAddSection() {
		sectionApi?.startAddSection();
	}
	function startPlannedSegment() {
		sectionApi?.startPlannedSegment({
			lengthFt: plannedLengthFt,
			layerLabel: plannedLayerLabel,
			mixId: plannedMixId
		});
	}
	function openAutoSplit() {
		const preview = sectionApi?.buildAutoSplitPreview() ?? [];
		if (preview.length === 0) return;
		autoSplitPreview = preview;
		showAutoSplitModal = true;
	}
	function confirmAutoSplit() {
		showAutoSplitModal = false;
		void sectionApi?.confirmAutoSplit(autoSplitPreview);
	}
	function updateSection(id: string, updates: Partial<RoadSection>) {
		void sectionApi?.updateSection(id, updates);
	}
	function deleteSection(id: string) {
		void sectionApi?.deleteSection(id);
	}

	// Terminus action delegates.
	function toggleTerminusField(field: 'begin' | 'end') {
		terminusApi?.setActiveField(terminusActiveField === field ? null : field);
	}
	function clearTermini() {
		terminusApi?.clear();
	}
	function useFullRoute() {
		terminusApi?.useFullRoute();
	}

	function fmtFt(ft: number): string {
		return `${Math.round(ft).toLocaleString()} ft`;
	}
	function fmtStation(station: number | null): string {
		return station == null ? '—' : formatStation(station);
	}

	const sectionInstruction = $derived(
		sectionFlash
			? sectionFlash
			: sectionDrawMode === 'pick-start'
				? 'Tap the road to set the section START (snaps to centerline)'
				: sectionDrawMode === 'pick-end'
					? 'Tap the road to set the section END'
					: sectionDrawMode === 'plan-start'
						? 'Tap the road to set the planned segment START'
						: ''
	);
	const terminusInstruction = $derived(
		terminusFlash
			? terminusFlash
			: terminusActiveField === 'begin'
				? 'Tap the road to set the project START'
				: terminusActiveField === 'end'
					? 'Tap the road to set the project END'
					: 'Choose Start or End, then tap the road'
	);
</script>

<div class="map-workspace">
	<div class="mode-switcher" role="tablist" aria-label="Map mode">
		{#each MODES as m (m.id)}
			<Button
				variant={mode === m.id ? 'primary' : 'secondary'}
				size="sm"
				disabled={m.needsRoute && !hasRoute}
				onclick={() => setMode(m.id)}
				role="tab"
				aria-selected={mode === m.id}
				title={m.needsRoute && !hasRoute ? 'Draw the route first' : m.label}
			>
				{m.label}
			</Button>
		{/each}
	</div>

	<div class="map-shell" style:height>
		{#if browser}
			<MapView center={mapCenter} zoom={hasRoute ? 15 : 13} {height}>
				{#snippet layers()}
					<RouteEditController
						initialWaypoints={waypoints}
						active={mode === 'route'}
						{numLanes}
						{laneWidthFt}
						{isMobile}
						{onRouteSave}
						onChange={handleRouteChange}
						bind:api={routeApi}
					/>
					<SectionEditController
						{siteId}
						{waypoints}
						{totalLengthFt}
						{roadwayLogEvents}
						active={mode === 'sections'}
						{onSectionsChange}
						bind:api={sectionApi}
					/>
					<TerminusEditController
						{waypoints}
						bind:beginStation
						bind:endStation
						active={mode === 'termini'}
						onPick={(field, station) => onTerminusPick?.(field, station)}
						bind:api={terminusApi}
					/>
				{/snippet}
			</MapView>
		{:else}
			<MapStatus kind="loading" {height} />
		{/if}

		<!-- View-mode overlay summary -->
		{#if mode === 'view'}
			<div class="overlay overlay--guide">
				<strong>{hasRoute ? 'Route ready' : 'No route yet'}</strong>
				<span>
					{hasRoute
						? 'Switch to Edit Route, Sections, or Termini to make changes.'
						: 'Open Edit Route to draw the road-snapped alignment.'}
				</span>
			</div>
		{/if}

		<!-- Route-mode chrome -->
		{#if mode === 'route'}
			<div class="overlay overlay--controls">
				<Button
					variant={routeDrawMode ? 'primary' : 'ghost'}
					size="sm"
					onclick={toggleRouteDraw}
				>
					{routeDrawMode ? 'Stop Editing' : 'Draw Route'}
				</Button>
				{#if routeDrawMode}
					<Button variant="ghost" size="sm" onclick={addRoutePoint} disabled={routeSnapping}>
						Add Point
					</Button>
				{/if}
				{#if routeDrawMode && routeControlPoints > 0}
					<Button variant="ghost" size="sm" onclick={undoRoutePoint} disabled={routeSnapping}>
						Undo
					</Button>
				{/if}
				{#if liveWaypoints.length >= 2}
					<Button variant="ghost" size="sm" onclick={flipRoute}>Flip</Button>
				{/if}
				{#if liveWaypoints.length > 0 || routeControlPoints > 0}
					<Button variant="danger" size="sm" onclick={clearRoute}>Clear</Button>
				{/if}
				{#if onRouteSave}
					<Button
						variant="primary"
						size="sm"
						onclick={saveRoute}
						disabled={routeSaving || liveWaypoints.length < 2}
					>
						{routeSaving ? 'Saving…' : 'Save Route'}
					</Button>
				{/if}
			</div>

			{#if liveWaypoints.length > 0}
				<div class="overlay overlay--stats">
					<span class="stat-label">Length</span>
					<span class="stat-value">{liveLengthFt.toFixed(0)} ft</span>
				</div>
			{/if}

			{#if routeDrawMode || routeSnapping || routeSnapError}
				<div class="pill" class:pill--error={!!routeSnapError}>
					{#if routeSnapError}{routeSnapError}{:else if routeSnapping}Snapping to road…{:else}Tap road points in order — the line follows real roads{/if}
				</div>
			{/if}

			{#if routeDrawMode && isMobile}
				<div class="crosshair" aria-hidden="true">+</div>
			{/if}
		{/if}

		<!-- Sections-mode chrome -->
		{#if mode === 'sections'}
			{#if sectionInstruction}
				<div class="pill">{sectionInstruction}</div>
			{/if}
			{#if cursorStation !== null && cursorPosition !== null}
				<div class="station-tooltip" style="left:{cursorPosition.x + 15}px; top:{cursorPosition.y + 15}px;">
					Station {Math.round(cursorStation)} ft ({(cursorStation / 5280).toFixed(2)} mi)
				</div>
			{/if}
		{/if}

		<!-- Termini-mode chrome -->
		{#if mode === 'termini'}
			<div class="pill" class:pill--error={!!terminusFlash}>{terminusInstruction}</div>
		{/if}
	</div>

	<!-- Mode side panels (below the map) -->
	{#if mode === 'sections'}
		<div class="panel">
			{#if totalLengthFt != null && totalLengthFt > 0}
				<div class="length-summary">
					<div class="length-item">
						<span class="length-label">Total</span>
						<span class="length-value">{fmtFt(totalLengthFt)}</span>
					</div>
				</div>
			{/if}
			<div class="planned-form">
				<div class="planned-row">
					<label>
						<span>Length (ft)</span>
						<input type="number" min="1" step="1" bind:value={plannedLengthFt} />
					</label>
					<label>
						<span>Layer</span>
						<input type="text" bind:value={plannedLayerLabel} placeholder="Base" />
					</label>
					<label>
						<span>Mix</span>
						<input type="text" bind:value={plannedMixId} placeholder="Mix 1" />
					</label>
				</div>
				<div class="panel-actions">
					<Button
						variant="secondary"
						size="sm"
						onclick={startPlannedSegment}
						disabled={sectionDrawMode !== 'idle'}
					>
						Start + Length
					</Button>
					{#if canAutoSplit}
						<Button
							variant="secondary"
							size="sm"
							onclick={openAutoSplit}
							disabled={sectionDrawMode !== 'idle'}
						>
							Auto-create from log
						</Button>
					{/if}
					<Button
						variant="primary"
						size="sm"
						onclick={startAddSection}
						disabled={sectionDrawMode !== 'idle'}
					>
						Add Section
					</Button>
				</div>
			</div>

			<div class="section-list">
				{#if sections.length === 0}
					<p class="empty-hint">No sections yet — tap the road to mark a section start point.</p>
				{:else}
					{#each sections as section (section.id)}
						<div class="section-card">
							<div class="section-card__head">
								<span class="status-dot" style="background:{SECTION_STATUS_COLORS[section.status]}"></span>
								<input
									type="text"
									class="section-name"
									value={section.name}
									onchange={(e) => updateSection(section.id, { name: e.currentTarget.value })}
								/>
								<Button
									variant="ghost"
									size="sm"
									aria-label="Delete section"
									onclick={() => deleteSection(section.id)}
								>
									Delete
								</Button>
							</div>
							<div class="section-card__body">
								<span class="station-range">
									{fmtStation(section.station_start)} → {fmtStation(section.station_end)}
								</span>
								<div class="status-buttons">
									<Button
										variant={section.status === 'active' ? 'primary' : 'secondary'}
										size="sm"
										onclick={() => updateSection(section.id, { status: 'active' })}
									>
										Active
									</Button>
									<Button
										variant={section.status === 'completed' ? 'primary' : 'secondary'}
										size="sm"
										onclick={() => updateSection(section.id, { status: 'completed' })}
									>
										Done
									</Button>
									<Button
										variant={section.status === 'skipped' ? 'primary' : 'secondary'}
										size="sm"
										onclick={() => updateSection(section.id, { status: 'skipped' })}
									>
										Skip
									</Button>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	{#if mode === 'termini'}
		<div class="panel">
			<div class="terminus-toggle-row">
				<Button
					variant={terminusActiveField === 'begin' ? 'primary' : 'secondary'}
					size="sm"
					onclick={() => toggleTerminusField('begin')}
				>
					Set Start{#if beginStation != null}&nbsp;· {formatStation(beginStation)}{/if}
				</Button>
				<Button
					variant={terminusActiveField === 'end' ? 'primary' : 'secondary'}
					size="sm"
					onclick={() => toggleTerminusField('end')}
				>
					Set End{#if endStation != null}&nbsp;· {formatStation(endStation)}{/if}
				</Button>
				{#if beginStation != null || endStation != null}
					<Button variant="ghost" size="sm" onclick={clearTermini}>Clear</Button>
				{/if}
				<Button variant="secondary" size="sm" onclick={useFullRoute}>Use Full Route</Button>
			</div>
			{#if beginLabel || endLabel}
				<div class="terminus-hint">
					{#if beginLabel}<span><strong>Start:</strong> {beginLabel}</span>{/if}
					{#if endLabel}<span><strong>End:</strong> {endLabel}</span>{/if}
				</div>
			{/if}
			{#if terminusSummary}
				<div class="terminus-summary">{terminusSummary}</div>
			{/if}
		</div>
	{/if}
</div>

{#if showAutoSplitModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (showAutoSplitModal = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<h3>Auto-create sections from log events</h3>
			<p class="modal-hint">
				This will create {autoSplitPreview.length} section(s) from width / operation change events:
			</p>
			<div class="auto-split-preview">
				{#each autoSplitPreview as seg, i (i)}
					<div class="preview-row">
						<span class="preview-name">{seg.name}</span>
						<span class="preview-range">
							{Math.round(seg.start)} ft → {Math.round(seg.end)} ft
							{#if seg.width}<em>({seg.width} ft wide)</em>{/if}
						</span>
					</div>
				{/each}
			</div>
			<div class="modal-actions">
				<Button variant="ghost" onclick={() => (showAutoSplitModal = false)}>Cancel</Button>
				<Button variant="primary" onclick={confirmAutoSplit}>Create Sections</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.map-workspace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3, 12px);
	}

	.mode-switcher {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2, 8px);
	}

	.map-shell {
		position: relative;
		width: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
	}

	.overlay {
		position: absolute;
		z-index: 500;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 8px);
		box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.2));
	}

	.overlay--guide {
		top: 12px;
		left: 12px;
		max-width: min(360px, calc(100% - 24px));
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		pointer-events: none;
	}

	.overlay--guide strong {
		color: var(--accent);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.overlay--guide span {
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1.35;
	}

	.overlay--controls {
		top: 12px;
		right: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0;
		background: transparent;
		border: none;
		box-shadow: none;
	}

	.overlay--stats {
		bottom: 12px;
		left: 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 14px;
	}

	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.stat-value {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--accent);
	}

	.pill {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 500;
		pointer-events: none;
		max-width: calc(100% - 24px);
		padding: 6px 14px;
		border-radius: 20px;
		background: color-mix(in srgb, var(--text) 78%, transparent);
		color: var(--surface);
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pill--error {
		background: var(--bad);
		color: var(--accent-text);
	}

	.crosshair {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 48px;
		font-weight: 300;
		color: var(--accent);
		pointer-events: none;
		z-index: 450;
	}

	.station-tooltip {
		position: fixed;
		z-index: 2000;
		padding: 6px 12px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--text) 88%, transparent);
		color: var(--surface);
		font-size: 0.8rem;
		font-weight: 600;
		pointer-events: none;
		white-space: nowrap;
	}

	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		padding: var(--sp-4, 16px);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3, 12px);
	}

	.length-summary {
		display: flex;
		gap: 8px;
	}

	.length-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.length-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.length-value {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
	}

	.planned-form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.planned-row {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.planned-form label {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.planned-form label span {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: var(--text-muted);
		font-weight: 700;
	}

	.planned-form input {
		min-height: 40px;
		padding: 8px 10px;
		background: var(--surface-alt, var(--surface));
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
	}

	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.section-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.empty-hint {
		margin: 0;
		padding: 16px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.section-card {
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.section-card__head {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.section-name {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 600;
		padding: 4px 8px;
		border-radius: 4px;
		min-height: 36px;
	}

	.section-name:focus {
		outline: none;
		background: var(--surface);
	}

	.section-card__body {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.station-range {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.status-buttons {
		display: flex;
		gap: 6px;
	}

	.terminus-toggle-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}

	.terminus-hint {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.terminus-summary {
		text-align: center;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--accent);
		padding: 6px 8px;
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		border-radius: var(--radius, 8px);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 3000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background: color-mix(in srgb, var(--text) 60%, transparent);
	}

	.modal-content {
		width: 100%;
		max-width: 600px;
		max-height: 80vh;
		overflow-y: auto;
		padding: 24px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		box-shadow: var(--shadow-lg, 0 10px 40px rgba(0, 0, 0, 0.4));
	}

	.modal-content h3 {
		margin: 0 0 8px;
		font-size: 1.15rem;
	}

	.modal-hint {
		margin: 0 0 16px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.auto-split-preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 24px;
		max-height: 400px;
		overflow-y: auto;
	}

	.preview-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px;
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.preview-name {
		font-weight: 600;
		color: var(--text);
	}

	.preview-range {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.preview-range em {
		color: var(--accent);
		font-style: normal;
		margin-left: 8px;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
	}

	@media (max-width: 640px) {
		.planned-row {
			grid-template-columns: 1fr 1fr;
		}
		.overlay--controls {
			max-width: 48%;
		}
	}
</style>
