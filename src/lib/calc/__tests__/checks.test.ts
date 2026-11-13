/**
 * Unit tests for placementCheck, spreadSpecCheck, tackTempCheck, rainCheck
 * as exported from src/lib/calc/index.ts.
 *
 * All threshold values come from GDOT spec / paverate.yaml:
 *   Table 4 (TEMP.*):  ≤1in=55F, 1.1-2in=45F, 2.1-3in=40F, 3.1-4in=35F, 4.1-8in=32F
 *   At or above the Table 4 minimum is pass. Warn is only below that floor,
 *   within tempWarnMarginF (5°F).
 *   Tack min temp: 40F (§413.3.05.A). Below 40F fails. From 40F up to
 *   40F + tempWarnMarginF warns (legal, but at the floor).
 *   OGFC/PEM floor: 60F (§400.3.05.E) on course ids TOLERANCE.OGFC / TOLERANCE.PEM.
 *   Rain warn: 0.01in, Rain block: 0.10in (weather.rainWarnIn / rainBlockIn).
 *   These inch cutoffs are field heuristics. GDOT only says do not pave a wet surface.
 *   Spread tolerance varies by course type
 */
import { describe, it, expect } from 'vitest';
import {
	ogfcPemTempCheck,
	placementCheck,
	rainCheck,
	spreadSpecCheck,
	tackTempCheck
} from '../index';

// ─── placementCheck ───────────────────────────────────────────────────────────
describe('placementCheck', () => {
	it('returns null when airTempF is null', () => {
		expect(placementCheck(null, 2)).toBeNull();
	});

	it('returns null when thicknessIn is 0', () => {
		expect(placementCheck(50, 0)).toBeNull();
	});

	// Table 4: 2in lift, min 45F
	it('pass: 50F air temp, 2in lift (min 45F)', () => {
		const result = placementCheck(50, 2);
		expect(result).not.toBeNull();
		expect(result!.status).toBe('pass');
		expect(result!.minTempF).toBe(45);
	});

	it('warn: 40F air temp, 2in lift (min 45F, margin 5F -> borderline at 40)', () => {
		// 40 >= 45 - 5 = 40 => warn (exactly on the boundary)
		const result = placementCheck(40, 2);
		expect(result).not.toBeNull();
		expect(result!.status).toBe('warn');
	});

	it('fail: 39F air temp, 2in lift (min 45F, below warn boundary 40F)', () => {
		const result = placementCheck(39, 2);
		expect(result!.status).toBe('fail');
	});

	// Table 4: 1in lift, min 55F
	it('pass: 60F air temp, 1in lift (min 55F)', () => {
		const result = placementCheck(60, 1);
		expect(result!.status).toBe('pass');
		expect(result!.minTempF).toBe(55);
	});

	it('warn: 50F air temp, 1in lift (min 55F, margin 5F -> borderline at 50)', () => {
		// 50 >= 55 - 5 = 50 => warn
		const result = placementCheck(50, 1);
		expect(result!.status).toBe('warn');
	});

	it('fail: 49F air temp, 1in lift (min 55F, below warn boundary 50F)', () => {
		const result = placementCheck(49, 1);
		expect(result!.status).toBe('fail');
	});

	// Table 4: 3in lift, min 40F
	it('pass: 45F air temp, 3in lift (min 40F)', () => {
		const result = placementCheck(45, 3);
		expect(result!.status).toBe('pass');
		expect(result!.minTempF).toBe(40);
	});

	// Table 4: 4in lift, min 35F
	it('pass: 36F air temp, 4in lift (min 35F)', () => {
		const result = placementCheck(36, 4);
		expect(result!.status).toBe('pass');
		expect(result!.minTempF).toBe(35);
	});

	// Table 4: 8in lift, min 32F
	it('pass: 33F air temp, 8in lift (min 32F)', () => {
		const result = placementCheck(33, 8);
		expect(result!.status).toBe('pass');
		expect(result!.minTempF).toBe(32);
	});

	it('warn: 30F air temp, 8in lift (min 32F, margin 5F -> borderline at 27)', () => {
		// 30 >= 32 - 5 = 27 => warn
		const result = placementCheck(30, 8);
		expect(result!.status).toBe('warn');
	});

	it('fail: 26F air temp, 8in lift (min 32F, below warn boundary 27F)', () => {
		const result = placementCheck(26, 8);
		expect(result!.status).toBe('fail');
	});

	// 48°F is above the 45°F Table 4 floor for a 2 in lift, so it passes.
	// The warn band is only below that floor (40–45°F).
	it('pass: 48F air temp, 2in lift (above the 45F Table 4 floor)', () => {
		const result = placementCheck(48, 2);
		expect(result).not.toBeNull();
		expect(result!.status).toBe('pass');
		expect(result!.minTempF).toBe(45);
	});

	it('warn: 43F air temp, 2in lift (min 45F, warn margin 5F)', () => {
		const result = placementCheck(43, 2);
		expect(result!.status).toBe('warn');
	});

	it('clause references GDOT Table 4', () => {
		const result = placementCheck(60, 2);
		expect(result!.clause).toBe('§400.3.05.E Table 4');
	});
});

// ─── spreadSpecCheck ──────────────────────────────────────────────────────────
describe('spreadSpecCheck', () => {
	it('returns null when placedLbsSy is null', () => {
		expect(spreadSpecCheck(null, 165, null)).toBeNull();
	});

	it('returns null when targetLbsSy is null', () => {
		expect(spreadSpecCheck(165, null, null)).toBeNull();
	});

	it('returns null when targetLbsSy is 0', () => {
		expect(spreadSpecCheck(165, 0, null)).toBeNull();
	});

	it('good: placed equals target', () => {
		const result = spreadSpecCheck(165, 165, null);
		expect(result!.status).toBe('good');
	});

	it('bad: placed is far above target (>1.5x tolerance)', () => {
		// default tolerance for null course. Large delta guaranteed bad.
		const result = spreadSpecCheck(400, 165, null);
		expect(result!.status).toBe('bad');
	});

	it('bad: placed is far below target', () => {
		const result = spreadSpecCheck(50, 165, null);
		expect(result!.status).toBe('bad');
	});

	it('clause references Table 12', () => {
		const result = spreadSpecCheck(165, 165, null);
		expect(result!.clause).toBe('§400.4.A.2.b Table 12');
	});

	it('deltaLbsSy is positive when placed > target', () => {
		const result = spreadSpecCheck(170, 165, null);
		expect(result!.deltaLbsSy).toBeGreaterThan(0);
	});

	it('deltaLbsSy is negative when placed < target', () => {
		const result = spreadSpecCheck(160, 165, null);
		expect(result!.deltaLbsSy).toBeLessThan(0);
	});
});

// ─── tackTempCheck ────────────────────────────────────────────────────────────
describe('tackTempCheck', () => {
	it('returns null when airTempF is null', () => {
		expect(tackTempCheck(null)).toBeNull();
	});

	it('fail: below 40F (TEMP.TACK_MIN)', () => {
		const result = tackTempCheck(35);
		expect(result!.status).toBe('fail');
		expect(result!.clause).toBe('§413.3.05.A');
	});

	it('pass: above 45F', () => {
		const result = tackTempCheck(50);
		expect(result!.status).toBe('pass');
	});

	it('warn: borderline 42F (between 40 and 45)', () => {
		const result = tackTempCheck(42);
		expect(result!.status).toBe('warn');
	});

	it('warn: exactly at the 40F minimum (legal, inside the caution band)', () => {
		// §413.3.05.A allows emulsified asphalt at 40°F and above.
		// The app still warns until tempWarnMarginF (5°F) above that floor.
		const result = tackTempCheck(40);
		expect(result!.status).toBe('warn');
	});

	it('clause references §413.3.05.A', () => {
		const result = tackTempCheck(50);
		expect(result!.clause).toBe('§413.3.05.A');
	});
});

// ─── rainCheck ────────────────────────────────────────────────────────────────
describe('rainCheck', () => {
	it('returns null when totalRainIn is null', () => {
		expect(rainCheck(null)).toBeNull();
	});

	it('pass: exactly 0 inches (no rain)', () => {
		const result = rainCheck(0);
		expect(result!.status).toBe('pass');
	});

	it('warn: trace rain at 0.01 inches (rainWarnIn threshold)', () => {
		// rainWarnIn = 0.01in (trace rain — caution for tack/placement)
		const result = rainCheck(0.01);
		expect(result!.status).toBe('warn');
	});

	it('warn: moderate rain 0.05 inches (above warn, below block 0.10)', () => {
		const result = rainCheck(0.05);
		expect(result!.status).toBe('warn');
	});

	it('fail: at or above 0.10 inches (rainBlockIn)', () => {
		const result = rainCheck(0.10);
		expect(result!.status).toBe('fail');
	});

	it('fail: heavy rain 1.0 inches', () => {
		const result = rainCheck(1.0);
		expect(result!.status).toBe('fail');
	});

	it('totalIn is echoed back', () => {
		const result = rainCheck(0.30);
		expect(result!.totalIn).toBeCloseTo(0.30, 4);
	});

	it('clause references §400.3.05.E', () => {
		const result = rainCheck(0.5);
		expect(result!.clause).toBe('§400.3.05.E');
	});
});

describe('ogfcPemTempCheck', () => {
	it('ignores courses that are not OGFC or PEM', () => {
		expect(ogfcPemTempCheck(50, 'TOLERANCE.INTERMEDIATE_WEARING')).toBeNull();
		expect(ogfcPemTempCheck(50, null)).toBeNull();
	});

	it('applies the 60F floor to the Table 12 course ids job setup stores', () => {
		const ogfc = ogfcPemTempCheck(50, 'TOLERANCE.OGFC');
		const pem = ogfcPemTempCheck(50, 'TOLERANCE.PEM');
		expect(ogfc).not.toBeNull();
		expect(pem).not.toBeNull();
		expect(ogfc!.course).toBe('OGFC');
		expect(pem!.course).toBe('PEM');
		expect(ogfc!.minTempF).toBe(60);
		// 50°F is below the 60°F floor and outside the 5°F caution band.
		expect(ogfc!.status).toBe('fail');
		expect(pem!.status).toBe('fail');
	});

	it('also accepts the short ids', () => {
		expect(ogfcPemTempCheck(70, 'ogfc')!.status).toBe('pass');
		expect(ogfcPemTempCheck(70, 'pem')!.course).toBe('PEM');
	});

	it('pass at 60F, warn at 55F, fail below the margin', () => {
		expect(ogfcPemTempCheck(60, 'TOLERANCE.OGFC')!.status).toBe('pass');
		expect(ogfcPemTempCheck(55, 'TOLERANCE.PEM')!.status).toBe('warn');
		expect(ogfcPemTempCheck(54, 'TOLERANCE.OGFC')!.status).toBe('fail');
	});
});
