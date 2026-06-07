/**
 * map-v2/editors — map-context-aware editing controllers.
 *
 * These attach to an existing <MapView> via getMapContext() (like MapMarker /
 * MapPolyline) instead of owning their own map. Mount one inside a <MapView>'s
 * {#snippet layers()} and gate interactions with the `active` prop so a parent
 * can host ONE shared map and enable exactly one editing mode at a time.
 *
 * Each controller owns its snap/station logic (roads-only) and renders its own
 * map layers; it exposes reactive state + actions to the parent chrome through
 * a bindable `api` handle so toolbars/panels live in the parent.
 *
 *   <MapView bind:map>
 *     {#snippet layers()}
 *       <RouteEditController active={mode === 'route'} bind:api={routeApi} ... />
 *     {/snippet}
 *   </MapView>
 */

export { default as RouteEditController } from './RouteEditController.svelte';
export { default as SectionEditController } from './SectionEditController.svelte';
export { default as TerminusEditController } from './TerminusEditController.svelte';

export type { RouteEditApi, RouteEditWaypoint } from './RouteEditController.svelte';
export type {
	SectionEditApi,
	SectionEditWaypoint,
	RoadSection,
	SectionRoadwayLogEvent,
	AutoSplitSegment
} from './SectionEditController.svelte';
export type {
	TerminusEditApi,
	TerminusEditWaypoint,
	TerminusField
} from './TerminusEditController.svelte';
