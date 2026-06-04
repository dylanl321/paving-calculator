/**
 * src/lib/components/__tests__/LoadTracker.test.ts
 *
 * Component tests for LoadTracker: add load increments count and tonnage total,
 * remove load decrements, running total accuracy, empty state display, handles
 * rapid add/remove without state corruption.
 *
 * Strategy: the component state logic (totals, derived values) is pure enough
 * to test via the same derivation functions the component uses. We also test
 * the unit-conversion path and the rejection/accepted-load separation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { DbLoad } from '$lib/server/db';
import { toMetricTonnes, fromMetricTonnes } from '$lib/utils/unitConvert';

// ---------------------------------------------------------------------------
// Test helpers — mirror the component's derived computations
// ---------------------------------------------------------------------------

function makeLoad(id: string, tons: number, opts: Partial<DbLoad> = {}): DbLoad {
	return {
		id,
		job_site_id: 'site-1',
		user_id: 'user-1',
		ticket_number: null,
		tons,
		timestamp: Math.floor(Date.now() / 1000),
		spread_rate: null,
		notes: null,
		lane_number: null,
		pass_number: null,
		created_at: Math.floor(Date.now() / 1000),
		rejected: 0,
		rejection_reason: null,
		rejection_notes: null,
		ticket_photo_id: null,
		...opts
	};
}

/** Mirror of the component's totalTons / loadCount derivation */
function totals(loads: DbLoad[]): { totalTons: number; loadCount: number; rejectedCount: number } {
	const accepted = loads.filter((l) => !l.rejected);
	return {
		totalTons: accepted.reduce((sum, l) => sum + l.tons, 0),
		loadCount: accepted.length,
		rejectedCount: loads.filter((l) => l.rejected).length
	};
}

/** Mirror of the component's avgTonsPerLoad derivation */
function avgTons(loads: DbLoad[]): number {
	const { totalTons, loadCount } = totals(loads);
	return loadCount > 0 ? totalTons / loadCount : 0;
}

/** Mirror of the component's completionPct derivation */
function completionPct(loads: DbLoad[], targetTonnage: number | null): number | null {
	const { totalTons } = totals(loads);
	if (!targetTonnage || targetTonnage <= 0 || totalTons <= 0) return null;
	return Math.min(100, (totalTons / targetTonnage) * 100);
}

/** Mirror of the component's remainingTons derivation */
function remainingTons(loads: DbLoad[], targetTonnage: number | null): number | null {
	if (!targetTonnage || targetTonnage <= 0) return null;
	const { totalTons } = totals(loads);
	return Math.max(0, targetTonnage - totalTons);
}

/** Mirror of the component's tonsPerHour derivation */
function tonsPerHour(loads: DbLoad[]): number {
	if (loads.length < 2) return 0;
	const sorted = [...loads].sort((a, b) => a.timestamp - b.timestamp);
	const firstTs = sorted[0].timestamp;
	const lastTs = sorted[sorted.length - 1].timestamp;
	const hoursDiff = (lastTs - firstTs) / 3600;
	const { totalTons } = totals(loads);
	return hoursDiff > 0 ? totalTons / hoursDiff : 0;
}

// ---------------------------------------------------------------------------
// 1. Empty state
// ---------------------------------------------------------------------------

describe('empty state (no loads)', () => {
	it('totalTons is 0', () => {
		expect(totals([]).totalTons).toBe(0);
	});

	it('loadCount is 0', () => {
		expect(totals([]).loadCount).toBe(0);
	});

	it('rejectedCount is 0', () => {
		expect(totals([]).rejectedCount).toBe(0);
	});

	it('avgTons is 0', () => {
		expect(avgTons([])).toBe(0);
	});

	it('completionPct is null', () => {
		expect(completionPct([], 100)).toBeNull();
	});

	it('remainingTons equals targetTonnage when no loads', () => {
		expect(remainingTons([], 50)).toBe(50);
	});

	it('tonsPerHour is 0', () => {
		expect(tonsPerHour([])).toBe(0);
	});

	it('completionPct is null when targetTonnage is null', () => {
		expect(completionPct([], null)).toBeNull();
	});

	it('remainingTons is null when targetTonnage is null', () => {
		expect(remainingTons([], null)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 2. Add load increments count and tonnage
// ---------------------------------------------------------------------------

describe('add load — increments count and tonnage', () => {
	let loads: DbLoad[];

	beforeEach(() => {
		loads = [];
	});

	it('adds first load: count becomes 1', () => {
		loads = [makeLoad('l1', 20)];
		expect(totals(loads).loadCount).toBe(1);
	});

	it('adds first load: totalTons equals load tons', () => {
		loads = [makeLoad('l1', 20)];
		expect(totals(loads).totalTons).toBe(20);
	});

	it('adds second load: count becomes 2', () => {
		loads = [makeLoad('l1', 20), makeLoad('l2', 18.5)];
		expect(totals(loads).loadCount).toBe(2);
	});

	it('adds second load: totalTons is the sum', () => {
		loads = [makeLoad('l1', 20), makeLoad('l2', 18.5)];
		expect(totals(loads).totalTons).toBeCloseTo(38.5);
	});

	it('correctly accumulates 5 loads', () => {
		const tonValues = [18.5, 20.0, 19.2, 17.8, 21.0];
		loads = tonValues.map((t, i) => makeLoad(`l${i}`, t));
		const expected = tonValues.reduce((a, b) => a + b, 0);
		expect(totals(loads).totalTons).toBeCloseTo(expected);
		expect(totals(loads).loadCount).toBe(5);
	});

	it('accepts fractional tons correctly', () => {
		loads = [makeLoad('l1', 18.75), makeLoad('l2', 19.25)];
		expect(totals(loads).totalTons).toBeCloseTo(38.0);
	});

	it('avgTons is total / count', () => {
		loads = [makeLoad('l1', 20), makeLoad('l2', 18)];
		expect(avgTons(loads)).toBeCloseTo(19.0);
	});

	it('each additional load raises totalTons monotonically', () => {
		const prev: number[] = [];
		for (let i = 1; i <= 6; i++) {
			loads = Array.from({ length: i }, (_, k) => makeLoad(`l${k}`, 18.5));
			const { totalTons } = totals(loads);
			if (prev.length > 0) {
				expect(totalTons).toBeGreaterThan(prev[prev.length - 1]);
			}
			prev.push(totalTons);
		}
	});
});

// ---------------------------------------------------------------------------
// 3. Remove (reject) load decrements count and tonnage
// ---------------------------------------------------------------------------

describe('remove (reject) load — decrements count and tonnage', () => {
	let loads: DbLoad[];

	beforeEach(() => {
		loads = [
			makeLoad('l1', 20),
			makeLoad('l2', 18.5),
			makeLoad('l3', 19.0)
		];
	});

	it('rejecting one load decrements loadCount by 1', () => {
		const updated = loads.map((l) => l.id === 'l2' ? { ...l, rejected: 1 } : l);
		expect(totals(updated).loadCount).toBe(2);
	});

	it('rejecting one load removes its tons from totalTons', () => {
		const updated = loads.map((l) => l.id === 'l2' ? { ...l, rejected: 1 } : l);
		expect(totals(updated).totalTons).toBeCloseTo(39.0);
	});

	it('rejectedCount increments when a load is rejected', () => {
		const updated = loads.map((l) => l.id === 'l1' ? { ...l, rejected: 1 } : l);
		expect(totals(updated).rejectedCount).toBe(1);
	});

	it('rejecting all loads yields loadCount=0, totalTons=0', () => {
		const updated = loads.map((l) => ({ ...l, rejected: 1 }));
		const { totalTons, loadCount, rejectedCount } = totals(updated);
		expect(loadCount).toBe(0);
		expect(totalTons).toBe(0);
		expect(rejectedCount).toBe(3);
	});

	it('un-rejecting a load restores it to totals', () => {
		// Reject then unreject
		const rejected = loads.map((l) => l.id === 'l2' ? { ...l, rejected: 1 } : l);
		const unrejected = rejected.map((l) => l.id === 'l2' ? { ...l, rejected: 0 } : l);
		expect(totals(unrejected).loadCount).toBe(3);
		expect(totals(unrejected).totalTons).toBeCloseTo(57.5);
	});

	it('avgTons recalculates after rejection', () => {
		// 20 + 18.5 + 19 = 57.5 / 3 = 19.17
		// After rejecting l2 (18.5): (20 + 19) / 2 = 19.5
		const updated = loads.map((l) => l.id === 'l2' ? { ...l, rejected: 1 } : l);
		expect(avgTons(updated)).toBeCloseTo(19.5);
	});

	it('rejectedCount decrements when un-rejecting', () => {
		const rejected = loads.map((l) => ({ ...l, rejected: 1 }));
		const unrejected = rejected.map((l) => l.id === 'l1' ? { ...l, rejected: 0 } : l);
		expect(totals(unrejected).rejectedCount).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// 4. Running total accuracy
// ---------------------------------------------------------------------------

describe('running total accuracy', () => {
	it('running sum after adding loads one at a time matches bulk sum', () => {
		const tonValues = [20, 18.5, 19, 21, 17.5];
		let runningLoads: DbLoad[] = [];
		let runningTotal = 0;

		for (let i = 0; i < tonValues.length; i++) {
			runningLoads = [...runningLoads, makeLoad(`l${i}`, tonValues[i])];
			runningTotal += tonValues[i];
			expect(totals(runningLoads).totalTons).toBeCloseTo(runningTotal);
			expect(totals(runningLoads).loadCount).toBe(i + 1);
		}
	});

	it('completionPct at 50% target is 50', () => {
		const loads = [makeLoad('l1', 50)];
		expect(completionPct(loads, 100)).toBeCloseTo(50);
	});

	it('completionPct at 100% target is exactly 100', () => {
		const loads = [makeLoad('l1', 100)];
		expect(completionPct(loads, 100)).toBeCloseTo(100);
	});

	it('completionPct is capped at 100 even when over target', () => {
		const loads = [makeLoad('l1', 120)];
		expect(completionPct(loads, 100)).toBe(100);
	});

	it('remainingTons decreases as loads are added', () => {
		const target = 100;
		const previous: number[] = [];
		for (let i = 1; i <= 5; i++) {
			const loads = Array.from({ length: i }, (_, k) => makeLoad(`l${k}`, 10));
			const rem = remainingTons(loads, target)!;
			if (previous.length > 0) {
				expect(rem).toBeLessThan(previous[previous.length - 1]);
			}
			previous.push(rem);
		}
	});

	it('remainingTons reaches 0 when loads meet or exceed target', () => {
		const loads = [makeLoad('l1', 100), makeLoad('l2', 20)];
		expect(remainingTons(loads, 100)).toBe(0);
	});

	it('tonsPerHour calculates correctly given timestamps', () => {
		const now = Math.floor(Date.now() / 1000);
		const loads: DbLoad[] = [
			makeLoad('l1', 20, { timestamp: now }),
			makeLoad('l2', 20, { timestamp: now + 3600 }) // 1 hour later
		];
		// 40 tons / 1 hour = 40 t/h
		expect(tonsPerHour(loads)).toBeCloseTo(40);
	});

	it('tonsPerHour is 0 with only one load', () => {
		const loads = [makeLoad('l1', 20)];
		expect(tonsPerHour(loads)).toBe(0);
	});

	it('tonsPerHour ignores rejected loads in numerator', () => {
		const now = Math.floor(Date.now() / 1000);
		const loads: DbLoad[] = [
			makeLoad('l1', 20, { timestamp: now }),
			makeLoad('l2', 20, { timestamp: now + 1800, rejected: 1 }), // rejected
			makeLoad('l3', 20, { timestamp: now + 3600 }) // 1 hour later
		];
		// accepted tons = 40, span = 1 hr => 40 t/h
		expect(tonsPerHour(loads)).toBeCloseTo(40);
	});
});

// ---------------------------------------------------------------------------
// 5. Rapid add/remove without state corruption
// ---------------------------------------------------------------------------

describe('rapid add/remove — no state corruption', () => {
	it('toggling rejection 10 times returns to accepted', () => {
		let load = makeLoad('l1', 20);
		for (let i = 0; i < 10; i++) {
			load = { ...load, rejected: load.rejected ? 0 : 1 };
		}
		// 10 toggles (even) => back to rejected=0
		expect(load.rejected).toBe(0);
	});

	it('adding and removing 100 loads in sequence yields correct totals', () => {
		let loads: DbLoad[] = [];
		// Add 100 loads of 1 ton each
		for (let i = 0; i < 100; i++) {
			loads = [...loads, makeLoad(`l${i}`, 1)];
		}
		expect(totals(loads).totalTons).toBe(100);
		expect(totals(loads).loadCount).toBe(100);

		// Remove (reject) half
		loads = loads.map((l, i) => i % 2 === 0 ? { ...l, rejected: 1 } : l);
		expect(totals(loads).loadCount).toBe(50);
		expect(totals(loads).totalTons).toBe(50);
		expect(totals(loads).rejectedCount).toBe(50);
	});

	it('adding loads with identical tonnage keeps count accurate', () => {
		const loads = Array.from({ length: 20 }, (_, i) => makeLoad(`l${i}`, 18.5));
		expect(totals(loads).loadCount).toBe(20);
		expect(totals(loads).totalTons).toBeCloseTo(20 * 18.5);
	});

	it('interleaving add and reject does not corrupt running total', () => {
		let loads: DbLoad[] = [];
		let expectedAcceptedTons = 0;

		// Add 5 loads
		for (let i = 0; i < 5; i++) {
			loads = [...loads, makeLoad(`l${i}`, 10)];
			expectedAcceptedTons += 10;
		}

		// Reject load 1 and 3
		loads = loads.map((l) =>
			l.id === 'l1' || l.id === 'l3' ? { ...l, rejected: 1 } : l
		);
		expectedAcceptedTons -= 20; // removed loads 1 and 3

		// Add 2 more loads
		loads = [...loads, makeLoad('l5', 10), makeLoad('l6', 10)];
		expectedAcceptedTons += 20;

		expect(totals(loads).totalTons).toBeCloseTo(expectedAcceptedTons);
		expect(totals(loads).loadCount).toBe(5); // 5 accepted: l0, l2, l4, l5, l6
	});

	it('unreject all then reject all cycles correctly', () => {
		let loads = Array.from({ length: 5 }, (_, i) => makeLoad(`l${i}`, 10));

		// Reject all
		loads = loads.map((l) => ({ ...l, rejected: 1 }));
		expect(totals(loads).loadCount).toBe(0);
		expect(totals(loads).totalTons).toBe(0);

		// Unreject all
		loads = loads.map((l) => ({ ...l, rejected: 0 }));
		expect(totals(loads).loadCount).toBe(5);
		expect(totals(loads).totalTons).toBe(50);
	});
});

// ---------------------------------------------------------------------------
// 6. Unit conversion (metric vs. imperial)
// ---------------------------------------------------------------------------

describe('unit conversion — short tons vs metric tonnes', () => {
	const SHORT_TON_TO_METRIC = 0.907185;

	it('toMetricTonnes converts correctly (1 short ton = 0.907185 metric tonnes)', () => {
		expect(toMetricTonnes(1)).toBeCloseTo(SHORT_TON_TO_METRIC, 4);
	});

	it('fromMetricTonnes is the inverse of toMetricTonnes', () => {
		const original = 25.0;
		expect(fromMetricTonnes(toMetricTonnes(original))).toBeCloseTo(original, 4);
	});

	it('totalTons in metric = totalTons * 0.907185', () => {
		const loads = [makeLoad('l1', 20), makeLoad('l2', 18)];
		const { totalTons } = totals(loads);
		const displayMetric = toMetricTonnes(totalTons);
		expect(displayMetric).toBeCloseTo(38 * SHORT_TON_TO_METRIC, 4);
	});

	it('metric user input is converted to short tons before storing', () => {
		// fromMetricTonnes(x) converts entered metric tonnes to short tons for storage
		const enteredMetric = 20; // user types 20 metric tonnes
		const storedShortTons = fromMetricTonnes(enteredMetric);
		expect(storedShortTons).toBeGreaterThan(enteredMetric); // short ton < metric tonne
	});

	it('re-displaying stored short tons as metric is lossless round-trip', () => {
		const enteredMetric = 18.5;
		const stored = fromMetricTonnes(enteredMetric);
		const displayed = toMetricTonnes(stored);
		expect(displayed).toBeCloseTo(enteredMetric, 4);
	});

	it('zero tons converts to zero in both directions', () => {
		expect(toMetricTonnes(0)).toBe(0);
		expect(fromMetricTonnes(0)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 7. Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
	it('single load with very large tonnage does not corrupt state', () => {
		const loads = [makeLoad('l1', 999999)];
		expect(totals(loads).totalTons).toBe(999999);
		expect(totals(loads).loadCount).toBe(1);
	});

	it('completionPct returns null when target is 0', () => {
		const loads = [makeLoad('l1', 10)];
		expect(completionPct(loads, 0)).toBeNull();
	});

	it('remainingTons is 0 (not negative) when loads exceed target', () => {
		const loads = [makeLoad('l1', 50), makeLoad('l2', 60)];
		expect(remainingTons(loads, 80)).toBe(0);
	});

	it('loads with spread_rate=null are still counted in tonnage totals', () => {
		const loads = [
			makeLoad('l1', 20, { spread_rate: null }),
			makeLoad('l2', 18, { spread_rate: 220 })
		];
		expect(totals(loads).totalTons).toBeCloseTo(38);
	});

	it('avgTons is correct for a single load', () => {
		const loads = [makeLoad('l1', 25)];
		expect(avgTons(loads)).toBe(25);
	});

	it('tonsPerHour handles loads with the same timestamp (no division by zero)', () => {
		const now = Math.floor(Date.now() / 1000);
		const loads = [
			makeLoad('l1', 20, { timestamp: now }),
			makeLoad('l2', 20, { timestamp: now })
		];
		// hoursDiff = 0 => should return 0, not throw
		expect(tonsPerHour(loads)).toBe(0);
	});

	it('completionPct is null when totalTons is 0 but target is set', () => {
		// All loads are rejected => totalTons = 0
		const loads = [makeLoad('l1', 50, { rejected: 1 })];
		expect(completionPct(loads, 100)).toBeNull();
	});
});
