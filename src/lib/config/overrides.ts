// Org-level override layer for the static YAML config.
//
// Organizations can override a small, whitelisted set of global defaults,
// calculation constants, and tack-rate presets. Only changed keys are stored
// (as JSON in D1). This module defines the override shape, the whitelist, the
// validation rules, and a resolver that merges overrides on top of the static
// config from paverate.yaml. When no overrides are present (anonymous/offline),
// the static YAML values are returned unchanged.
import { config, type RangeEntry } from './index';

export interface OrgDefaultsOverride {
	roadWidthFt?: number;
	truckLoadTons?: number;
	machine?: string;
	firstPass?: boolean;
	tackApplication?: string;
	wastePct?: number;
	courseType?: string;
	liftThicknessIn?: number;
	mixType?: string;
}

export interface OrgTackOverride {
	field?: RangeEntry[];
	spec?: RangeEntry[];
}

export interface OrgOverrides {
	constants?: Record<string, number>;
	defaults?: OrgDefaultsOverride;
	tack?: OrgTackOverride;
	spreadTolerances?: Record<string, number>;
}

/**
 * Whitelist of constants an org may override, with allowed numeric ranges.
 * Anything not listed here is rejected so a bad value can't corrupt a
 * calculation or escape its physical bounds.
 */
export const OVERRIDABLE_CONSTANTS: Record<string, { min: number; max: number; label: string }> = {
	THICK_MULT: { min: 90, max: 130, label: 'Spread-rate multiplier (lbs/SY per inch)' },
	STICK_FACTOR: { min: 1, max: 2, label: 'Stick-check safety factor' },
	TRUCK_LOAD: { min: 1, max: 40, label: 'Default truck load (tons)' },
	PAVER_RETAIN: { min: 0, max: 60, label: 'Paver retention (tons)' },
	SHUTTLE_RETAIN: { min: 0, max: 60, label: 'Shuttle buggy retention (tons)' }
};

export const OVERRIDABLE_DEFAULTS: Record<
	keyof OrgDefaultsOverride,
	{ min?: number; max?: number; type: 'number' | 'boolean' | 'string' }
> = {
	roadWidthFt: { min: 1, max: 60, type: 'number' },
	truckLoadTons: { min: 1, max: 40, type: 'number' },
	machine: { type: 'string' },
	firstPass: { type: 'boolean' },
	tackApplication: { type: 'string' },
	wastePct: { min: 0, max: 50, type: 'number' },
	courseType: { type: 'string' },
	liftThicknessIn: { min: 0.5, max: 10, type: 'number' },
	mixType: { type: 'string' }
};

export interface ValidationResult {
	ok: boolean;
	error?: string;
	cleaned?: OrgOverrides;
}

function validateRange(entry: RangeEntry): boolean {
	return (
		typeof entry === 'object' &&
		typeof entry.id === 'string' &&
		typeof entry.label === 'string' &&
		typeof entry.min === 'number' &&
		typeof entry.max === 'number' &&
		entry.min >= 0 &&
		entry.max >= entry.min &&
		entry.max <= 5
	);
}

/**
 * Validate and normalize an untrusted overrides object from a client.
 * Returns a cleaned object containing only recognized, in-range values.
 */
export function validateOverrides(input: unknown): ValidationResult {
	if (input == null || typeof input !== 'object') {
		return { ok: false, error: 'Overrides must be an object' };
	}
	const raw = input as Record<string, unknown>;
	const cleaned: OrgOverrides = {};

	if (raw.constants !== undefined) {
		if (typeof raw.constants !== 'object' || raw.constants === null) {
			return { ok: false, error: 'constants must be an object' };
		}
		const out: Record<string, number> = {};
		for (const [key, value] of Object.entries(raw.constants as Record<string, unknown>)) {
			const rule = OVERRIDABLE_CONSTANTS[key];
			if (!rule) return { ok: false, error: `Constant "${key}" is not overridable` };
			if (typeof value !== 'number' || Number.isNaN(value)) {
				return { ok: false, error: `Constant "${key}" must be a number` };
			}
			if (value < rule.min || value > rule.max) {
				return {
					ok: false,
					error: `${rule.label} must be between ${rule.min} and ${rule.max}`
				};
			}
			out[key] = value;
		}
		if (Object.keys(out).length > 0) cleaned.constants = out;
	}

	if (raw.defaults !== undefined) {
		if (typeof raw.defaults !== 'object' || raw.defaults === null) {
			return { ok: false, error: 'defaults must be an object' };
		}
		const out: OrgDefaultsOverride = {};
		for (const [key, value] of Object.entries(raw.defaults as Record<string, unknown>)) {
			const rule = OVERRIDABLE_DEFAULTS[key as keyof OrgDefaultsOverride];
			if (!rule) return { ok: false, error: `Default "${key}" is not overridable` };
			if (rule.type === 'number') {
				if (typeof value !== 'number' || Number.isNaN(value)) {
					return { ok: false, error: `Default "${key}" must be a number` };
				}
				if ((rule.min !== undefined && value < rule.min) || (rule.max !== undefined && value > rule.max)) {
					return { ok: false, error: `Default "${key}" is out of range` };
				}
				(out as Record<string, unknown>)[key] = value;
			} else if (rule.type === 'boolean') {
				if (typeof value !== 'boolean') {
					return { ok: false, error: `Default "${key}" must be a boolean` };
				}
				(out as Record<string, unknown>)[key] = value;
			} else {
				if (typeof value !== 'string') {
					return { ok: false, error: `Default "${key}" must be a string` };
				}
				(out as Record<string, unknown>)[key] = value;
			}
		}
		if (Object.keys(out).length > 0) cleaned.defaults = out;
	}

	if (raw.tack !== undefined) {
		if (typeof raw.tack !== 'object' || raw.tack === null) {
			return { ok: false, error: 'tack must be an object' };
		}
		const tackRaw = raw.tack as Record<string, unknown>;
		const out: OrgTackOverride = {};
		for (const group of ['field', 'spec'] as const) {
			if (tackRaw[group] === undefined) continue;
			if (!Array.isArray(tackRaw[group])) {
				return { ok: false, error: `tack.${group} must be an array` };
			}
			const entries = tackRaw[group] as RangeEntry[];
			for (const entry of entries) {
				if (!validateRange(entry)) {
					return { ok: false, error: `Invalid tack ${group} entry` };
				}
			}
			out[group] = entries;
		}
		if (out.field || out.spec) cleaned.tack = out;
	}

	if (raw.spreadTolerances !== undefined) {
		if (typeof raw.spreadTolerances !== 'object' || raw.spreadTolerances === null) {
			return { ok: false, error: 'spreadTolerances must be an object' };
		}
		const out: Record<string, number> = {};
		for (const [courseId, value] of Object.entries(raw.spreadTolerances as Record<string, unknown>)) {
			const yamlEntry = config.spreadTolerance.find((e) => e.id === courseId);
			if (!yamlEntry) {
				return { ok: false, error: `Course ID "${courseId}" is not valid` };
			}
			if (typeof value !== 'number' || Number.isNaN(value)) {
				return { ok: false, error: `Tolerance for "${courseId}" must be a number` };
			}
			if (value < 1 || value > 500) {
				return { ok: false, error: `Tolerance for "${courseId}" must be between 1 and 500 lbs/SY` };
			}
			out[courseId] = value;
		}
		if (Object.keys(out).length > 0) cleaned.spreadTolerances = out;
	}

	return { ok: true, cleaned };
}

/** Default value for an overridable constant, read from the static YAML config. */
export function constantDefault(key: string): number {
	const entry = config.constants[key];
	return entry ? entry.value : 0;
}

/**
 * A resolver that merges org overrides on top of the static config.
 * Pass `null`/`undefined` overrides to get the plain YAML values.
 */
export function makeResolver(overrides?: OrgOverrides | null) {
	const ov = overrides ?? {};

	return {
		constant(id: string): number {
			const key = id.startsWith('CONST.') ? id.slice('CONST.'.length) : id;
			if (ov.constants && key in ov.constants) return ov.constants[key];
			return constantDefault(key);
		},
		get defaults() {
			return { ...config.defaults, ...(ov.defaults ?? {}) };
		},
		get tackField(): RangeEntry[] {
			return ov.tack?.field ?? config.tack.field;
		},
		get tackSpec(): RangeEntry[] {
			return ov.tack?.spec ?? config.tack.spec;
		},
		spreadToleranceFor(courseId: string | null | undefined) {
			const yamlEntry =
				config.spreadTolerance.find((t) => t.id === courseId) ??
				config.spreadTolerance.find((t) => t.id === config.defaults.courseType) ??
				config.spreadTolerance[0];

			if (ov.spreadTolerances && courseId && courseId in ov.spreadTolerances) {
				return { ...yamlEntry, toleranceLbsSy: ov.spreadTolerances[courseId] };
			}
			return yamlEntry;
		}
	};
}

export type ConfigResolver = ReturnType<typeof makeResolver>;
