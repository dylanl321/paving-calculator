import { describe, it, expect } from 'vitest';
import { defaultLensForRole, sitesForLens, lensColor, lensSummary, parseLens, LENS_COLORS } from '$lib/map-lens';

const sites = [
	{ id: 'a', status: 'active', has_geometry: true, crew_name: 'Crew A' },
	{ id: 'b', status: 'active', has_geometry: false, crew_name: null },
	{ id: 'c', status: 'completed', has_geometry: true, crew_name: null },
	{ id: 'd', status: 'planned', has_geometry: false, crew_name: null },
	{ id: 'e', status: 'archived', has_geometry: false, crew_name: null }
];

describe('map lenses', () => {
	it('starts each role on its lens', () => {
		expect(defaultLensForRole('owner')).toBe('progress');
		expect(defaultLensForRole('admin_office')).toBe('setup');
		expect(defaultLensForRole('foreman')).toBe('today');
		expect(defaultLensForRole('field_crew')).toBe('today');
	});

	it('parses only known lenses', () => {
		expect(parseLens('setup')).toBe('setup');
		expect(parseLens('quality')).toBeNull();
		expect(parseLens(null)).toBeNull();
	});

	it('today shows logging jobs, else active jobs with a crew', () => {
		expect(sitesForLens(sites, 'today', new Map()).map((s) => s.id)).toEqual(['a']);
		const live = new Map([['b', { today_log_open: true, today_tons: 120, today_loads: 6 }]]);
		expect(sitesForLens(sites, 'today', live).map((s) => s.id)).toEqual(['b']);
		expect(lensSummary(sites, 'today', live)).toBe('1 job paving · 120 t so far');
	});

	it('setup shows open jobs without a road line', () => {
		expect(sitesForLens(sites, 'setup', new Map()).map((s) => s.id)).toEqual(['b', 'd']);
		expect(lensSummary(sites, 'setup', new Map())).toBe('2 jobs need a road line');
	});

	it('progress hides archived jobs and colors by status', () => {
		expect(sitesForLens(sites, 'progress', new Map()).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
		expect(lensColor(sites[2], 'progress', false, new Map())).toBe(LENS_COLORS.done);
		expect(lensColor(sites[0], 'progress', false, new Map())).toBe(LENS_COLORS.active);
		expect(lensColor(sites[0], 'progress', true, new Map())).toBe(LENS_COLORS.focus);
	});
});
