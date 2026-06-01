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

export interface DensityEntry {
	id: string;
	label: string;
	minPcf: number;
	maxPcf: number;
	defaultPcf: number;
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

export interface ThemeTokens {
	bg: string;
	surface: string;
	surfaceAlt: string;
	border: string;
	text: string;
	textMuted: string;
	accent: string;
	accentText: string;
	good: string;
	warn: string;
	bad: string;
}

export interface ThemeSet {
	dark: ThemeTokens;
	light: ThemeTokens;
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
	};
	machines: MachineEntry[];
	tack: {
		field: RangeEntry[];
		spec: RangeEntry[];
		notes: { id: string; text: string; tier?: number | null; status: Status }[];
	};
	temperature: TempEntry[];
	mixThickness: MixThicknessEntry[];
	densities: DensityEntry[];
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
export const tack = config.tack;
export const temperature = config.temperature;
export const mixThickness = config.mixThickness;

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
