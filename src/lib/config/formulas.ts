// Paverate formulas. Each function maps to a Validation Matrix ID
// (see docs/validation-matrix.md) and reads every constant from the YAML config
// via constant() -- there are no magic numbers in this file.
import { constant, machine } from './index';

const LB_PER_TON = () => constant('CONST.LB_PER_TON');

/** CALC.SQ_YARDS -- area in square yards. */
export function squareYards(lengthFt: number, widthFt: number): number {
	return (lengthFt * widthFt) / constant('CONST.SF_PER_SY');
}

/**
 * CALC.SPREAD_PLACED -- placed spread rate (lbs/SY) from tons over an area.
 * Machine retention (CONST.SHUTTLE_RETAIN / CONST.PAVER_RETAIN) is subtracted
 * in tons BEFORE converting to pounds, and only when firstPass is true.
 */
export function spreadRatePlaced(opts: {
	tons: number;
	lengthFt: number;
	widthFt: number;
	machineId?: string;
	firstPass?: boolean;
}): number {
	const retain = opts.firstPass ? machine(opts.machineId ?? 'none').retainTons : 0;
	const pounds = (opts.tons - retain) * LB_PER_TON();
	const sy = squareYards(opts.lengthFt, opts.widthFt);
	return sy > 0 ? pounds / sy : 0;
}

/** CALC.SPREAD_THICK -- quick spread rate from thickness (in x 110). */
export function spreadRateFromThickness(thicknessIn: number): number {
	return thicknessIn * constant('CONST.THICK_MULT');
}

/**
 * tons -> feet engine shared by Remaining Distance and Feet Left Today.
 * Feet = Tons x 2000 x 9 / (Width x Rate).
 */
export function feetFromTons(tons: number, widthFt: number, rateLbsSy: number): number {
	const denom = widthFt * rateLbsSy;
	if (denom <= 0) return 0;
	return (tons * LB_PER_TON() * constant('CONST.SF_PER_SY')) / denom;
}

/**
 * CALC.ACTUAL_RATE -- placed spread rate (lbs/SY) implied by tons over a paved
 * distance and width. Inverse of feetFromTons: Rate = Tons x 2000 x 9 / (Width x Feet).
 * Pass either widthFt (preferred) or a pre-computed area in SY.
 */
export function actualSpreadRate(opts: {
	tons: number;
	distanceFt: number;
	widthFt: number;
}): number {
	const denom = opts.widthFt * opts.distanceFt;
	if (denom <= 0) return 0;
	return (opts.tons * LB_PER_TON() * constant('CONST.SF_PER_SY')) / denom;
}

/** CALC.REMAINING_DIST -- feet left from loads remaining. */
export function feetFromLoads(opts: {
	loads: number;
	tonsPerLoad?: number;
	widthFt: number;
	rateLbsSy: number;
}): number {
	const tonsPerLoad = opts.tonsPerLoad ?? constant('CONST.TRUCK_LOAD');
	return feetFromTons(opts.loads * tonsPerLoad, opts.widthFt, opts.rateLbsSy);
}

/** CALC.FEET_TODAY -- feet left from ordered minus placed. */
export function feetFromOrderedMinusPlaced(opts: {
	tonsOrdered: number;
	tonsPlaced: number;
	widthFt: number;
	rateLbsSy: number;
}): number {
	return feetFromTons(opts.tonsOrdered - opts.tonsPlaced, opts.widthFt, opts.rateLbsSy);
}

/** CALC.TACK_GALLONS -- gallons of tack for an area at a shot rate (gal/SY). */
export function tackGallons(lengthFt: number, widthFt: number, shotRateGalSy: number): number {
	return squareYards(lengthFt, widthFt) * shotRateGalSy;
}

/** CALC.TONNAGE -- tons to order for an area at a spread rate, with optional waste %. */
export function tonnageToOrder(opts: {
	lengthFt: number;
	widthFt: number;
	rateLbsSy: number;
	wastePct?: number;
}): number {
	const base = (squareYards(opts.lengthFt, opts.widthFt) * opts.rateLbsSy) / LB_PER_TON();
	return base * (1 + (opts.wastePct ?? 0) / 100);
}

/** CALC.STICK -- loose height behind the screed = compacted x 1.2. */
export function stickCheck(thicknessIn: number): number {
	return thicknessIn * constant('CONST.STICK_FACTOR');
}

/** CALC.SOIL_TONNAGE -- tons of soil/aggregate by depth + density. */
export function soilTonnage(opts: {
	lengthFt: number;
	widthFt: number;
	depthIn: number;
	pcf: number;
}): number {
	return (opts.lengthFt * opts.widthFt * (opts.depthIn / 12) * opts.pcf) / LB_PER_TON();
}

/** CALC.SOIL_LBS_SY -- placed weight per SY = depth(in) x pcf x 0.75. */
export function soilLbsPerSy(depthIn: number, pcf: number): number {
	return (depthIn / 12) * pcf * constant('CONST.SF_PER_SY');
}

/** CALC.COMPACTION -- field dry density / max dry density x 100. */
export function compactionPct(fieldDryPcf: number, maxDryPcf: number): number {
	return maxDryPcf > 0 ? (fieldDryPcf / maxDryPcf) * 100 : 0;
}

/** Field dry density from wet density and moisture fraction. */
export function fieldDryDensity(wetPcf: number, moistureFraction: number): number {
	return wetPcf / (1 + moistureFraction);
}

/** CALC.WATER_ADD -- gallons of water to reach optimum moisture. */
export function waterToAddGallons(opts: {
	areaSy: number;
	depthIn: number;
	dryDensityPcf: number;
	currentMoistureFraction: number;
	optimumMoistureFraction: number;
}): number {
	const dryLbs = opts.areaSy * (opts.depthIn / 12) * constant('CONST.SF_PER_SY') * opts.dryDensityPcf;
	const delta = opts.optimumMoistureFraction - opts.currentMoistureFraction;
	if (delta <= 0) return 0;
	return (dryLbs * delta) / constant('CONST.WATER_LB_GAL');
}

/** CALC.CONCRETE_VOLUME -- concrete volume in ft³ and yd³. */
export function concreteVolume(lengthFt: number, widthFt: number, depthIn: number): {
	volumeFt3: number;
	volumeYd3: number;
	bags80lb: number;
	truckLoads: number;
} {
	const volumeFt3 = lengthFt * widthFt * (depthIn / 12);
	const volumeYd3 = volumeFt3 / constant('CONST.CF_PER_CY');
	const bags80lb = volumeFt3 * constant('CONST.BAGS_PER_CF_80LB');
	const truckLoads = volumeYd3 / constant('CONST.CONCRETE_TRUCK_YD3');
	return { volumeFt3, volumeYd3, bags80lb, truckLoads };
}

/** CALC.SUBGRADE -- subgrade/base stone tonnage. */
export function subgradeTonnage(opts: {
	lengthFt: number;
	widthFt: number;
	depthIn: number;
	densityTonsPerYd3: number;
}): { cubicYards: number; tons: number; truckLoads: number } {
	const volumeFt3 = opts.lengthFt * opts.widthFt * (opts.depthIn / 12);
	const cubicYards = volumeFt3 / constant('CONST.CF_PER_CY');
	const tons = cubicYards * opts.densityTonsPerYd3;
	const truckLoads = tons / constant('CONST.STONE_TRUCK_TONS');
	return { cubicYards, tons, truckLoads };
}

/** CALC.SLOPE_GRADE -- slope grade percentage and angle. */
export function slopeGrade(riseFt: number, runFt: number): {
	gradePct: number;
	ratio: number;
	angleDeg: number;
} {
	const gradePct = runFt > 0 ? (riseFt / runFt) * 100 : 0;
	const ratio = riseFt > 0 ? runFt / riseFt : 0;
	const angleDeg = Math.atan(riseFt / runFt) * (180 / Math.PI);
	return { gradePct, ratio, angleDeg };
}

/** CALC.SOIL_COMPACTION -- soil compaction calculation. */
export function soilCompaction(opts: {
	wetWeightLbs: number;
	dryWeightLbs: number;
	volumeFt3: number;
	moisturePct: number;
	proctorMaxDryPcf: number;
}): {
	wetDensity: number;
	dryDensity: number;
	compactionPct: number;
	status: 'pass' | 'marginal' | 'fail';
} {
	const wetDensity = opts.wetWeightLbs / opts.volumeFt3;
	const dryDensity = opts.dryWeightLbs / opts.volumeFt3;
	const compactionPct =
		opts.proctorMaxDryPcf > 0 ? (dryDensity / opts.proctorMaxDryPcf) * 100 : 0;
	let status: 'pass' | 'marginal' | 'fail' = 'fail';
	if (compactionPct >= constant('CONST.COMPACTION_TARGET_MIN')) status = 'pass';
	else if (compactionPct >= constant('CONST.COMPACTION_MARGINAL_MIN')) status = 'marginal';
	return { wetDensity, dryDensity, compactionPct, status };
}
