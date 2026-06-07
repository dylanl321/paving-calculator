/**
 * Regression tests for the LLM-primary PDF pipeline's PURE stages:
 *  - validate-contract.ts  (deterministic validation + regex-vs-LLM cross-check)
 *  - gdot-geometry.ts       (per-segment mapping output SHAPE — ImportSegment contract)
 *
 * The Workers AI binding is unavailable under vite dev / vitest, so these tests
 * NEVER call the live LLM. They feed hand-built StructuredContract fixtures
 * derived from two real contract documents:
 *  - 25169 (City of Butler LMIG): 7 disconnected local_street segments, grouped
 *    LMIG ×5 / LRA ×2, treatments restripe_only vs overlay, measure_axis 'none'.
 *  - 25186 (GDOT SR 7 ALT, PI M006412, Lowndes): ONE route, TWO roadway-log
 *    sections with a milepost RESET — an NB/SB mainline (MP 0.000–2.860) + a
 *    ramp whose milepost resets to 0.000–0.060. Both measure_axis 'project_mile'.
 *
 * The mapping-shape tests use segments with absent termini so the termini
 * road-snap short-circuits WITHOUT any network call — fully offline/deterministic.
 */

import { describe, it, expect } from 'vitest';
import { field, type ParsedField, type FieldConfidence } from '../confidence.js';
import { validateContract, crossCheckWithRegex } from '../validate-contract.js';
import { mapStructuredContractSegments } from '../../gdot-geometry.js';
import type {
	StructuredContract,
	ContractSegment,
	SegmentEvent,
	SegmentKind,
	SegmentTreatment,
	SegmentEventType,
	MeasureAxis
} from '../structured-contract.js';
import { parseGdotDocumentsV2, type ParsedGdotJobV2 } from '../parse-gdot.js';

// --------------------------------------------------------------------------
// Fixture builders
// --------------------------------------------------------------------------

function event(
	type: SegmentEventType,
	measure: number | null,
	text: string,
	widthFt: number | null = null
): SegmentEvent {
	return {
		type: field.medium(type, 'fixture'),
		measure: measure == null ? field.missing<number>('fixture') : field.medium(measure, 'fixture'),
		text: field.medium(text, 'fixture'),
		width_ft: widthFt == null ? field.missing<number>('fixture') : field.medium(widthFt, 'fixture'),
		side_roads: []
	};
}

function segment(opts: {
	name: string;
	kind: SegmentKind;
	group: string | null;
	treatment: SegmentTreatment;
	axis: MeasureAxis;
	lengthMi: number | null;
	begin?: string | null;
	end?: string | null;
	events?: SegmentEvent[];
}): ContractSegment {
	return {
		name: field.medium(opts.name, 'fixture'),
		kind: field.medium(opts.kind, 'fixture'),
		group: opts.group == null ? field.missing<string>('fixture') : field.medium(opts.group, 'fixture'),
		treatment: field.medium(opts.treatment, 'fixture'),
		length_mi:
			opts.lengthMi == null ? field.missing<number>('fixture') : field.medium(opts.lengthMi, 'fixture'),
		begin_terminus:
			opts.begin == null ? field.missing<string>('fixture') : field.medium(opts.begin, 'fixture'),
		end_terminus:
			opts.end == null ? field.missing<string>('fixture') : field.medium(opts.end, 'fixture'),
		measure_axis: field.medium(opts.axis, 'fixture'),
		events: opts.events ?? [],
		pavement: []
	};
}

function emptyContract(partial: Partial<StructuredContract> = {}): StructuredContract {
	return {
		route: null,
		county: { name: field.medium('Butler', 'fixture'), fips: field.missing<string>('fixture') },
		midpoint: null,
		gross_length_mi: field.missing<number>('fixture'),
		segments: [],
		bid_items: [],
		production_mixes: [],
		warnings: [],
		...partial
	};
}

/**
 * 25169 — City of Butler LMIG: 7 physically disconnected local streets.
 * 5 LMIG (overlay: Marshall/Kings/Sandy Run-style) + 2 LRA, with the Bell /
 * E. Venus / Gloria-style restripe-only streets among them. measure_axis 'none'.
 */
function butlerContract(): StructuredContract {
	const local = (
		name: string,
		group: string,
		treatment: SegmentTreatment
	): ContractSegment =>
		segment({
			name,
			kind: 'local_street',
			group,
			treatment,
			axis: 'none',
			lengthMi: 0.3,
			begin: 'street start',
			end: 'street end'
		});

	return emptyContract({
		segments: [
			local('Marshall Street', 'LMIG', 'overlay'),
			local('Marshall Street South', 'LMIG', 'overlay'),
			local('Kings Street', 'LMIG', 'overlay'),
			local('Sandy Run Road', 'LMIG', 'overlay'),
			local('Edgewood Drive', 'LMIG', 'overlay'),
			local('Bell Street', 'LRA', 'restripe_only'),
			local('Gloria Street', 'LRA', 'restripe_only')
		]
	});
}

/**
 * 25186 — GDOT SR 7 ALT (PI M006412, Lowndes): one route, TWO roadway-log
 * sections separated by a milepost RESET. Segment 1 = NB/SB UNDIVIDED COMMON
 * SECTION mainline MP 0.000–2.860; Segment 2 = a ramp whose milepost RESETS to
 * 0.000–0.060. Both 'project_mile'. Has the (lying) WEST ZONE midpoint pin.
 */
function sr7AltContract(): StructuredContract {
	const mainline = segment({
		name: 'NB/SB UNDIVIDED COMMON SECTION',
		kind: 'mainline',
		group: 'GDOT',
		treatment: 'resurfacing',
		axis: 'project_mile',
		lengthMi: 2.86,
		begin: 'BEGIN PROJECT',
		end: 'END PROJECT',
		events: [
			event('project_start', 0.0, 'BEGIN PROJECT'),
			event('width_change', 1.2, 'WIDTH CHANGE 48->60', 60),
			event('project_end', 2.86, 'END PROJECT')
		]
	});
	const ramp = segment({
		name: 'SOUTHBOUND RAMP FROM SR 7',
		kind: 'ramp',
		group: 'GDOT',
		treatment: 'resurfacing',
		axis: 'project_mile',
		lengthMi: 0.06,
		begin: 'BEGIN RAMP',
		end: 'END RAMP',
		events: [
			// milepost RESET — restarts at 0.000 on its own axis.
			event('project_start', 0.0, 'BEGIN RAMP'),
			event('project_end', 0.06, 'END RAMP')
		]
	});

	return emptyContract({
		route: {
			designation: field.medium('SR 7 ALT', 'fixture'),
			kind: field.medium('SR', 'fixture'),
			number: field.medium('7', 'fixture')
		},
		county: { name: field.medium('Lowndes', 'fixture'), fips: field.medium('185', 'fixture') },
		midpoint: {
			easting: field.medium(2572138.063, 'fixture'),
			northing: field.medium(311698.517, 'fixture'),
			zone_label: field.medium('WEST ZONE', 'fixture')
		},
		gross_length_mi: field.medium(2.86, 'fixture'),
		segments: [mainline, ramp]
	});
}

// --------------------------------------------------------------------------
// 25169 — Butler local_street structure
// --------------------------------------------------------------------------

describe('Butler (25169) local_street fixture', () => {
	it('produces 7 disconnected local_street segments', () => {
		const c = butlerContract();
		expect(c.segments).toHaveLength(7);
		expect(c.segments.every((s) => s.kind.value === 'local_street')).toBe(true);
		expect(c.segments.every((s) => s.measure_axis.value === 'none')).toBe(true);
	});

	it('groups segments LMIG ×5 / LRA ×2', () => {
		const c = butlerContract();
		const groups = c.segments.map((s) => s.group.value);
		expect(groups.filter((g) => g === 'LMIG')).toHaveLength(5);
		expect(groups.filter((g) => g === 'LRA')).toHaveLength(2);
	});

	it('carries the correct treatment per group (LRA restripe_only, LMIG overlay)', () => {
		const c = butlerContract();
		for (const s of c.segments) {
			if (s.group.value === 'LRA') expect(s.treatment.value).toBe('restripe_only');
			if (s.group.value === 'LMIG') expect(s.treatment.value).toBe('overlay');
		}
	});

	it('validates cleanly (no warnings) for a well-formed local_street contract', () => {
		const validated = validateContract(butlerContract());
		expect(validated.warnings).toHaveLength(0);
	});
});

// --------------------------------------------------------------------------
// 25186 — SR 7 ALT mainline + ramp with milepost reset
// --------------------------------------------------------------------------

describe('SR 7 ALT (25186) mainline + ramp fixture', () => {
	it('produces 2 segments with independent project_mile axes', () => {
		const c = sr7AltContract();
		expect(c.segments).toHaveLength(2);
		expect(c.segments.every((s) => s.measure_axis.value === 'project_mile')).toBe(true);
		expect(c.segments[0].kind.value).toBe('mainline');
		expect(c.segments[1].kind.value).toBe('ramp');
	});

	it('keeps the ramp on its own reset axis (each axis starts at 0.000)', () => {
		const c = sr7AltContract();
		const firstMeasure = (s: ContractSegment) =>
			s.events.find((e) => e.type.value === 'project_start')?.measure.value;
		// Both the mainline and the ramp begin their own axis at station 0.
		expect(firstMeasure(c.segments[0])).toBe(0);
		expect(firstMeasure(c.segments[1])).toBe(0);
		// The ramp's end measure (0.06) is far below the mainline's (2.86):
		// a true reset, not a continuation of one merged axis.
		const lastMeasure = (s: ContractSegment) =>
			s.events.find((e) => e.type.value === 'project_end')?.measure.value;
		expect(lastMeasure(c.segments[0])).toBe(2.86);
		expect(lastMeasure(c.segments[1])).toBe(0.06);
	});

	it('carries width_ft on the mainline width_change event', () => {
		const c = sr7AltContract();
		const wc = c.segments[0].events.find((e) => e.type.value === 'width_change');
		expect(wc?.width_ft.value).toBe(60);
	});

	it('validates cleanly for the well-formed two-section contract', () => {
		const validated = validateContract(sr7AltContract());
		expect(validated.warnings).toHaveLength(0);
	});
});

// --------------------------------------------------------------------------
// Deterministic validation — flags (never drops)
// --------------------------------------------------------------------------

describe('validateContract flags but never drops', () => {
	it('flags a decreasing measure on a project_mile segment without removing the event', () => {
		const bad = sr7AltContract();
		// Inject an out-of-order (decreasing) measure (1.0 after 1.2) into the mainline.
		bad.segments[0].events.splice(2, 0, event('reference', 1.0, 'OUT OF ORDER REFERENCE'));
		const before = bad.segments[0].events.length;
		const validated = validateContract(bad);
		expect(validated.warnings.some((w) => /less than the prior measure/i.test(w))).toBe(true);
		// Event count is unchanged — flagged, not dropped.
		expect(validated.segments[0].events).toHaveLength(before);
	});

	it('allows repeated equal measures (multiple events at the same milepost)', () => {
		const c = sr7AltContract();
		// Two events at the same milepost is legitimate in real GDOT logs.
		c.segments[0].events.splice(2, 0, event('width_change', 1.2, 'BEGIN TURN LANE', 60));
		const validated = validateContract(c);
		expect(validated.warnings.some((w) => /less than the prior measure/i.test(w))).toBe(false);
	});

	it('flags an out-of-band segment length without altering the value', () => {
		const bad = sr7AltContract();
		bad.segments[0].length_mi = field.medium(250, 'fixture'); // 250 mi is implausible
		const validated = validateContract(bad);
		expect(validated.warnings.some((w) => /outside the plausible band/i.test(w))).toBe(true);
		// Value retained, not nulled.
		expect(validated.segments[0].length_mi.value).toBe(250);
	});

	it('flags a local_street that carries a project_mile axis', () => {
		const c = butlerContract();
		c.segments[0].measure_axis = field.medium('project_mile', 'fixture');
		const validated = validateContract(c);
		expect(validated.warnings.some((w) => /local_street but uses a project_mile axis/i.test(w))).toBe(
			true
		);
	});

	it('does not mutate the input contract (returns a copy)', () => {
		const c = sr7AltContract();
		c.segments[0].length_mi = field.medium(250, 'fixture');
		validateContract(c);
		// Original warnings array stays empty — validateContract clones it.
		expect(c.warnings).toHaveLength(0);
	});
});

// --------------------------------------------------------------------------
// Regex-vs-LLM cross-check
// --------------------------------------------------------------------------

function regexResultWith(overrides: Partial<Record<string, ParsedField<string | number>>>): ParsedGdotJobV2 {
	// Build a real V2 result from empty text, then patch the route-critical fields.
	const v2 = parseGdotDocumentsV2(['']);
	for (const [k, v] of Object.entries(overrides)) {
		(v2 as unknown as Record<string, unknown>)[k] = v;
	}
	return v2;
}

describe('crossCheckWithRegex (AI-primary; validator flags only)', () => {
	it('upgrades an agreeing route-critical field to high confidence', () => {
		const c = sr7AltContract();
		const regex = regexResultWith({
			county: field.high('Lowndes', 'deterministic'),
			route_designation: field.high('SR 7 ALT', 'deterministic'),
			gross_length_mi: field.high(2.86, 'deterministic')
		});
		const { contract: checked, conflicts } = crossCheckWithRegex(c, regex);
		expect(checked.county.name.confidence).toBe('high');
		expect(checked.route!.designation.confidence).toBe('high');
		expect(checked.gross_length_mi.confidence).toBe('high');
		// Agreement is not a conflict.
		expect(conflicts).toHaveLength(0);
	});

	it('KEEPS the AI value and emits a structured conflict when a route-critical field disagrees', () => {
		const c = sr7AltContract();
		const regex = regexResultWith({
			county: field.high('Echols', 'deterministic') // disagrees with fixture "Lowndes"
		});
		const { contract: checked, conflicts } = crossCheckWithRegex(c, regex);
		// AI-primary: the AI value ("Lowndes") is RETAINED, never overridden.
		expect(checked.county.name.value).toBe('Lowndes');
		// A structured conflict is raised for the review UI (amber verify flag).
		const conflict = conflicts.find((cf) => cf.field_path === 'county.name');
		expect(conflict).toBeDefined();
		expect(conflict!.ai_value).toBe('Lowndes');
		expect(conflict!.validator_value).toBe('Echols');
		expect(conflict!.resolution).toBe('needs_review');
		expect(conflict!.severity).toBe('warning');
		// A back-compat warning is still appended for the pre-Phase-7 UI.
		expect(
			checked.warnings.some((w: string) => /county.* differs between deterministic parser/i.test(w))
		).toBe(true);
	});

	it('leaves a field untouched when only one side has a value', () => {
		const c = sr7AltContract();
		const regex = regexResultWith({}); // empty -> regex county null
		const { contract: checked, conflicts } = crossCheckWithRegex(c, regex);
		expect(checked.county.name.value).toBe('Lowndes');
		expect(conflicts).toHaveLength(0);
	});
});

// --------------------------------------------------------------------------
// Per-segment mapping output SHAPE — ImportSegment contract (offline)
// --------------------------------------------------------------------------

/** Keys every mapped segment must expose to satisfy the ImportSegment contract. */
const IMPORT_SEGMENT_KEYS = [
	'name',
	'kind',
	'group',
	'treatment',
	'measure_axis',
	'begin_terminus',
	'end_terminus',
	'length_mi',
	'geometry',
	'geometry_confidence'
] as const;

describe('mapStructuredContractSegments output matches the ImportSegment shape', () => {
	it('emits every ImportSegment field per segment (offline; no termini -> no network)', async () => {
		// Local streets with NO termini short-circuit the termini road-snap before
		// any network call, so this is fully deterministic and offline.
		const c = emptyContract({
			segments: [
				segment({
					name: 'Marshall Street',
					kind: 'local_street',
					group: 'LMIG',
					treatment: 'overlay',
					axis: 'none',
					lengthMi: 0.3,
					begin: null,
					end: null
				}),
				segment({
					name: 'Bell Street',
					kind: 'local_street',
					group: 'LRA',
					treatment: 'restripe_only',
					axis: 'none',
					lengthMi: 0.2,
					begin: null,
					end: null
				})
			]
		});

		const mapped = await mapStructuredContractSegments(c);
		expect(mapped.segments).toHaveLength(2);

		for (const seg of mapped.segments) {
			for (const key of IMPORT_SEGMENT_KEYS) {
				expect(seg).toHaveProperty(key);
			}
			// Field types per the ImportSegment contract.
			expect(typeof seg.name === 'string' || seg.name === null).toBe(true);
			expect(['mainline', 'ramp', 'divided', 'local_street', null]).toContain(seg.kind);
			expect(typeof seg.group === 'string' || seg.group === null).toBe(true);
			expect(typeof seg.treatment === 'string' || seg.treatment === null).toBe(true);
			expect(['project_mile', 'none']).toContain(seg.measure_axis);
			expect(typeof seg.begin_terminus === 'string' || seg.begin_terminus === null).toBe(true);
			expect(typeof seg.end_terminus === 'string' || seg.end_terminus === null).toBe(true);
			expect(typeof seg.length_mi === 'number' || seg.length_mi === null).toBe(true);
			expect(seg.geometry === null || seg.geometry.type === 'LineString').toBe(true);
			expect(['high', 'medium', 'low'] as FieldConfidence[]).toContain(seg.geometry_confidence);
		}
	});

	it('carries name/kind/group/treatment/measure_axis through to the mapped output', async () => {
		const c = emptyContract({
			segments: [
				segment({
					name: 'Bell Street',
					kind: 'local_street',
					group: 'LRA',
					treatment: 'restripe_only',
					axis: 'none',
					lengthMi: 0.2,
					begin: null,
					end: null
				})
			]
		});
		const mapped = await mapStructuredContractSegments(c);
		const seg = mapped.segments[0];
		expect(seg.name).toBe('Bell Street');
		expect(seg.kind).toBe('local_street');
		expect(seg.group).toBe('LRA');
		expect(seg.treatment).toBe('restripe_only');
		expect(seg.measure_axis).toBe('none');
		expect(seg.length_mi).toBe(0.2);
	});

	it('flags un-resolvable termini as low geometry_confidence without fabricating a point', async () => {
		const c = emptyContract({
			segments: [
				segment({
					name: 'Marshall Street',
					kind: 'local_street',
					group: 'LMIG',
					treatment: 'overlay',
					axis: 'none',
					lengthMi: 0.3,
					begin: null,
					end: null
				})
			]
		});
		const mapped = await mapStructuredContractSegments(c);
		const seg = mapped.segments[0];
		// No termini -> cannot snap -> geometry stays null, confidence low, never invented.
		expect(seg.geometry).toBeNull();
		expect(seg.geometry_confidence).toBe('low');
	});
});
