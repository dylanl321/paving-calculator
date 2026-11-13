import type { DbJobSiteConfig } from './db-jobsites';

type ConfigWrite = Partial<Omit<DbJobSiteConfig, 'job_site_id' | 'created_at' | 'updated_at'>>;

const ROAD_TYPES = new Set([
	'highway',
	'state_route',
	'county_road',
	'city_street',
	'subdivision',
	'parking_lot',
	'other'
]);

const SCOPES = new Set([
	'full_depth',
	'mill_and_fill',
	'overlay',
	'leveling',
	'patching',
	'widening'
]);

const TACK_TYPES = new Set(['anionic', 'cationic', 'polymer_modified', 'trackless']);

export type ConfigInputResult =
	| { ok: true; value: ConfigWrite }
	| { ok: false; error: string };

/**
 * Keep only known config columns and reject values that would fail the
 * table CHECKs or store nonsense quantities. Absent keys stay absent so a
 * partial write does not clear fields the caller did not send.
 */
export function sanitizeJobSiteConfigInput(body: unknown): ConfigInputResult {
	if (body == null || typeof body !== 'object' || Array.isArray(body)) {
		return { ok: false, error: 'Configuration body must be an object' };
	}
	const raw = body as Record<string, unknown>;
	const value: ConfigWrite = {};

	const applyEnum = (
		key: 'road_type' | 'scope_of_work' | 'tack_type',
		allowed: Set<string>
	): boolean => {
		const picked = optionalEnum(raw[key], allowed);
		if (picked === INVALID) return false;
		if (picked !== undefined) {
			(value as Record<string, unknown>)[key] = picked;
		}
		return true;
	};

	if (!applyEnum('road_type', ROAD_TYPES)) {
		return { ok: false, error: 'Invalid road_type' };
	}
	if (!applyEnum('scope_of_work', SCOPES)) {
		return { ok: false, error: 'Invalid scope_of_work' };
	}
	if (!applyEnum('tack_type', TACK_TYPES)) {
		return { ok: false, error: 'Invalid tack_type' };
	}

	const numbers: Array<[keyof ConfigWrite, { min: number; max: number; integer?: boolean }]> = [
		['num_lanes', { min: 1, max: 20, integer: true }],
		['lane_width_ft', { min: 1, max: 100 }],
		['total_length_ft', { min: 0, max: 5_000_000 }],
		['target_thickness_in', { min: 0, max: 24 }],
		['target_spread_rate', { min: 0, max: 2000 }],
		['target_tack_rate', { min: 0, max: 1 }],
		['num_lifts', { min: 1, max: 20, integer: true }],
		['total_tonnage', { min: 0, max: 10_000_000 }],
		['cost_per_ton', { min: 0, max: 100_000 }],
		['cost_per_sy', { min: 0, max: 100_000 }],
		['cost_per_mile', { min: 0, max: 100_000_000 }],
		['total_contract_value', { min: 0, max: 10_000_000_000 }],
		['begin_station', { min: -1_000_000, max: 10_000_000 }],
		['end_station', { min: -1_000_000, max: 10_000_000 }]
	];

	for (const [key, rule] of numbers) {
		if (!(key in raw)) continue;
		const parsed = optionalNumber(raw[key], key, rule);
		if (parsed.ok === false) return parsed;
		(value as Record<string, unknown>)[key] = parsed.value;
	}

	const strings: Array<[keyof ConfigWrite, number]> = [
		['mix_type', 120],
		['notes', 4000],
		['route_designation', 120],
		['route_county', 120],
		['route_district', 40],
		['route_functional_class', 80],
		['route_system_code', 40],
		['begin_terminus', 300],
		['end_terminus', 300]
	];

	for (const [key, max] of strings) {
		if (!(key in raw)) continue;
		const parsed = optionalText(raw[key], key, max);
		if (parsed.ok === false) return parsed;
		(value as Record<string, unknown>)[key] = parsed.value;
	}

	return { ok: true, value };
}

const INVALID = Symbol('invalid');

function optionalEnum(
	value: unknown,
	allowed: Set<string>
): string | null | undefined | typeof INVALID {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	if (typeof value !== 'string' || !allowed.has(value)) return INVALID;
	return value;
}

function optionalNumber(
	value: unknown,
	key: string,
	rule: { min: number; max: number; integer?: boolean }
): { ok: true; value: number | null } | { ok: false; error: string } {
	if (value === null || value === '') return { ok: true, value: null };
	const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	if (!Number.isFinite(n) || n < rule.min || n > rule.max) {
		return { ok: false, error: `${key} must be a number from ${rule.min} to ${rule.max}` };
	}
	if (rule.integer && !Number.isInteger(n)) {
		return { ok: false, error: `${key} must be a whole number` };
	}
	return { ok: true, value: n };
}

function optionalText(
	value: unknown,
	key: string,
	max: number
): { ok: true; value: string | null } | { ok: false; error: string } {
	if (value === null || value === '') return { ok: true, value: null };
	if (typeof value !== 'string') return { ok: false, error: `${key} must be text` };
	const trimmed = value.trim();
	if (trimmed.length > max) return { ok: false, error: `${key} must be ${max} characters or less` };
	return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}
