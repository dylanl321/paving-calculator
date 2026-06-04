import { describe, it, expect } from 'vitest';
import {
	validateOverrides,
	makeResolver,
	constantDefault,
	OVERRIDABLE_CONSTANTS,
	OVERRIDABLE_DEFAULTS,
	type OrgOverrides
} from '../overrides';
import { config } from '../index';

// ---------------------------------------------------------------------------
// OVERRIDABLE_CONSTANTS whitelist
// ---------------------------------------------------------------------------
describe('OVERRIDABLE_CONSTANTS', () => {
	it('contains the expected keys', () => {
		const keys = Object.keys(OVERRIDABLE_CONSTANTS);
		expect(keys).toContain('THICK_MULT');
		expect(keys).toContain('STICK_FACTOR');
		expect(keys).toContain('TRUCK_LOAD');
		expect(keys).toContain('PAVER_RETAIN');
		expect(keys).toContain('SHUTTLE_RETAIN');
	});

	it('every rule has numeric min/max and a label', () => {
		for (const [key, rule] of Object.entries(OVERRIDABLE_CONSTANTS)) {
			expect(typeof rule.min, `${key}.min`).toBe('number');
			expect(typeof rule.max, `${key}.max`).toBe('number');
			expect(rule.max, `${key} max >= min`).toBeGreaterThanOrEqual(rule.min);
			expect(typeof rule.label, `${key}.label`).toBe('string');
		}
	});
});

// ---------------------------------------------------------------------------
// OVERRIDABLE_DEFAULTS whitelist
// ---------------------------------------------------------------------------
describe('OVERRIDABLE_DEFAULTS', () => {
	it('covers all OrgDefaultsOverride keys', () => {
		const keys = Object.keys(OVERRIDABLE_DEFAULTS);
		expect(keys).toContain('roadWidthFt');
		expect(keys).toContain('truckLoadTons');
		expect(keys).toContain('machine');
		expect(keys).toContain('firstPass');
		expect(keys).toContain('tackApplication');
		expect(keys).toContain('wastePct');
		expect(keys).toContain('courseType');
		expect(keys).toContain('liftThicknessIn');
		expect(keys).toContain('mixType');
		expect(keys).toContain('defaultPlant');
		expect(keys).toContain('defaultCrewSize');
		expect(keys).toContain('pavingWindowStart');
		expect(keys).toContain('pavingWindowEnd');
		expect(keys).toContain('minPavingTempF');
		expect(keys).toContain('maxPavingTempF');
		expect(keys).toContain('minMatTempF');
		expect(keys).toContain('defaultCompactionPasses');
	});
});

// ---------------------------------------------------------------------------
// constantDefault — reads from static YAML
// ---------------------------------------------------------------------------
describe('constantDefault', () => {
	it('returns the YAML value for THICK_MULT (110)', () => {
		expect(constantDefault('THICK_MULT')).toBe(110);
	});

	it('returns the YAML value for TRUCK_LOAD (18.5)', () => {
		expect(constantDefault('TRUCK_LOAD')).toBe(18.5);
	});

	it('returns 0 for an unknown key', () => {
		expect(constantDefault('DOES_NOT_EXIST')).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// validateOverrides — input shape validation
// ---------------------------------------------------------------------------
describe('validateOverrides — non-object inputs', () => {
	it('rejects null', () => {
		const r = validateOverrides(null);
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/object/i);
	});

	it('rejects a string', () => {
		const r = validateOverrides('not an object');
		expect(r.ok).toBe(false);
	});

	it('accepts an empty object and returns ok with empty cleaned', () => {
		const r = validateOverrides({});
		expect(r.ok).toBe(true);
		expect(r.cleaned).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// validateOverrides — constants section
// ---------------------------------------------------------------------------
describe('validateOverrides — constants', () => {
	it('accepts a valid constant override', () => {
		const r = validateOverrides({ constants: { THICK_MULT: 100 } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.constants?.THICK_MULT).toBe(100);
	});

	it('accepts boundary min value', () => {
		const rule = OVERRIDABLE_CONSTANTS.THICK_MULT;
		const r = validateOverrides({ constants: { THICK_MULT: rule.min } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.constants?.THICK_MULT).toBe(rule.min);
	});

	it('accepts boundary max value', () => {
		const rule = OVERRIDABLE_CONSTANTS.THICK_MULT;
		const r = validateOverrides({ constants: { THICK_MULT: rule.max } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.constants?.THICK_MULT).toBe(rule.max);
	});

	it('rejects an unknown constant key', () => {
		const r = validateOverrides({ constants: { MAGIC_NUMBER: 42 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/MAGIC_NUMBER/);
	});

	it('rejects a value below min', () => {
		const rule = OVERRIDABLE_CONSTANTS.THICK_MULT;
		const r = validateOverrides({ constants: { THICK_MULT: rule.min - 1 } });
		expect(r.ok).toBe(false);
	});

	it('rejects a value above max', () => {
		const rule = OVERRIDABLE_CONSTANTS.THICK_MULT;
		const r = validateOverrides({ constants: { THICK_MULT: rule.max + 1 } });
		expect(r.ok).toBe(false);
	});

	it('rejects a string value for a constant', () => {
		const r = validateOverrides({ constants: { THICK_MULT: '110' } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/number/i);
	});

	it('rejects NaN for a constant', () => {
		const r = validateOverrides({ constants: { THICK_MULT: NaN } });
		expect(r.ok).toBe(false);
	});

	it('rejects constants not being an object', () => {
		const r = validateOverrides({ constants: 'bad' });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/object/i);
	});

	it('does not include constants key in cleaned when object is empty', () => {
		const r = validateOverrides({ constants: {} });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.constants).toBeUndefined();
	});

	it('accepts multiple valid constants at once', () => {
		const r = validateOverrides({
			constants: { THICK_MULT: 100, TRUCK_LOAD: 20, STICK_FACTOR: 1.5 }
		});
		expect(r.ok).toBe(true);
		expect(r.cleaned?.constants).toEqual({ THICK_MULT: 100, TRUCK_LOAD: 20, STICK_FACTOR: 1.5 });
	});
});

// ---------------------------------------------------------------------------
// validateOverrides — defaults section
// ---------------------------------------------------------------------------
describe('validateOverrides — defaults', () => {
	it('accepts a valid number default', () => {
		const r = validateOverrides({ defaults: { roadWidthFt: 14 } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.roadWidthFt).toBe(14);
	});

	it('accepts a valid boolean default (firstPass)', () => {
		const r = validateOverrides({ defaults: { firstPass: true } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.firstPass).toBe(true);
	});

	it('accepts a valid string default (machine)', () => {
		const r = validateOverrides({ defaults: { machine: 'shuttle' } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.machine).toBe('shuttle');
	});

	it('rejects an unknown default key', () => {
		const r = validateOverrides({ defaults: { unknownField: 5 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/unknownField/);
	});

	it('rejects roadWidthFt below min (1)', () => {
		const r = validateOverrides({ defaults: { roadWidthFt: 0 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/out of range/i);
	});

	it('rejects roadWidthFt above max (60)', () => {
		const r = validateOverrides({ defaults: { roadWidthFt: 61 } });
		expect(r.ok).toBe(false);
	});

	it('rejects a string for a numeric default', () => {
		const r = validateOverrides({ defaults: { roadWidthFt: 'twelve' } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/number/i);
	});

	it('rejects a number for a boolean default', () => {
		const r = validateOverrides({ defaults: { firstPass: 1 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/boolean/i);
	});

	it('rejects a number for a string default', () => {
		const r = validateOverrides({ defaults: { machine: 42 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/string/i);
	});

	it('rejects defaults not being an object', () => {
		const r = validateOverrides({ defaults: 'bad' });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/object/i);
	});

	it('does not include defaults key in cleaned when object is empty', () => {
		const r = validateOverrides({ defaults: {} });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults).toBeUndefined();
	});

	it('accepts wastePct boundary values 0 and 50', () => {
		expect(validateOverrides({ defaults: { wastePct: 0 } }).ok).toBe(true);
		expect(validateOverrides({ defaults: { wastePct: 50 } }).ok).toBe(true);
	});

	it('rejects wastePct above 50', () => {
		expect(validateOverrides({ defaults: { wastePct: 51 } }).ok).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// validateOverrides — new operations defaults
// ---------------------------------------------------------------------------
describe('validateOverrides — new operations defaults', () => {
	it('accepts defaultPlant as a valid string', () => {
		const r = validateOverrides({ defaults: { defaultPlant: 'Atlanta Paving Supply' } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.defaultPlant).toBe('Atlanta Paving Supply');
	});

	it('accepts defaultCrewSize=10 (in range 1-50)', () => {
		const r = validateOverrides({ defaults: { defaultCrewSize: 10 } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.defaultCrewSize).toBe(10);
	});

	it('rejects defaultCrewSize=51 (above max)', () => {
		const r = validateOverrides({ defaults: { defaultCrewSize: 51 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/out of range/i);
	});

	it('rejects defaultCrewSize=0 (below min)', () => {
		const r = validateOverrides({ defaults: { defaultCrewSize: 0 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/out of range/i);
	});

	it('accepts pavingWindowStart as a string "07:00"', () => {
		const r = validateOverrides({ defaults: { pavingWindowStart: '07:00' } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.pavingWindowStart).toBe('07:00');
	});

	it('accepts pavingWindowEnd as a string "19:00"', () => {
		const r = validateOverrides({ defaults: { pavingWindowEnd: '19:00' } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.pavingWindowEnd).toBe('19:00');
	});

	it('accepts minPavingTempF=35 (in range 20-80)', () => {
		const r = validateOverrides({ defaults: { minPavingTempF: 35 } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.minPavingTempF).toBe(35);
	});

	it('rejects minPavingTempF=81 (above max)', () => {
		const r = validateOverrides({ defaults: { minPavingTempF: 81 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/out of range/i);
	});

	it('rejects minPavingTempF=19 (below min)', () => {
		const r = validateOverrides({ defaults: { minPavingTempF: 19 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/out of range/i);
	});

	it('accepts maxPavingTempF=120 (in range 80-150)', () => {
		const r = validateOverrides({ defaults: { maxPavingTempF: 120 } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.maxPavingTempF).toBe(120);
	});

	it('rejects maxPavingTempF=151', () => {
		const r = validateOverrides({ defaults: { maxPavingTempF: 151 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/out of range/i);
	});

	it('accepts minMatTempF=280 (in range 200-350)', () => {
		const r = validateOverrides({ defaults: { minMatTempF: 280 } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.minMatTempF).toBe(280);
	});

	it('rejects minMatTempF=351', () => {
		const r = validateOverrides({ defaults: { minMatTempF: 351 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/out of range/i);
	});

	it('accepts defaultCompactionPasses=5 (in range 1-20)', () => {
		const r = validateOverrides({ defaults: { defaultCompactionPasses: 5 } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.defaults?.defaultCompactionPasses).toBe(5);
	});

	it('rejects defaultCompactionPasses=0', () => {
		const r = validateOverrides({ defaults: { defaultCompactionPasses: 0 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/out of range/i);
	});

	it('rejects defaultCompactionPasses=21', () => {
		const r = validateOverrides({ defaults: { defaultCompactionPasses: 21 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/out of range/i);
	});
});

// ---------------------------------------------------------------------------
// validateOverrides — tack section
// ---------------------------------------------------------------------------
describe('validateOverrides — tack', () => {
	const validEntry = {
		id: 'TACK.TEST',
		label: 'Test tack',
		min: 0.04,
		max: 0.06,
		unit: 'gal/SY',
		status: 'VERIFIED' as const
	};

	it('accepts valid tack.field entries', () => {
		const r = validateOverrides({ tack: { field: [validEntry] } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.tack?.field).toHaveLength(1);
	});

	it('accepts valid tack.spec entries', () => {
		const r = validateOverrides({ tack: { spec: [validEntry] } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.tack?.spec).toHaveLength(1);
	});

	it('rejects tack not being an object', () => {
		const r = validateOverrides({ tack: 'bad' });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/object/i);
	});

	it('rejects tack.field not being an array', () => {
		const r = validateOverrides({ tack: { field: 'not an array' } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/array/i);
	});

	it('rejects an entry with missing id', () => {
		const bad = { label: 'x', min: 0.04, max: 0.06, unit: 'gal/SY' };
		const r = validateOverrides({ tack: { field: [bad] } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/tack field/i);
	});

	it('rejects an entry with max > 5 (validateRange cap)', () => {
		const bad = { ...validEntry, max: 6 };
		const r = validateOverrides({ tack: { field: [bad] } });
		expect(r.ok).toBe(false);
	});

	it('rejects an entry with min < 0', () => {
		const bad = { ...validEntry, min: -0.1, max: 0.06 };
		const r = validateOverrides({ tack: { field: [bad] } });
		expect(r.ok).toBe(false);
	});

	it('does not include tack key in cleaned when no valid groups', () => {
		// tack with neither field nor spec provided
		const r = validateOverrides({ tack: {} });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.tack).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// validateOverrides — spreadTolerances section
// ---------------------------------------------------------------------------
describe('validateOverrides — spreadTolerances', () => {
	// Grab a valid course ID from the static config
	const validCourseId = config.spreadTolerance[0].id;

	it('accepts a valid spreadTolerance override', () => {
		const r = validateOverrides({ spreadTolerances: { [validCourseId]: 30 } });
		expect(r.ok).toBe(true);
		expect(r.cleaned?.spreadTolerances?.[validCourseId]).toBe(30);
	});

	it('accepts boundary min value (1)', () => {
		const r = validateOverrides({ spreadTolerances: { [validCourseId]: 1 } });
		expect(r.ok).toBe(true);
	});

	it('accepts boundary max value (500)', () => {
		const r = validateOverrides({ spreadTolerances: { [validCourseId]: 500 } });
		expect(r.ok).toBe(true);
	});

	it('rejects an unknown course ID', () => {
		const r = validateOverrides({ spreadTolerances: { FAKE_COURSE: 30 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/FAKE_COURSE/);
	});

	it('rejects a tolerance of 0 (below min 1)', () => {
		const r = validateOverrides({ spreadTolerances: { [validCourseId]: 0 } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/between 1 and 500/i);
	});

	it('rejects a tolerance above 500', () => {
		const r = validateOverrides({ spreadTolerances: { [validCourseId]: 501 } });
		expect(r.ok).toBe(false);
	});

	it('rejects a non-numeric tolerance', () => {
		const r = validateOverrides({ spreadTolerances: { [validCourseId]: 'lots' } });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/number/i);
	});

	it('rejects spreadTolerances not being an object', () => {
		const r = validateOverrides({ spreadTolerances: 99 });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/object/i);
	});
});

// ---------------------------------------------------------------------------
// makeResolver — no overrides (falls through to YAML values)
// ---------------------------------------------------------------------------
describe('makeResolver — no overrides / null', () => {
	it('returns YAML constant for THICK_MULT when no overrides', () => {
		const r = makeResolver();
		expect(r.constant('THICK_MULT')).toBe(110);
	});

	it('supports CONST. prefix for constant lookup', () => {
		const r = makeResolver();
		expect(r.constant('CONST.THICK_MULT')).toBe(110);
	});

	it('returns same value for CONST. prefix and bare key', () => {
		const r = makeResolver();
		expect(r.constant('CONST.STICK_FACTOR')).toBe(r.constant('STICK_FACTOR'));
	});

	it('returns YAML defaults when null is passed', () => {
		const r = makeResolver(null);
		expect(r.defaults.roadWidthFt).toBe(config.defaults.roadWidthFt);
	});

	it('returns YAML tackField when no overrides', () => {
		const r = makeResolver();
		expect(r.tackField).toBe(config.tack.field);
	});

	it('returns YAML tackSpec when no overrides', () => {
		const r = makeResolver();
		expect(r.tackSpec).toBe(config.tack.spec);
	});

	it('returns YAML spread tolerance entry when no overrides', () => {
		const courseId = config.spreadTolerance[0].id;
		const r = makeResolver();
		const entry = r.spreadToleranceFor(courseId);
		expect(entry).toBeDefined();
		expect(entry?.id).toBe(courseId);
		expect(entry?.toleranceLbsSy).toBe(config.spreadTolerance[0].toleranceLbsSy);
	});

	it('falls back to default courseType entry for unknown course ID', () => {
		const r = makeResolver();
		const entry = r.spreadToleranceFor('UNKNOWN_COURSE');
		// falls back to config.defaults.courseType entry or first entry
		expect(entry).toBeDefined();
	});

	it('falls back gracefully for null courseId', () => {
		const r = makeResolver();
		const entry = r.spreadToleranceFor(null);
		expect(entry).toBeDefined();
	});

	it('falls back gracefully for undefined courseId', () => {
		const r = makeResolver();
		const entry = r.spreadToleranceFor(undefined);
		expect(entry).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// makeResolver — with overrides (priority chain)
// ---------------------------------------------------------------------------
describe('makeResolver — with overrides (priority chain)', () => {
	const ov: OrgOverrides = {
		constants: { THICK_MULT: 120 },
		defaults: { roadWidthFt: 16, machine: 'shuttle' },
		tack: {
			field: [
				{
					id: 'TACK.CUSTOM',
					label: 'Custom Field',
					min: 0.05,
					max: 0.07,
					unit: 'gal/SY',
					status: 'VERIFIED'
				}
			]
		},
		spreadTolerances: { [config.spreadTolerance[0].id]: 99 }
	};
	const r = makeResolver(ov);

	it('override constant wins over YAML (THICK_MULT = 120 not 110)', () => {
		expect(r.constant('THICK_MULT')).toBe(120);
	});

	it('CONST. prefix also resolves override constant', () => {
		expect(r.constant('CONST.THICK_MULT')).toBe(120);
	});

	it('non-overridden constant falls through to YAML', () => {
		// PAVER_RETAIN not in ov.constants
		expect(r.constant('PAVER_RETAIN')).toBe(constantDefault('PAVER_RETAIN'));
	});

	it('override default wins over YAML (roadWidthFt = 16)', () => {
		expect(r.defaults.roadWidthFt).toBe(16);
	});

	it('non-overridden default falls through to YAML (truckLoadTons)', () => {
		expect(r.defaults.truckLoadTons).toBe(config.defaults.truckLoadTons);
	});

	it('override default string wins (machine = shuttle)', () => {
		expect(r.defaults.machine).toBe('shuttle');
	});

	it('tack field override replaces YAML tack.field', () => {
		expect(r.tackField).toHaveLength(1);
		expect(r.tackField[0].id).toBe('TACK.CUSTOM');
	});

	it('non-overridden tack.spec falls through to YAML', () => {
		expect(r.tackSpec).toBe(config.tack.spec);
	});

	it('spread tolerance override wins for overridden course', () => {
		const courseId = config.spreadTolerance[0].id;
		const entry = r.spreadToleranceFor(courseId);
		expect(entry?.toleranceLbsSy).toBe(99);
	});

	it('non-overridden spread tolerance falls through to YAML', () => {
		// Use second course (if available) which is not overridden
		if (config.spreadTolerance.length > 1) {
			const courseId2 = config.spreadTolerance[1].id;
			const entry = r.spreadToleranceFor(courseId2);
			expect(entry?.toleranceLbsSy).toBe(config.spreadTolerance[1].toleranceLbsSy);
		}
	});
});

// ---------------------------------------------------------------------------
// makeResolver — partial overrides (unset values fall through)
// ---------------------------------------------------------------------------
describe('makeResolver — unset values fall through', () => {
	it('empty overrides object: all constants fall through', () => {
		const r = makeResolver({});
		expect(r.constant('THICK_MULT')).toBe(constantDefault('THICK_MULT'));
		expect(r.constant('STICK_FACTOR')).toBe(constantDefault('STICK_FACTOR'));
	});

	it('overrides with only constants: defaults still come from YAML', () => {
		const r = makeResolver({ constants: { THICK_MULT: 95 } });
		expect(r.defaults.roadWidthFt).toBe(config.defaults.roadWidthFt);
		expect(r.defaults.truckLoadTons).toBe(config.defaults.truckLoadTons);
	});

	it('overrides with only defaults: constants still come from YAML', () => {
		const r = makeResolver({ defaults: { roadWidthFt: 20 } });
		expect(r.constant('THICK_MULT')).toBe(constantDefault('THICK_MULT'));
	});

	it('overrides with only tack.spec: tack.field still comes from YAML', () => {
		const specEntry = {
			id: 'TACK.SPEC_CUSTOM',
			label: 'Custom Spec',
			min: 0.05,
			max: 0.1,
			unit: 'gal/SY',
			status: 'VERIFIED' as const
		};
		const r = makeResolver({ tack: { spec: [specEntry] } });
		expect(r.tackField).toBe(config.tack.field);
		expect(r.tackSpec).toHaveLength(1);
	});

	it('overrides with only spreadTolerances: other resolvers unaffected', () => {
		const courseId = config.spreadTolerance[0].id;
		const r = makeResolver({ spreadTolerances: { [courseId]: 44 } });
		expect(r.constant('THICK_MULT')).toBe(constantDefault('THICK_MULT'));
		expect(r.defaults.roadWidthFt).toBe(config.defaults.roadWidthFt);
	});
});

// ---------------------------------------------------------------------------
// Type coercion: validateOverrides does NOT coerce types
// ---------------------------------------------------------------------------
describe('type coercion — validateOverrides enforces strict types', () => {
	it('does not coerce string "12" to number for roadWidthFt', () => {
		const r = validateOverrides({ defaults: { roadWidthFt: '12' } });
		expect(r.ok).toBe(false);
	});

	it('does not coerce string "true" to boolean for firstPass', () => {
		const r = validateOverrides({ defaults: { firstPass: 'true' } });
		expect(r.ok).toBe(false);
	});

	it('does not coerce 0 / 1 to boolean for firstPass', () => {
		expect(validateOverrides({ defaults: { firstPass: 0 } }).ok).toBe(false);
		expect(validateOverrides({ defaults: { firstPass: 1 } }).ok).toBe(false);
	});

	it('does not coerce string constant value to number', () => {
		expect(validateOverrides({ constants: { THICK_MULT: '110' } }).ok).toBe(false);
	});

	it('cleaned object for valid input has correct runtime types', () => {
		const r = validateOverrides({
			constants: { THICK_MULT: 100 },
			defaults: { roadWidthFt: 14, firstPass: true, machine: 'paver' }
		});
		expect(r.ok).toBe(true);
		expect(typeof r.cleaned?.constants?.THICK_MULT).toBe('number');
		expect(typeof r.cleaned?.defaults?.roadWidthFt).toBe('number');
		expect(typeof r.cleaned?.defaults?.firstPass).toBe('boolean');
		expect(typeof r.cleaned?.defaults?.machine).toBe('string');
	});
});

// ---------------------------------------------------------------------------
// validateOverrides — combined valid payload round-trip
// ---------------------------------------------------------------------------
describe('validateOverrides — combined valid payload', () => {
	it('accepts a full valid override and preserves all sections', () => {
		const courseId = config.spreadTolerance[0].id;
		const input = {
			constants: { THICK_MULT: 105, TRUCK_LOAD: 20 },
			defaults: { roadWidthFt: 14, firstPass: false, machine: 'paver' },
			tack: {
				field: [
					{ id: 'TACK.F', label: 'F', min: 0.04, max: 0.06, unit: 'gal/SY', status: 'VERIFIED' }
				]
			},
			spreadTolerances: { [courseId]: 50 }
		};
		const r = validateOverrides(input);
		expect(r.ok).toBe(true);
		expect(r.cleaned?.constants?.THICK_MULT).toBe(105);
		expect(r.cleaned?.defaults?.roadWidthFt).toBe(14);
		expect(r.cleaned?.tack?.field).toHaveLength(1);
		expect(r.cleaned?.spreadTolerances?.[courseId]).toBe(50);
	});
});
