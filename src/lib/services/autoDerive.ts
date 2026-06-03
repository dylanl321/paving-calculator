import type { TodayEntry, TodayState } from '$lib/stores/today.svelte';
import { actualSpreadRate } from '$lib/config/formulas';

/**
 * Auto-derives fields from related inputs without overwriting existing non-null values.
 *
 * @param entry - The current entry being edited
 * @param state - The current today state
 * @param jobConfig - Job configuration (e.g., road_width)
 * @param weatherTempF - Optional weather temperature to set on state if state.weather_temp_f is null
 * @returns Patches to apply to entry and state
 */
export function deriveFields(
	entry: TodayEntry,
	state: TodayState,
	jobConfig: { road_width?: number | null },
	weatherTempF?: number | null
): { entryPatch: Partial<TodayEntry>; statePatch: Partial<TodayState> } {
	const entryPatch: Partial<TodayEntry> = {};
	const statePatch: Partial<TodayState> = {};

	// Rule 1: Derive distance_ft from station_start and station_end
	if (
		entry.station_start != null &&
		entry.station_end != null &&
		entry.distance_ft == null
	) {
		entryPatch.distance_ft = (entry.station_end - entry.station_start) * 100;
	}

	// Rule 2: Derive spread_rate_actual from tons_placed, distance_ft, and road_width
	const distanceFt = entryPatch.distance_ft ?? entry.distance_ft;
	if (
		entry.tons_placed != null &&
		distanceFt != null &&
		jobConfig.road_width != null &&
		entry.spread_rate_actual == null
	) {
		entryPatch.spread_rate_actual = actualSpreadRate({
			tons: entry.tons_placed,
			distanceFt,
			widthFt: jobConfig.road_width
		});
	}

	// Rule 3: Set weather_temp_f on state if not already set
	if (state.weather_temp_f == null && weatherTempF != null) {
		statePatch.weather_temp_f = weatherTempF;
	}

	return { entryPatch, statePatch };
}

/**
 * UNIT TEST EXAMPLES (documentation only)
 *
 * Example 1: Derive distance_ft from stations
 * Input:
 *   entry = { station_start: 10, station_end: 15, distance_ft: null, ... }
 *   state = { ... }
 *   jobConfig = {}
 * Expected Output:
 *   { entryPatch: { distance_ft: 500 }, statePatch: {} }
 *   // (15 - 10) * 100 = 500
 *
 * Example 2: Do NOT overwrite existing distance_ft
 * Input:
 *   entry = { station_start: 10, station_end: 15, distance_ft: 600, ... }
 *   state = { ... }
 *   jobConfig = {}
 * Expected Output:
 *   { entryPatch: {}, statePatch: {} }
 *   // distance_ft already set, don't touch it
 *
 * Example 3: Derive spread_rate_actual from tons, distance, and width
 * Input:
 *   entry = { tons_placed: 50, distance_ft: 1000, spread_rate_actual: null, ... }
 *   state = { ... }
 *   jobConfig = { road_width: 24 }
 * Expected Output:
 *   { entryPatch: { spread_rate_actual: 250 }, statePatch: {} }
 *   // actualSpreadRate({ tons: 50, distanceFt: 1000, widthFt: 24 })
 *   // = (50 * 2000) / (1000 * 24) * 12 = 100000 / 24000 * 12 ≈ 250 lbs/sy
 *
 * Example 4: Chain derivation - derive distance_ft THEN spread_rate_actual
 * Input:
 *   entry = { station_start: 10, station_end: 15, distance_ft: null, tons_placed: 50, spread_rate_actual: null, ... }
 *   state = { ... }
 *   jobConfig = { road_width: 24 }
 * Expected Output:
 *   { entryPatch: { distance_ft: 500, spread_rate_actual: 500 }, statePatch: {} }
 *   // First derives distance_ft = 500, then uses it to compute spread_rate_actual
 *
 * Example 5: Do NOT overwrite existing spread_rate_actual
 * Input:
 *   entry = { tons_placed: 50, distance_ft: 1000, spread_rate_actual: 300, ... }
 *   state = { ... }
 *   jobConfig = { road_width: 24 }
 * Expected Output:
 *   { entryPatch: {}, statePatch: {} }
 *   // spread_rate_actual already set, don't touch it
 *
 * Example 6: Set weather_temp_f on state if not already set
 * Input:
 *   entry = { ... }
 *   state = { weather_temp_f: null, ... }
 *   jobConfig = {}
 *   weatherTempF = 72
 * Expected Output:
 *   { entryPatch: {}, statePatch: { weather_temp_f: 72 } }
 *
 * Example 7: Do NOT overwrite existing weather_temp_f
 * Input:
 *   entry = { ... }
 *   state = { weather_temp_f: 68, ... }
 *   jobConfig = {}
 *   weatherTempF = 72
 * Expected Output:
 *   { entryPatch: {}, statePatch: {} }
 *   // weather_temp_f already set on state, don't touch it
 *
 * Example 8: Missing required inputs for spread_rate_actual
 * Input:
 *   entry = { tons_placed: 50, distance_ft: 1000, spread_rate_actual: null, ... }
 *   state = { ... }
 *   jobConfig = { road_width: null }
 * Expected Output:
 *   { entryPatch: {}, statePatch: {} }
 *   // Can't compute spread_rate_actual without road_width
 *
 * Example 9: All three rules fire
 * Input:
 *   entry = { station_start: 10, station_end: 15, distance_ft: null, tons_placed: 50, spread_rate_actual: null, ... }
 *   state = { weather_temp_f: null, ... }
 *   jobConfig = { road_width: 24 }
 *   weatherTempF = 75
 * Expected Output:
 *   {
 *     entryPatch: { distance_ft: 500, spread_rate_actual: 500 },
 *     statePatch: { weather_temp_f: 75 }
 *   }
 */
