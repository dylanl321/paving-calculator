import { describe, expect, it } from 'vitest';
import { assessPlan, crewConflicts, type CrewWindow } from '../plan-status';

describe('assessPlan', () => {
	it('marks a job behind when tonnage lags the calendar, ignoring rain days', () => {
		const raining = assessPlan({
			plannedTons: 1000,
			placedTons: 400,
			totalLengthFt: 5280,
			pavedFt: 2000,
			laneWidthFt: 12,
			numLanes: 2,
			targetSpreadLbsSy: 110,
			startDate: '2026-06-01',
			endDate: '2026-06-10',
			asOf: '2026-06-05',
			weatherDays: 3
		});
		const dry = assessPlan({ ...{
			plannedTons: 1000,
			placedTons: 400,
			totalLengthFt: 5280,
			pavedFt: 2000,
			laneWidthFt: 12,
			numLanes: 2,
			targetSpreadLbsSy: 110,
			startDate: '2026-06-01',
			endDate: '2026-06-10',
			asOf: '2026-06-05',
			weatherDays: 0
		} });
		expect(raining.weatherDays).toBe(3);
		expect(raining.daysRemaining).toBe(5);
		expect(raining.pace).not.toBe(dry.pace);
		expect(dry.pace).toBe('behind');
		expect(raining.actualSpreadLbsSy).not.toBeNull();
		expect(raining.pavedMiles).toBeCloseTo(2000 / 5280, 1);
	});

	it('marks a job ahead when placed tons lead the schedule', () => {
		const status = assessPlan({
			plannedTons: 1000,
			placedTons: 800,
			totalLengthFt: 5280,
			pavedFt: 4000,
			laneWidthFt: 12,
			numLanes: 1,
			targetSpreadLbsSy: 110,
			startDate: '2026-06-01',
			endDate: '2026-06-20',
			asOf: '2026-06-02',
			weatherDays: 0
		});
		expect(status.pace).toBe('ahead');
		expect(status.tonsRemaining).toBe(200);
	});

	it('has no pace when dates are missing', () => {
		const status = assessPlan({
			plannedTons: 500,
			placedTons: 100,
			totalLengthFt: null,
			pavedFt: 0,
			laneWidthFt: 12,
			numLanes: 1,
			targetSpreadLbsSy: null,
			startDate: null,
			endDate: null,
			asOf: '2026-06-02',
			weatherDays: 0
		});
		expect(status.pace).toBe('no_plan');
		expect(status.tonsPct).toBe(20);
	});
});

describe('crewConflicts', () => {
	const base = (over: Partial<CrewWindow>): CrewWindow => ({
		crewId: 'c1',
		crewName: 'Day',
		jobSiteId: 'a',
		jobName: 'A',
		start: '2026-06-01',
		end: '2026-06-10',
		...over
	});

	it('flags a crew booked on two projects over the same dates', () => {
		const conflicts = crewConflicts([
			base({}),
			base({ jobSiteId: 'b', jobName: 'B', start: '2026-06-08', end: '2026-06-12' })
		]);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].crewName).toBe('Day');
	});

	it('ignores crews that have no dates yet', () => {
		const conflicts = crewConflicts([
			base({ start: null, end: null }),
			base({ jobSiteId: 'b', jobName: 'B', start: null, end: null })
		]);
		expect(conflicts).toHaveLength(0);
	});
});
