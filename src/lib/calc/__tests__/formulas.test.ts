/**
 * Unit tests for src/lib/config/formulas.ts (exported via src/lib/calc/index.ts)
 * All expected values derived from GDOT specs and validation-matrix.md constants.
 *
 * Constants used (from paverate.yaml):
 *   SF_PER_SY = 9
 *   LB_PER_TON = 2000
 *   CF_PER_CY = 27
 *   WATER_LB_GAL = 8.34
 *   THICK_MULT = 110
 *   STICK_FACTOR = 1.25
 *   TRUCK_LOAD = 18.5
 *   PAVER_RETAIN = 14
 *   SHUTTLE_RETAIN = 24
 *   BAGS_PER_CF_80LB = 0.45
 *   CONCRETE_TRUCK_YD3 = 9
 *   STONE_TRUCK_TONS = 18
 */
import { describe, it, expect } from 'vitest';
import {
	squareYards,
	spreadRatePlaced,
	spreadRateFromThickness,
	feetFromTons,
	actualSpreadRate,
	feetFromLoads,
	feetFromOrderedMinusPlaced,
	tackGallons,
	tonnageToOrder,
	stickCheck,
	soilTonnage,
	soilLbsPerSy,
	compactionPct,
	fieldDryDensity,
	waterToAddGallons,
	concreteVolume,
	subgradeTonnage,
	slopeGrade,
	soilCompaction,
	intersectionArea,
	variableWidthArea
} from '../index';

// ─── squareYards ─────────────────────────────────────────────────────────────
describe('squareYards', () => {
	it('converts 100ft x 18ft lane to 200 SY', () => {
		// 100 * 18 / 9 = 200
		expect(squareYards(100, 18)).toBeCloseTo(200, 4);
	});

	it('1320ft (quarter mile) x 12ft = 1760 SY', () => {
		// 1320 * 12 / 9 = 1760
		expect(squareYards(1320, 12)).toBeCloseTo(1760, 4);
	});

	it('returns 0 when either dimension is 0', () => {
		expect(squareYards(0, 18)).toBe(0);
		expect(squareYards(100, 0)).toBe(0);
	});

	it('handles fractional feet', () => {
		// 9ft x 9ft = 81 sqft = 9 SY
		expect(squareYards(9, 9)).toBeCloseTo(9, 4);
	});
});

// ─── spreadRatePlaced ─────────────────────────────────────────────────────────
describe('spreadRatePlaced', () => {
	it('computes rate with no retention (not first pass)', () => {
		// 10 tons, 100ft x 18ft (200 SY), no retain
		// rate = (10 * 2000) / 200 = 100 lbs/SY
		expect(spreadRatePlaced({ tons: 10, lengthFt: 100, widthFt: 18, firstPass: false })).toBeCloseTo(100, 2);
	});

	it('returns 0 when area is 0', () => {
		expect(spreadRatePlaced({ tons: 10, lengthFt: 0, widthFt: 18 })).toBe(0);
	});

	it('subtracts paver retention (14 tons) on first pass with machineId: paver', () => {
		// machine 'paver' retains 14 tons
		// (100 - 14) * 2000 / 200 = 86 * 2000 / 200 = 860 lbs/SY
		expect(spreadRatePlaced({ tons: 100, lengthFt: 100, widthFt: 18, machineId: 'paver', firstPass: true })).toBeCloseTo(860, 1);
	});

	it('no retention when machineId: none, even on first pass', () => {
		// machine 'none' retains 0 tons
		// 100 * 2000 / 200 = 1000 lbs/SY
		expect(spreadRatePlaced({ tons: 100, lengthFt: 100, widthFt: 18, machineId: 'none', firstPass: true })).toBeCloseTo(1000, 1);
	});

	it('handles very large tonnage (stress test)', () => {
		// 1000 tons over 10000 SY = 200 lbs/SY
		const sy = 10000; // 90000ft / 9
		expect(spreadRatePlaced({ tons: 1000, lengthFt: 1000, widthFt: 90, firstPass: false })).toBeCloseTo(200, 2);
	});
});

// ─── spreadRateFromThickness ──────────────────────────────────────────────────
describe('spreadRateFromThickness', () => {
	it('1.5 inch lift -> 165 lbs/SY (1.5 x 110)', () => {
		expect(spreadRateFromThickness(1.5)).toBeCloseTo(165, 4);
	});

	it('2 inch lift -> 220 lbs/SY', () => {
		expect(spreadRateFromThickness(2)).toBeCloseTo(220, 4);
	});

	it('3 inch lift -> 330 lbs/SY', () => {
		expect(spreadRateFromThickness(3)).toBeCloseTo(330, 4);
	});

	it('0 thickness returns 0', () => {
		expect(spreadRateFromThickness(0)).toBe(0);
	});
});

// ─── feetFromTons ─────────────────────────────────────────────────────────────
describe('feetFromTons', () => {
	it('computes remaining feet from tons remaining', () => {
		// 10 tons, 12ft wide, 165 lbs/SY
		// feet = 10 * 2000 * 9 / (12 * 165) = 180000 / 1980 = 90.909...
		expect(feetFromTons(10, 12, 165)).toBeCloseTo(90.91, 1);
	});

	it('returns 0 when width is 0', () => {
		expect(feetFromTons(10, 0, 165)).toBe(0);
	});

	it('returns 0 when rate is 0', () => {
		expect(feetFromTons(10, 12, 0)).toBe(0);
	});

	it('returns 0 when tons is 0', () => {
		expect(feetFromTons(0, 12, 165)).toBe(0);
	});

	it('supports the active-job production check path', () => {
		const targetRate = spreadRateFromThickness(2);
		const actualRate = spreadRatePlaced({
			tons: 22,
			lengthFt: 150,
			widthFt: 12,
			firstPass: false
		});
		const reachableFeet = feetFromTons(40, 12, targetRate);

		expect(targetRate).toBeCloseTo(220, 4);
		expect(actualRate).toBeCloseTo(220, 4);
		expect(reachableFeet).toBeCloseTo(272.73, 2);
	});
});

// ─── actualSpreadRate ─────────────────────────────────────────────────────────
describe('actualSpreadRate', () => {
	it('is inverse of feetFromTons', () => {
		// if feetFromTons(10, 12, 165) = X, then actualSpreadRate(10, X, 12) = 165
		const feet = feetFromTons(10, 12, 165);
		expect(actualSpreadRate({ tons: 10, distanceFt: feet, widthFt: 12 })).toBeCloseTo(165, 2);
	});

	it('returns 0 for zero distance', () => {
		expect(actualSpreadRate({ tons: 10, distanceFt: 0, widthFt: 12 })).toBe(0);
	});

	it('returns 0 for zero width', () => {
		expect(actualSpreadRate({ tons: 10, distanceFt: 100, widthFt: 0 })).toBe(0);
	});
});

// ─── feetFromLoads ────────────────────────────────────────────────────────────
describe('feetFromLoads', () => {
	it('computes feet from loads using default truck load (18.5 tons)', () => {
		// 1 load * 18.5 tons, 12ft wide, 165 lbs/SY
		const expected = feetFromTons(18.5, 12, 165);
		expect(feetFromLoads({ loads: 1, widthFt: 12, rateLbsSy: 165 })).toBeCloseTo(expected, 4);
	});

	it('uses custom tonsPerLoad when provided', () => {
		const expected = feetFromTons(20, 12, 165);
		expect(feetFromLoads({ loads: 1, tonsPerLoad: 20, widthFt: 12, rateLbsSy: 165 })).toBeCloseTo(expected, 4);
	});

	it('returns 0 for 0 loads', () => {
		expect(feetFromLoads({ loads: 0, widthFt: 12, rateLbsSy: 165 })).toBe(0);
	});
});

// ─── feetFromOrderedMinusPlaced ───────────────────────────────────────────────
describe('feetFromOrderedMinusPlaced', () => {
	it('computes feet left today', () => {
		// 100 ordered - 60 placed = 40 tons remaining, 12ft wide, 165 lbs/SY
		const expected = feetFromTons(40, 12, 165);
		expect(feetFromOrderedMinusPlaced({ tonsOrdered: 100, tonsPlaced: 60, widthFt: 12, rateLbsSy: 165 })).toBeCloseTo(expected, 4);
	});

	it('returns 0 when placed equals ordered', () => {
		expect(feetFromOrderedMinusPlaced({ tonsOrdered: 100, tonsPlaced: 100, widthFt: 12, rateLbsSy: 165 })).toBe(0);
	});

	it('returns negative when placed > ordered (over-order)', () => {
		// placed > ordered => negative tons => negative feet
		expect(feetFromOrderedMinusPlaced({ tonsOrdered: 100, tonsPlaced: 120, widthFt: 12, rateLbsSy: 165 })).toBeLessThan(0);
	});
});

// ─── tackGallons ──────────────────────────────────────────────────────────────
describe('tackGallons', () => {
	it('at TACK.NEW_AC midpoint (0.065 gal/SY), 100ft x 12ft = 86.67 gal', () => {
		// SY = 100*12/9 = 133.33
		// gal = 133.33 * 0.065 = 8.667 gal
		expect(tackGallons(100, 12, 0.065)).toBeCloseTo(8.667, 2);
	});

	it('at TACK.NEW_AC min rate (0.05), 1320ft x 24ft road', () => {
		// SY = 1320*24/9 = 3520
		// gal = 3520 * 0.05 = 176
		expect(tackGallons(1320, 24, 0.05)).toBeCloseTo(176, 2);
	});

	it('at TACK.NEW_AC max rate (0.08), 1320ft x 24ft', () => {
		// gal = 3520 * 0.08 = 281.6
		expect(tackGallons(1320, 24, 0.08)).toBeCloseTo(281.6, 2);
	});

	it('returns 0 for zero length', () => {
		expect(tackGallons(0, 12, 0.065)).toBe(0);
	});
});

// ─── tonnageToOrder ───────────────────────────────────────────────────────────
describe('tonnageToOrder', () => {
	it('200 SY at 165 lbs/SY = 16.5 tons, no waste', () => {
		// SY = 100*18/9 = 200
		// tons = 200 * 165 / 2000 = 16.5
		expect(tonnageToOrder({ lengthFt: 100, widthFt: 18, rateLbsSy: 165 })).toBeCloseTo(16.5, 4);
	});

	it('applies waste percentage', () => {
		// 16.5 tons * 1.05 = 17.325 with 5% waste
		expect(tonnageToOrder({ lengthFt: 100, widthFt: 18, rateLbsSy: 165, wastePct: 5 })).toBeCloseTo(17.325, 4);
	});

	it('zero area returns 0', () => {
		expect(tonnageToOrder({ lengthFt: 0, widthFt: 18, rateLbsSy: 165 })).toBe(0);
	});

	it('zero spread rate returns 0', () => {
		expect(tonnageToOrder({ lengthFt: 100, widthFt: 18, rateLbsSy: 0 })).toBe(0);
	});

	it('>100% waste is mathematically allowed (validation is UI concern)', () => {
		// 200 SY at 165 with 200% waste = base * 3
		expect(tonnageToOrder({ lengthFt: 100, widthFt: 18, rateLbsSy: 165, wastePct: 200 })).toBeCloseTo(49.5, 4);
	});
});

// ─── stickCheck ───────────────────────────────────────────────────────────────
describe('stickCheck', () => {
	it('2 inch compacted -> 2.5 inches loose (2 x 1.25)', () => {
		expect(stickCheck(2)).toBeCloseTo(2.5, 4);
	});

	it('1.5 inch compacted -> 1.875 inches loose', () => {
		expect(stickCheck(1.5)).toBeCloseTo(1.875, 4);
	});

	it('0 thickness -> 0', () => {
		expect(stickCheck(0)).toBe(0);
	});
});

// ─── soilTonnage ──────────────────────────────────────────────────────────────
describe('soilTonnage', () => {
	it('100ft x 50ft x 6in at 125 pcf = 156.25 tons', () => {
		// V = 100 * 50 * (6/12) = 2500 ft3
		// tons = 2500 * 125 / 2000 = 156.25
		expect(soilTonnage({ lengthFt: 100, widthFt: 50, depthIn: 6, pcf: 125 })).toBeCloseTo(156.25, 4);
	});

	it('returns 0 for zero depth', () => {
		expect(soilTonnage({ lengthFt: 100, widthFt: 50, depthIn: 0, pcf: 125 })).toBe(0);
	});

	it('returns 0 for zero pcf', () => {
		expect(soilTonnage({ lengthFt: 100, widthFt: 50, depthIn: 6, pcf: 0 })).toBe(0);
	});
});

// ─── soilLbsPerSy ─────────────────────────────────────────────────────────────
describe('soilLbsPerSy', () => {
	it('6in depth at 125 pcf = 562.5 lbs/SY', () => {
		// (6/12) * 125 * 9 = 0.5 * 125 * 9 = 562.5
		expect(soilLbsPerSy(6, 125)).toBeCloseTo(562.5, 4);
	});

	it('returns 0 for 0 depth', () => {
		expect(soilLbsPerSy(0, 125)).toBe(0);
	});
});

// ─── compactionPct ─────────────────────────────────────────────────────────────
describe('compactionPct', () => {
	it('119 pcf field / 125 pcf max = 95.2%', () => {
		expect(compactionPct(119, 125)).toBeCloseTo(95.2, 1);
	});

	it('returns 0 when maxDry is 0', () => {
		expect(compactionPct(119, 0)).toBe(0);
	});

	it('100% when field equals max', () => {
		expect(compactionPct(125, 125)).toBeCloseTo(100, 4);
	});
});

// ─── fieldDryDensity ──────────────────────────────────────────────────────────
describe('fieldDryDensity', () => {
	it('wet=130 pcf, moisture fraction=0.10 -> 118.18 pcf dry', () => {
		expect(fieldDryDensity(130, 0.10)).toBeCloseTo(118.18, 1);
	});

	it('zero moisture fraction: dry = wet', () => {
		expect(fieldDryDensity(125, 0)).toBeCloseTo(125, 4);
	});
});

// ─── waterToAddGallons ────────────────────────────────────────────────────────
describe('waterToAddGallons', () => {
	it('computes water to add to reach OMC', () => {
		// 500 SY, 6in depth, 120 pcf dry, CMC=0.08, OMC=0.12
		// dryLbs = 500 * (6/12) * 9 * 120 = 500 * 0.5 * 9 * 120 = 270000
		// delta = 0.12 - 0.08 = 0.04
		// gal = 270000 * 0.04 / 8.34 = 10800 / 8.34 = 1294.96
		expect(waterToAddGallons({
			areaSy: 500,
			depthIn: 6,
			dryDensityPcf: 120,
			currentMoistureFraction: 0.08,
			optimumMoistureFraction: 0.12
		})).toBeCloseTo(1294.96, 0);
	});

	it('returns 0 when current moisture >= optimum', () => {
		expect(waterToAddGallons({
			areaSy: 500,
			depthIn: 6,
			dryDensityPcf: 120,
			currentMoistureFraction: 0.15,
			optimumMoistureFraction: 0.12
		})).toBe(0);
	});
});

// ─── concreteVolume ───────────────────────────────────────────────────────────
describe('concreteVolume', () => {
	it('10ft x 10ft x 4in slab volume', () => {
		// ft3 = 10 * 10 * (4/12) = 33.333
		// yd3 = 33.333 / 27 = 1.234
		const result = concreteVolume(10, 10, 4);
		expect(result.volumeFt3).toBeCloseTo(33.333, 1);
		expect(result.volumeYd3).toBeCloseTo(1.234, 2);
	});

	it('bags and truck loads scale with volume', () => {
		const result = concreteVolume(10, 10, 4);
		// bags = ft3 * 0.45 = 33.33 * 0.45 = 15
		expect(result.bags80lb).toBeCloseTo(15, 0);
		// truckLoads = yd3 / 9 = 1.234/9 = 0.137
		expect(result.truckLoads).toBeCloseTo(0.137, 2);
	});

	it('zero depth returns zero volumes', () => {
		const result = concreteVolume(10, 10, 0);
		expect(result.volumeFt3).toBe(0);
		expect(result.volumeYd3).toBe(0);
	});
});

// ─── subgradeTonnage ──────────────────────────────────────────────────────────
describe('subgradeTonnage', () => {
	it('100ft x 24ft x 6in at 1.4 t/yd3', () => {
		// ft3 = 100 * 24 * 0.5 = 1200
		// yd3 = 1200 / 27 = 44.444
		// tons = 44.444 * 1.4 = 62.22
		const result = subgradeTonnage({ lengthFt: 100, widthFt: 24, depthIn: 6, densityTonsPerYd3: 1.4 });
		expect(result.cubicYards).toBeCloseTo(44.444, 1);
		expect(result.tons).toBeCloseTo(62.22, 1);
		// truckLoads = 62.22 / 18 = 3.46
		expect(result.truckLoads).toBeCloseTo(3.46, 1);
	});

	it('zero depth returns zeros', () => {
		const result = subgradeTonnage({ lengthFt: 100, widthFt: 24, depthIn: 0, densityTonsPerYd3: 1.4 });
		expect(result.tons).toBe(0);
	});
});

// ─── slopeGrade ───────────────────────────────────────────────────────────────
describe('slopeGrade', () => {
	it('2ft rise over 100ft run = 2% grade', () => {
		const result = slopeGrade(2, 100);
		expect(result.gradePct).toBeCloseTo(2, 4);
	});

	it('computes ratio and angle', () => {
		const result = slopeGrade(1, 20);
		expect(result.ratio).toBeCloseTo(20, 4);
		expect(result.angleDeg).toBeCloseTo(2.862, 2);
	});

	it('returns 0 grade for zero run', () => {
		const result = slopeGrade(5, 0);
		expect(result.gradePct).toBe(0);
	});
});

// ─── soilCompaction ───────────────────────────────────────────────────────────
describe('soilCompaction', () => {
	it('pass: 95% compaction', () => {
		// field dry = 119/1 = 119 pcf (wetWeight and dryWeight equal at 0% moisture)
		// compaction = 119 / 125 * 100 = 95.2% => pass
		const result = soilCompaction({
			wetWeightLbs: 119,
			dryWeightLbs: 119,
			volumeFt3: 1,
			moisturePct: 0,
			proctorMaxDryPcf: 125
		});
		expect(result.compactionPct).toBeCloseTo(95.2, 1);
		expect(result.status).toBe('pass');
	});

	it('marginal: between 92% and 95%', () => {
		// 115/125 = 92% => marginal
		const result = soilCompaction({
			wetWeightLbs: 115,
			dryWeightLbs: 115,
			volumeFt3: 1,
			moisturePct: 0,
			proctorMaxDryPcf: 125
		});
		expect(result.status).toBe('marginal');
	});

	it('fail: below 92%', () => {
		// 110/125 = 88% => fail
		const result = soilCompaction({
			wetWeightLbs: 110,
			dryWeightLbs: 110,
			volumeFt3: 1,
			moisturePct: 0,
			proctorMaxDryPcf: 125
		});
		expect(result.status).toBe('fail');
	});

	it('returns 0 compactionPct when proctorMaxDry is 0', () => {
		const result = soilCompaction({
			wetWeightLbs: 119,
			dryWeightLbs: 119,
			volumeFt3: 1,
			moisturePct: 0,
			proctorMaxDryPcf: 0
		});
		expect(result.compactionPct).toBe(0);
		expect(result.status).toBe('fail');
	});
});

// ─── intersectionArea ─────────────────────────────────────────────────────────
describe('intersectionArea', () => {
	it('two perpendicular 12ft roads: 200ft x 12ft and 200ft x 12ft', () => {
		// road1Sy = 200*12/9 = 266.67
		// road2Sy = 200*12/9 = 266.67
		// overlapSy = 12*12/9 = 16
		// totalSy = 266.67 + 266.67 - 16 = 517.33
		const result = intersectionArea({
			road1LengthFt: 200,
			road1WidthFt: 12,
			road2LengthFt: 200,
			road2WidthFt: 12,
			rateLbsSy: 165
		});
		expect(result.road1Sy).toBeCloseTo(266.67, 1);
		expect(result.overlapSy).toBeCloseTo(16, 2);
		expect(result.totalSy).toBeCloseTo(517.33, 1);
		// tons = 517.33 * 165 / 2000 = 42.68
		expect(result.tons).toBeCloseTo(42.68, 1);
	});

	it('applies waste percentage', () => {
		const base = intersectionArea({
			road1LengthFt: 200,
			road1WidthFt: 12,
			road2LengthFt: 200,
			road2WidthFt: 12,
			rateLbsSy: 165
		});
		const withWaste = intersectionArea({
			road1LengthFt: 200,
			road1WidthFt: 12,
			road2LengthFt: 200,
			road2WidthFt: 12,
			rateLbsSy: 165,
			wastePct: 5
		});
		expect(withWaste.tons).toBeCloseTo(base.tons * 1.05, 3);
	});
});

// ─── variableWidthArea ────────────────────────────────────────────────────────
describe('variableWidthArea', () => {
	it('turn lane: 100ft, 12ft to 24ft taper', () => {
		// avgWidth = (12+24)/2 = 18ft
		// areaSy = 100*18/9 = 200
		// tons = 200 * 165 / 2000 = 16.5
		const result = variableWidthArea({ lengthFt: 100, startWidthFt: 12, endWidthFt: 24, rateLbsSy: 165 });
		expect(result.avgWidthFt).toBeCloseTo(18, 4);
		expect(result.areaSy).toBeCloseTo(200, 4);
		expect(result.tons).toBeCloseTo(16.5, 4);
	});

	it('uniform width (degenerate taper) matches tonnageToOrder', () => {
		const r = variableWidthArea({ lengthFt: 100, startWidthFt: 18, endWidthFt: 18, rateLbsSy: 165 });
		const expected = tonnageToOrder({ lengthFt: 100, widthFt: 18, rateLbsSy: 165 });
		expect(r.tons).toBeCloseTo(expected, 4);
	});

	it('zero length returns zero area and tons', () => {
		const result = variableWidthArea({ lengthFt: 0, startWidthFt: 12, endWidthFt: 24, rateLbsSy: 165 });
		expect(result.areaSy).toBe(0);
		expect(result.tons).toBe(0);
	});
});
