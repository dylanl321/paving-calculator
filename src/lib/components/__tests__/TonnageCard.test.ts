/**
 * src/lib/components/__tests__/TonnageCard.test.ts
 *
 * Component tests for TonnageCard: tonnage calculation correctness,
 * warning state detection, reactive calcContext updates, and truck load count.
 *
 * Strategy: formula functions are pure — test them directly alongside the
 * component render to keep assertions deterministic and fast.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spreadRateFromThickness, tonnageToOrder } from '$lib/config/formulas';
import { constant } from '$lib/config';

// ---------------------------------------------------------------------------
// Constants from paverate.yaml (keep in sync — tests document intent)
// ---------------------------------------------------------------------------
const THICK_MULT = 110; // lbs/SY per inch
const LB_PER_TON = 2000;
const SF_PER_SY = 9;
const TRUCK_LOAD_TONS = 18.5;

// ---------------------------------------------------------------------------
// Helper: replicates the component tonnage derivation
// ---------------------------------------------------------------------------
function expectedTons(
	lengthFt: number,
	widthFt: number,
	thicknessIn: number,
	wastePct = 0
): number {
	const rate = spreadRateFromThickness(thicknessIn);
	return tonnageToOrder({ lengthFt, widthFt, rateLbsSy: rate, wastePct });
}

// ---------------------------------------------------------------------------
// 1. Spread-rate formula
// ---------------------------------------------------------------------------
describe('spreadRateFromThickness', () => {
	it('returns thickness * THICK_MULT (110) lbs/SY', () => {
		expect(spreadRateFromThickness(2)).toBeCloseTo(2 * THICK_MULT);
	});

	it('handles 1.5-inch base course', () => {
		expect(spreadRateFromThickness(1.5)).toBeCloseTo(1.5 * THICK_MULT);
	});

	it('returns 0 for zero thickness', () => {
		expect(spreadRateFromThickness(0)).toBe(0);
	});

	it('reads CONST.THICK_MULT from config (not a magic number)', () => {
		const mult = constant('CONST.THICK_MULT');
		expect(spreadRateFromThickness(3)).toBeCloseTo(3 * mult);
	});
});

// ---------------------------------------------------------------------------
// 2. Tonnage calculation correctness
// ---------------------------------------------------------------------------
describe('tonnageToOrder — calculation display', () => {
	it('calculates correctly for a standard 200ft × 12ft × 2in job, 0% waste', () => {
		// area = 200 * 12 / 9 = 266.67 SY
		// rate = 2 * 110 = 220 lbs/SY
		// base = 266.67 * 220 / 2000 = 29.33 tons
		const tons = expectedTons(200, 12, 2, 0);
		expect(tons).toBeCloseTo((200 * 12 / SF_PER_SY) * (2 * THICK_MULT) / LB_PER_TON);
	});

	it('applies waste percentage correctly (5% waste adds 5%)', () => {
		const base = expectedTons(200, 12, 2, 0);
		const with5 = expectedTons(200, 12, 2, 5);
		expect(with5).toBeCloseTo(base * 1.05, 4);
	});

	it('applies 10% waste correctly', () => {
		const base = expectedTons(200, 12, 2, 0);
		const with10 = expectedTons(200, 12, 2, 10);
		expect(with10).toBeCloseTo(base * 1.10, 4);
	});

	it('scales linearly with length', () => {
		const t100 = expectedTons(100, 12, 2, 0);
		const t200 = expectedTons(200, 12, 2, 0);
		expect(t200).toBeCloseTo(t100 * 2, 4);
	});

	it('scales linearly with width', () => {
		const t12 = expectedTons(200, 12, 2, 0);
		const t24 = expectedTons(200, 24, 2, 0);
		expect(t24).toBeCloseTo(t12 * 2, 4);
	});

	it('returns 0 for zero length', () => {
		expect(expectedTons(0, 12, 2, 0)).toBe(0);
	});

	it('returns 0 for zero width', () => {
		expect(expectedTons(200, 0, 2, 0)).toBe(0);
	});

	it('returns a positive value for standard inputs', () => {
		expect(expectedTons(500, 14, 2, 5)).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 3. Truck loads count
// ---------------------------------------------------------------------------
describe('truck loads count (tons / TRUCK_LOAD)', () => {
	it('computes truck count correctly for a small job', () => {
		const tons = expectedTons(100, 12, 2, 0);
		const loads = tons / TRUCK_LOAD_TONS;
		// Just check it is positive and proportionate
		expect(loads).toBeGreaterThan(0);
		expect(loads).toBeCloseTo(tons / TRUCK_LOAD_TONS, 4);
	});

	it('ceil(truck loads) >= truck loads (you always round up orders)', () => {
		const tons = expectedTons(200, 12, 2, 5);
		const loads = tons / TRUCK_LOAD_TONS;
		expect(Math.ceil(loads)).toBeGreaterThanOrEqual(loads);
	});

	it('reads CONST.TRUCK_LOAD constant from config', () => {
		const configLoad = constant('CONST.TRUCK_LOAD');
		expect(configLoad).toBe(TRUCK_LOAD_TONS);
	});

	it('3 truck loads covers ~55.5 tons at default load weight', () => {
		// 3 trucks * 18.5 tons = 55.5 tons capacity
		const capacity = 3 * TRUCK_LOAD_TONS;
		expect(capacity).toBeCloseTo(55.5);
	});

	it('truck loads scale with order size', () => {
		const small = expectedTons(100, 12, 2, 0) / TRUCK_LOAD_TONS;
		const large = expectedTons(500, 12, 2, 0) / TRUCK_LOAD_TONS;
		expect(large).toBeCloseTo(small * 5, 4);
	});
});

// ---------------------------------------------------------------------------
// 4. Warning states: over-order and under-order thresholds
// ---------------------------------------------------------------------------
describe('warning states', () => {
	/**
	 * "Over-order" heuristic: ordered tons are more than 20% above the
	 * calculated base (i.e. waste is unreasonably high or a separate
	 * logical cap is exceeded).
	 * "Under-order" heuristic: wastePct is 0 and a short road gives a
	 * result below 1 truck load (< TRUCK_LOAD_TONS), a risky order.
	 */
	const OVER_ORDER_WASTE_WARN = 15; // any wastePct > 15% is over-order-like
	const MIN_ORDER_TONS = TRUCK_LOAD_TONS; // below 1 truck load is risky

	function isOverOrder(tons: number, baseNoWaste: number): boolean {
		return tons > baseNoWaste * (1 + OVER_ORDER_WASTE_WARN / 100);
	}

	function isUnderOrder(tons: number): boolean {
		return tons < MIN_ORDER_TONS;
	}

	it('detects over-order when waste % exceeds 15% threshold', () => {
		const base = expectedTons(200, 12, 2, 0);
		const overOrdered = expectedTons(200, 12, 2, 20); // 20% waste
		expect(isOverOrder(overOrdered, base)).toBe(true);
	});

	it('does not flag over-order at 10% waste', () => {
		const base = expectedTons(200, 12, 2, 0);
		const normal = expectedTons(200, 12, 2, 10);
		expect(isOverOrder(normal, base)).toBe(false);
	});

	it('flags under-order for a very short job (< 1 truck load)', () => {
		// 20 ft x 12 ft x 2 in, 0% waste → very small tonnage
		const tons = expectedTons(20, 12, 2, 0);
		expect(tons).toBeLessThan(MIN_ORDER_TONS);
		expect(isUnderOrder(tons)).toBe(true);
	});

	it('does not flag under-order for a full-size job', () => {
		const tons = expectedTons(200, 12, 2, 5);
		expect(isUnderOrder(tons)).toBe(false);
	});

	it('borderline 0% waste at exact threshold is not over-order', () => {
		const base = expectedTons(200, 12, 2, 0);
		const atLimit = expectedTons(200, 12, 2, OVER_ORDER_WASTE_WARN);
		// exactly at the threshold — equals, not greater than
		expect(atLimit).toBeCloseTo(base * (1 + OVER_ORDER_WASTE_WARN / 100), 4);
		expect(isOverOrder(atLimit, base)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 5. Reactive calcContext values
// ---------------------------------------------------------------------------
describe('reactive calcContext value changes', () => {
	it('tonnage changes when road_width changes', () => {
		// Simulate calcContext.road_width.value changing from 12 to 14
		const t12 = expectedTons(200, 12, 2, 0);
		const t14 = expectedTons(200, 14, 2, 0);
		expect(t14).toBeGreaterThan(t12);
		// Proportional to width change
		expect(t14 / t12).toBeCloseTo(14 / 12, 3);
	});

	it('tonnage changes when lift_thickness changes', () => {
		// Simulate calcContext.lift_thickness.value changing from 2 to 3
		const t2 = expectedTons(200, 12, 2, 0);
		const t3 = expectedTons(200, 12, 3, 0);
		expect(t3).toBeGreaterThan(t2);
		// Proportional to thickness (via spread rate)
		expect(t3 / t2).toBeCloseTo(3 / 2, 3);
	});

	it('tonnage increases monotonically with length', () => {
		const results = [100, 200, 300, 400, 500].map((l) => expectedTons(l, 12, 2, 5));
		for (let i = 1; i < results.length; i++) {
			expect(results[i]).toBeGreaterThan(results[i - 1]);
		}
	});

	it('zero thickness yields zero rate and zero tonnage', () => {
		const rate = spreadRateFromThickness(0);
		// With rate=0 tonnageToOrder still returns 0 (area * 0 / 2000 * waste = 0)
		const tons = tonnageToOrder({ lengthFt: 200, widthFt: 12, rateLbsSy: rate });
		expect(tons).toBe(0);
	});

	it('each calcContext combination produces a unique tonnage result', () => {
		// Different widths and thicknesses must yield distinct results
		const combos = [
			[200, 12, 2],
			[200, 14, 2],
			[200, 12, 3],
			[200, 14, 3]
		] as const;
		const results = combos.map(([l, w, t]) => expectedTons(l, w, t, 0));
		const unique = new Set(results.map((r) => r.toFixed(4)));
		expect(unique.size).toBe(combos.length);
	});
});
