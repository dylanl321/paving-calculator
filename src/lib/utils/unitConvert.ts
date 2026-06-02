// Pure unit conversion utilities for imperial <-> metric
// All conversion factors are defined as constants - no magic numbers

// Conversion constants
const FT_TO_M = 0.3048;
const M_TO_FT = 1 / FT_TO_M;

const SHORT_TON_TO_METRIC_TONNE = 0.907185;
const METRIC_TONNE_TO_SHORT_TON = 1 / SHORT_TON_TO_METRIC_TONNE;

const LBS_SY_TO_KG_M2 = 0.542492;
const KG_M2_TO_LBS_SY = 1 / LBS_SY_TO_KG_M2;

// Length conversions
export function toMeters(ft: number): number {
	return ft * FT_TO_M;
}

export function fromMeters(m: number): number {
	return m * M_TO_FT;
}

// Mass conversions
export function toMetricTonnes(tons: number): number {
	return tons * SHORT_TON_TO_METRIC_TONNE;
}

export function fromMetricTonnes(t: number): number {
	return t * METRIC_TONNE_TO_SHORT_TON;
}

// Spread rate conversions
export function toKgPerM2(lbsSy: number): number {
	return lbsSy * LBS_SY_TO_KG_M2;
}

export function fromKgPerM2(kgM2: number): number {
	return kgM2 * KG_M2_TO_LBS_SY;
}

// Unit labels for display
export const UNIT_LABELS = {
	ft: {
		imperial: 'ft',
		metric: 'm'
	},
	tons: {
		imperial: 'tons',
		metric: 't'
	},
	lbsSy: {
		imperial: 'lbs/SY',
		metric: 'kg/m²'
	}
} as const;
