// Typed access to the single-source YAML config (src/lib/config/paverate.yaml).
// The YAML is imported at build time by @rollup/plugin-yaml, so this stays a
// fast static PWA with no runtime config fetch.
import raw from './paverate.yaml';

export type Status = 'VERIFIED' | 'FIELD_ESTIMATE' | 'UNVERIFIED' | 'CONFLICT' | 'NA';

export interface ConstantEntry {
	value: number;
	unit?: string;
	tier?: number | null;
	status: Status;
	note?: string;
}

export interface RangeEntry {
	id: string;
	label: string;
	min: number;
	max: number;
	unit: string;
	tier?: number | null;
	status: Status;
}

export interface TempEntry {
	id: string;
	maxThicknessIn: number;
	minAirTempF: number;
	tier?: number | null;
	status: Status;
	note?: string;
}

export interface MixThicknessEntry {
	id: string;
	label: string;
	minLayerIn: number;
	maxLayerIn: number;
	maxTotalIn: number | null;
	tier?: number | null;
	status: Status;
}

export interface SpreadToleranceEntry {
	id: string;
	label: string;
	toleranceLbsSy: number;
	note?: string;
	tier?: number | null;
	status: Status;
}

export interface DensityEntry {
	id: string;
	label: string;
	minPcf: number;
	maxPcf: number;
	defaultPcf: number;
	tier?: number | null;
	status: Status;
}

export interface MaterialEntry {
	id: string;
	label: string;
	densityTonsPerYd3: number;
	tier?: number | null;
	status: Status;
}

export interface ConcretePsiEntry {
	psi: number;
	label: string;
	slumpIn: string;
	wcRatio: string;
	tier?: number | null;
	status: Status;
}

export interface SlopeReferenceEntry {
	label: string;
	gradePct: number;
	minPct?: number;
	maxPct?: number;
	tier?: number | null;
	status: Status;
}

export interface MachineEntry {
	id: string;
	label: string;
	retainTons: number;
}

export interface CalculatorEntry {
	id: string;
	title: string;
	subtitle: string;
	primary?: boolean;
	wide?: boolean;
}

export interface WeatherConfig {
	geocodeUrl: string;
	forecastUrl: string;
	refreshMinutes: number;
	rainWarnIn: number;
	rainBlockIn: number;
	tempWarnMarginF: number;
	ogfcMinAirTempF: number;
	tackMinAirTempF: number;
	wetSurfaceBlocked: boolean;
}

export interface JobSiteField {
	key: string;
	label?: string;
	hint?: string;
	unit?: string;
	type: string;
	step?: number;
}

export interface JobSiteSection {
	id: string;
	title: string;
	description: string;
	fields: JobSiteField[];
}

export interface JobSiteConfig {
	wasteOptions: number[];
	sections: JobSiteSection[];
}

export interface ThemeTokens {
	bg: string;
	surface: string;
	surfaceAlt: string;
	surfaceHover: string;
	border: string;
	text: string;
	textMuted: string;
	accent: string;
	accentText: string;
	good: string;
	warn: string;
	bad: string;
	badRgb: string;
}

export interface ThemeSet {
	dark: ThemeTokens;
	light: ThemeTokens;
}

export interface RefTable2Row {
	id: string;
	label: string;
	min_gal_yd2: number;
	max_gal_yd2: number;
	min_metric: string;
	max_metric: string;
}

export interface RefTable4Row {
	id: string;
	label: string;
	min_temp_f: number;
	min_temp_c: number;
	note?: string;
}

export interface RefTable5Row {
	id: string;
	label: string;
	min_layer: string;
	max_layer: string;
	max_total: string;
}

export interface RefTable12Row {
	id: string;
	label: string;
	thickness_tolerance: string;
	spread_tolerance: string;
	note?: string;
}

export interface ReferenceTables {
	table_2: RefTable2Row[];
	table_4: RefTable4Row[];
	table_5: RefTable5Row[];
	table_12: RefTable12Row[];
}

interface PaverateConfig {
	app: { name: string; tagline: string };
	theme: ThemeSet;
	constants: Record<string, ConstantEntry>;
	defaults: {
		roadWidthFt: number;
		truckLoadTons: number;
		machine: string;
		firstPass: boolean;
		tackApplication: string;
		wastePct: number;
		courseType: string;
	};
	machines: MachineEntry[];
	tack: {
		field: RangeEntry[];
		spec: RangeEntry[];
		notes: { id: string; text: string; tier?: number | null; status: Status }[];
	};
	weather: WeatherConfig;
	jobSite: JobSiteConfig;
	temperature: TempEntry[];
	mixThickness: MixThicknessEntry[];
	spreadTolerance: SpreadToleranceEntry[];
	densities: DensityEntry[];
	materials?: MaterialEntry[];
	concretePsi?: ConcretePsiEntry[];
	slopeReference?: SlopeReferenceEntry[];
	reference_tables: ReferenceTables;
	calculators: CalculatorEntry[];
}

export const config = raw as unknown as PaverateConfig;

/** Read a constant's numeric value by its matrix ID (e.g. "CONST.LB_PER_TON"). */
export function constant(id: string): number {
	const key = id.startsWith('CONST.') ? id.slice('CONST.'.length) : id;
	const entry = config.constants[key];
	if (!entry) throw new Error(`Unknown constant: ${id}`);
	return entry.value;
}

/** Read a constant's full metadata (value, unit, status) by ID. */
export function constantMeta(id: string): ConstantEntry {
	const key = id.startsWith('CONST.') ? id.slice('CONST.'.length) : id;
	const entry = config.constants[key];
	if (!entry) throw new Error(`Unknown constant: ${id}`);
	return entry;
}

export const theme = config.theme;
export const defaults = config.defaults;
export const machines = config.machines;
export const calculators = config.calculators;
export const densities = config.densities;
export const materials = config.materials;
export const concretePsi = config.concretePsi;
export const slopeReference = config.slopeReference;
export const tack = config.tack;
export const temperature = config.temperature;
export const mixThickness = config.mixThickness;
export const spreadTolerance = config.spreadTolerance;
export const referenceTables = config.reference_tables;

export function machine(id: string): MachineEntry {
	return config.machines.find((m) => m.id === id) ?? config.machines[0];
}

const STATUS_TEXT: Record<Status, string> = {
	VERIFIED: 'Spec verified',
	FIELD_ESTIMATE: 'Field estimate',
	UNVERIFIED: 'Pending verification',
	CONFLICT: 'Source conflict',
	NA: 'Math / geometry'
};

/** Human-readable label for a verification status (for source badges). */
export function statusLabel(status: Status): string {
	return STATUS_TEXT[status] ?? status;
}

/** Mid-point of a tack range (used as the default suggested shot rate). */
export function tackMid(entry: RangeEntry): number {
	return (entry.min + entry.max) / 2;
}

/** Find a tack application (field range) by its id. */
export function tackFieldById(id: string): RangeEntry | undefined {
	return config.tack.field.find((t) => t.id === id);
}

export const weatherConfig: WeatherConfig = config.weather;
export const jobSite = config.jobSite;

/** GDOT Table 4 minimum air temp for a given lift thickness. */
export function minAirTempForThickness(thicknessIn: number): TempEntry {
	const sorted = [...config.temperature].sort((a, b) => a.maxThicknessIn - b.maxThicknessIn);
	return sorted.find((t) => thicknessIn <= t.maxThicknessIn) ?? sorted[sorted.length - 1];
}

/** GDOT Table 12 spread-rate tolerance entry for a course-type id. */
export function spreadToleranceFor(courseId: string | null | undefined): SpreadToleranceEntry {
	return (
		config.spreadTolerance.find((t) => t.id === courseId) ??
		config.spreadTolerance.find((t) => t.id === config.defaults.courseType) ??
		config.spreadTolerance[0]
	);
}

export type SpreadSpecStatus = 'good' | 'warn' | 'bad';

export interface SpreadSpecCheck {
	status: SpreadSpecStatus;
	toleranceLbsSy: number;
	deltaLbsSy: number;
	label: string;
	courseLabel: string;
	message: string;
	clause: string;
	clauseTitle: string;
}

/**
 * Judge a placed spread rate against a target using the GDOT Table 12 absolute
 * tolerance (lbs/yd²) for the selected course type — replacing a flat percentage.
 * Inside ±tolerance = good; within 1.5× tolerance = warn; beyond = bad.
 */
export function spreadSpecCheck(
	placedLbsSy: number | null,
	targetLbsSy: number | null,
	courseId: string | null | undefined
): SpreadSpecCheck | null {
	if (placedLbsSy == null || targetLbsSy == null || targetLbsSy <= 0) return null;
	const tol = spreadToleranceFor(courseId);
	const delta = placedLbsSy - targetLbsSy;
	const absDelta = Math.abs(delta);
	const direction = delta > 0 ? 'high' : 'low';
	const off = `${Math.round(absDelta)} lbs/SY ${direction}`;

	if (absDelta <= tol.toleranceLbsSy) {
		return {
			status: 'good',
			toleranceLbsSy: tol.toleranceLbsSy,
			deltaLbsSy: delta,
			label: 'In spec',
			courseLabel: tol.label,
			message: `Within ±${tol.toleranceLbsSy} lbs/SY (Table 12, ${tol.label})`,
			clause: '§400.4.A.2.b Table 12',
			clauseTitle: 'Spread Rate Tolerance'
		};
	}
	if (absDelta <= tol.toleranceLbsSy * 1.5) {
		return {
			status: 'warn',
			toleranceLbsSy: tol.toleranceLbsSy,
			deltaLbsSy: delta,
			label: `Marginal — ${off}`,
			courseLabel: tol.label,
			message: `${off}; tolerance is ±${tol.toleranceLbsSy} lbs/SY (Table 12, ${tol.label})`,
			clause: '§400.4.A.2.b Table 12',
			clauseTitle: 'Spread Rate Tolerance'
		};
	}
	return {
		status: 'bad',
		toleranceLbsSy: tol.toleranceLbsSy,
		deltaLbsSy: delta,
		label: `Out of spec — ${off}`,
		courseLabel: tol.label,
		message: `${off}; exceeds ±${tol.toleranceLbsSy} lbs/SY (Table 12, ${tol.label})`,
		clause: '§400.4.A.2.b Table 12',
		clauseTitle: 'Spread Rate Tolerance'
	};
}

export type PlacementStatus = 'pass' | 'warn' | 'fail';

export interface PlacementCheck {
	status: PlacementStatus;
	minTempF: number;
	message: string;
	clause: string;
	clauseTitle: string;
}

/** Compare live air temp against GDOT Table 4 minimum for the job lift thickness. */
export function placementCheck(airTempF: number | null, thicknessIn: number): PlacementCheck | null {
	if (airTempF == null || thicknessIn <= 0) return null;
	const entry = minAirTempForThickness(thicknessIn);
	const margin = weatherConfig.tempWarnMarginF;
	if (airTempF >= entry.minAirTempF) {
		return {
			status: 'pass',
			minTempF: entry.minAirTempF,
			message: `Air temp OK for ${thicknessIn}" lift (min ${entry.minAirTempF}°F per Table 4)`,
			clause: '§400.3.05.E Table 4',
			clauseTitle: 'HMA Lift Thickness — Weather Limitations'
		};
	}
	if (airTempF >= entry.minAirTempF - margin) {
		return {
			status: 'warn',
			minTempF: entry.minAirTempF,
			message: `Borderline — ${airTempF}°F is within ${margin}°F of ${entry.minAirTempF}°F minimum for ${thicknessIn}" lift`,
			clause: '§400.3.05.E Table 4',
			clauseTitle: 'HMA Lift Thickness — Weather Limitations'
		};
	}
	return {
		status: 'fail',
		minTempF: entry.minAirTempF,
		message: `Too cold — ${airTempF}°F is below ${entry.minAirTempF}°F minimum for ${thicknessIn}" lift`,
		clause: '§400.3.05.E Table 4',
		clauseTitle: 'HMA Lift Thickness — Weather Limitations'
	};
}

export interface RainCheck {
	status: PlacementStatus;
	totalIn: number;
	message: string;
	clause: string;
	clauseTitle: string;
}

export interface TackTempCheck {
	status: PlacementStatus;
	message: string;
	clause: string;
	clauseTitle: string;
}

/** Tack coat air temperature check — GDOT §413.3.05.A requires ≥40°F. */
export function tackTempCheck(airTempF: number | null): TackTempCheck | null {
	if (airTempF == null) return null;
	const minTemp = weatherConfig.tackMinAirTempF;
	if (airTempF < minTemp) {
		return {
			status: 'fail',
			message: `Too cold for tack coat — §413.3.05.A requires air temp ≥ ${minTemp}°F in shade`,
			clause: '§413.3.05.A',
			clauseTitle: 'Tack Coat — Seasonal & Weather Limitation'
		};
	}
	if (airTempF < minTemp + 5) {
		return {
			status: 'warn',
			message: `Borderline for tack — air temp is near ${minTemp}°F minimum`,
			clause: '§413.3.05.A',
			clauseTitle: 'Tack Coat — Seasonal & Weather Limitation'
		};
	}
	return {
		status: 'pass',
		message: `Air temp OK for tack coat (min ${minTemp}°F)`,
		clause: '§413.3.05.A',
		clauseTitle: 'Tack Coat — Seasonal & Weather Limitation'
	};
}

/** Rain forecast check for paving / tack decisions. */
export function rainCheck(totalRainIn: number | null): RainCheck | null {
	if (totalRainIn == null) return null;
	if (totalRainIn >= weatherConfig.rainBlockIn) {
		return {
			status: 'fail',
			totalIn: totalRainIn,
			message: `${totalRainIn.toFixed(2)} in rain forecast — do not pave or tack on wet surfaces`,
			clause: '§400.3.05.E',
			clauseTitle: 'HMA Weather Limitations — Wet/Frozen Surface'
		};
	}
	if (totalRainIn >= weatherConfig.rainWarnIn) {
		return {
			status: 'warn',
			totalIn: totalRainIn,
			message: `${totalRainIn.toFixed(2)} in rain forecast — watch tack timing and surface moisture`,
			clause: '§400.3.05.E',
			clauseTitle: 'HMA Weather Limitations — Wet/Frozen Surface'
		};
	}
	return {
		status: 'pass',
		totalIn: totalRainIn,
		message: `No significant rain in next 24 h (${totalRainIn.toFixed(2)} in)`,
		clause: '§400.3.05.E',
		clauseTitle: 'HMA Weather Limitations — Wet/Frozen Surface'
	};
}
