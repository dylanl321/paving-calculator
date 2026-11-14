import { addDaysToIsoDate } from './schedule-dates';

export type Pace = 'ahead' | 'on_track' | 'behind' | 'no_plan';

export interface PlanInputs {
	plannedTons: number | null;
	placedTons: number;
	totalLengthFt: number | null;
	pavedFt: number;
	laneWidthFt: number | null;
	numLanes: number | null;
	targetSpreadLbsSy: number | null;
	startDate: string | null;
	endDate: string | null;
	asOf: string;
	/** Rain or other non-production days between start and asOf. */
	weatherDays: number;
}

export interface PlanStatus {
	plannedTons: number | null;
	placedTons: number;
	tonsRemaining: number | null;
	tonsPct: number | null;
	totalLengthFt: number | null;
	pavedFt: number;
	pavedMiles: number;
	totalMiles: number | null;
	lengthPct: number | null;
	actualSpreadLbsSy: number | null;
	targetSpreadLbsSy: number | null;
	spreadDeltaPct: number | null;
	daysTotal: number | null;
	daysElapsed: number | null;
	daysRemaining: number | null;
	weatherDays: number;
	expectedTonsPct: number | null;
	pace: Pace;
}

function dayIndex(iso: string): number | null {
	const added = addDaysToIsoDate(iso, 0);
	if (!added) return null;
	const [y, m, d] = added.split('-').map(Number);
	const utc = Date.UTC(y, m - 1, d);
	return Math.round(utc / 86_400_000);
}

function spanDays(start: string, end: string): number | null {
	const a = dayIndex(start);
	const b = dayIndex(end);
	if (a == null || b == null || b < a) return null;
	return b - a + 1;
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

/**
 * Compare placed work with the plan. Ahead/behind uses tonnage when a plan
 * exists, otherwise paved length. Weather days are removed from the elapsed
 * schedule so a rain day is not treated as a missed production day.
 * A gap of 5 percentage points or more is ahead or behind.
 */
export function assessPlan(input: PlanInputs): PlanStatus {
	const placedTons = Math.max(0, input.placedTons);
	const pavedFt = Math.max(0, input.pavedFt);
	const plannedTons = input.plannedTons != null && input.plannedTons > 0 ? input.plannedTons : null;
	const totalLengthFt = input.totalLengthFt != null && input.totalLengthFt > 0 ? input.totalLengthFt : null;
	const tonsPct = plannedTons != null ? round1((placedTons / plannedTons) * 100) : null;
	const lengthPct = totalLengthFt != null ? round1((pavedFt / totalLengthFt) * 100) : null;
	const width = input.laneWidthFt != null && input.laneWidthFt > 0 ? input.laneWidthFt : null;
	const lanes = input.numLanes != null && input.numLanes > 0 ? input.numLanes : 1;
	let actualSpread: number | null = null;
	if (placedTons > 0 && pavedFt > 0 && width) {
		const areaSy = (pavedFt * width * lanes) / 9;
		if (areaSy > 0) actualSpread = round1((placedTons * 2000) / areaSy);
	}
	const target = input.targetSpreadLbsSy != null && input.targetSpreadLbsSy > 0 ? input.targetSpreadLbsSy : null;
	const spreadDeltaPct =
		actualSpread != null && target != null ? round1(((actualSpread - target) / target) * 100) : null;

	const daysTotal =
		input.startDate && input.endDate ? spanDays(input.startDate, input.endDate) : null;
	const daysElapsed =
		input.startDate && input.asOf ? spanDays(input.startDate, input.asOf) : null;
	const weatherDays = Math.max(0, input.weatherDays);
	const productiveElapsed =
		daysElapsed != null ? Math.max(0, Math.min(daysElapsed, daysElapsed - weatherDays)) : null;
	const daysRemaining =
		daysTotal != null && daysElapsed != null ? Math.max(0, daysTotal - daysElapsed) : null;
	const expectedTonsPct =
		daysTotal != null && daysTotal > 0 && productiveElapsed != null
			? round1((Math.min(productiveElapsed, daysTotal) / daysTotal) * 100)
			: null;

	const actualPct = tonsPct ?? lengthPct;
	let pace: Pace = 'no_plan';
	if (actualPct != null && expectedTonsPct != null) {
		const gap = actualPct - expectedTonsPct;
		if (gap >= 5) pace = 'ahead';
		else if (gap <= -5) pace = 'behind';
		else pace = 'on_track';
	}

	return {
		plannedTons,
		placedTons: round1(placedTons),
		tonsRemaining: plannedTons != null ? round1(Math.max(0, plannedTons - placedTons)) : null,
		tonsPct,
		totalLengthFt,
		pavedFt: round1(pavedFt),
		pavedMiles: round1(pavedFt / 5280),
		totalMiles: totalLengthFt != null ? round1(totalLengthFt / 5280) : null,
		lengthPct,
		actualSpreadLbsSy: actualSpread,
		targetSpreadLbsSy: target,
		spreadDeltaPct,
		daysTotal,
		daysElapsed,
		daysRemaining,
		weatherDays,
		expectedTonsPct,
		pace
	};
}

export interface CrewWindow {
	crewId: string;
	crewName: string;
	jobSiteId: string;
	jobName: string;
	start: string | null;
	end: string | null;
}

export interface CrewConflict {
	crewId: string;
	crewName: string;
	a: CrewWindow;
	b: CrewWindow;
}

function windowEnd(window: CrewWindow): string | null {
	return window.end ?? window.start;
}

/** Inclusive date overlap. Windows without a start date are unscheduled and do not conflict. */
export function crewConflicts(windows: CrewWindow[]): CrewConflict[] {
	const conflicts: CrewConflict[] = [];
	for (let i = 0; i < windows.length; i++) {
		for (let j = i + 1; j < windows.length; j++) {
			const a = windows[i];
			const b = windows[j];
			if (a.crewId !== b.crewId || a.jobSiteId === b.jobSiteId) continue;
			if (!a.start || !b.start) continue;
			const aEnd = windowEnd(a);
			const bEnd = windowEnd(b);
			if (!aEnd || !bEnd) continue;
			if (a.start <= bEnd && b.start <= aEnd) {
				conflicts.push({ crewId: a.crewId, crewName: a.crewName, a, b });
			}
		}
	}
	return conflicts;
}
