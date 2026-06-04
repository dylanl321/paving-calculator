/**
 * Unit tests for calcETAStats and calcWeatherAdjustedETA
 * as exported from src/lib/calc/index.ts.
 */
import { describe, it, expect } from 'vitest';
import { calcETAStats, calcWeatherAdjustedETA } from '../index';

// Helper: build a load with a specific date
function makeLoad(tons: number, dateStr: string, rejected = false) {
	return {
		tons,
		rejected,
		timestamp: Math.floor(new Date(dateStr).getTime() / 1000)
	};
}

// ─── calcETAStats ─────────────────────────────────────────────────────────────
describe('calcETAStats', () => {
	it('returns zeroed stats when no loads', () => {
		const result = calcETAStats([], 1000);
		expect(result.totalTons).toBe(0);
		expect(result.daysWorked).toBe(0);
		expect(result.avgTonsPerDay).toBe(0);
		expect(result.remainingTons).toBe(1000);
		expect(result.daysRemaining).toBeNull();
		expect(result.isComplete).toBe(false);
	});

	it('counts total tons from accepted loads only', () => {
		const loads = [
			makeLoad(100, '2025-06-01'),
			makeLoad(50, '2025-06-01', true), // rejected -- should not count
			makeLoad(100, '2025-06-02')
		];
		const result = calcETAStats(loads, null);
		expect(result.totalTons).toBe(200);
	});

	it('counts distinct days worked', () => {
		const loads = [
			makeLoad(100, '2025-06-01T08:00:00'),
			makeLoad(100, '2025-06-01T14:00:00'), // same day
			makeLoad(100, '2025-06-02T09:00:00')
		];
		const result = calcETAStats(loads, null);
		expect(result.daysWorked).toBe(2);
	});

	it('computes average tons per day', () => {
		const loads = [
			makeLoad(200, '2025-06-01'),
			makeLoad(200, '2025-06-02')
		];
		const result = calcETAStats(loads, null);
		expect(result.avgTonsPerDay).toBeCloseTo(200, 4);
	});

	it('computes remaining and daysRemaining when target set', () => {
		const loads = [
			makeLoad(200, '2025-06-01'),
			makeLoad(200, '2025-06-02')
		];
		// 400 tons done, avg 200/day, target 1000 => 600 remaining => 3 days
		const result = calcETAStats(loads, 1000);
		expect(result.remainingTons).toBe(600);
		expect(result.daysRemaining).toBe(3);
	});

	it('isComplete when remaining <= 0', () => {
		const loads = [makeLoad(1000, '2025-06-01')];
		const result = calcETAStats(loads, 500);
		expect(result.isComplete).toBe(true);
		expect(result.remainingTons).toBe(0);
	});

	it('remainingTons is null when target is null', () => {
		const loads = [makeLoad(100, '2025-06-01')];
		const result = calcETAStats(loads, null);
		expect(result.remainingTons).toBeNull();
		expect(result.daysRemaining).toBeNull();
	});

	it('daysRemaining uses ceil (rounds up)', () => {
		const loads = [
			makeLoad(150, '2025-06-01'),
			makeLoad(150, '2025-06-02')
		];
		// 300 tons, 2 days, avg=150/day, target=500 => remaining=200, days=ceil(200/150)=2
		const result = calcETAStats(loads, 500);
		expect(result.daysRemaining).toBe(2);
	});

	it('handles zero target gracefully', () => {
		const loads = [makeLoad(100, '2025-06-01')];
		const result = calcETAStats(loads, 0);
		// target 0 => remainingTons null, isComplete false (target not positive)
		expect(result.remainingTons).toBeNull();
	});
});

// ─── calcWeatherAdjustedETA ──────────────────────────────────────────────────
describe('calcWeatherAdjustedETA', () => {
	// Build forecast array starting from tomorrow
	function makeForecast(daysAhead: number, precipIn: number, precipProbabilityMax: number) {
		const d = new Date();
		d.setDate(d.getDate() + daysAhead);
		return {
			date: d.toISOString().split('T')[0],
			precipIn,
			precipProbabilityMax
		};
	}

	it('no rain in forecast: adjustedDate computed, no rain days excluded', () => {
		const forecast = [1, 2, 3, 4, 5].map(d => makeForecast(d, 0, 0));
		const result = calcWeatherAdjustedETA(3, forecast, 0.10);
		expect(result.rainDaysExcluded).toBe(0);
		expect(result.forecastExceeded).toBe(false);
		expect(result.adjustedDate).not.toBeNull();
	});

	it('rain day (high precip) excluded, extends completion', () => {
		// Day 1: rain (precipIn >= threshold 0.10), Days 2-4: clear
		const forecast = [
			makeForecast(1, 0.20, 30),  // rain by precipIn
			makeForecast(2, 0, 0),
			makeForecast(3, 0, 0),
			makeForecast(4, 0, 0)
		];
		const result = calcWeatherAdjustedETA(3, forecast, 0.10);
		expect(result.rainDaysExcluded).toBe(1);
		expect(result.forecastExceeded).toBe(false);
	});

	it('rain day (high probability) excluded', () => {
		// precipProbabilityMax >= 60 => rain day
		const forecast = [
			makeForecast(1, 0, 70),  // rain by probability
			makeForecast(2, 0, 0),
			makeForecast(3, 0, 0),
			makeForecast(4, 0, 0)
		];
		const result = calcWeatherAdjustedETA(3, forecast, 0.10);
		expect(result.rainDaysExcluded).toBe(1);
	});

	it('forecastExceeded when not enough clear days in forecast window', () => {
		// 3 days remaining, 10-day forecast all rain
		const forecast = Array.from({ length: 10 }, (_, i) => makeForecast(i + 1, 0.5, 90));
		const result = calcWeatherAdjustedETA(3, forecast, 0.10);
		expect(result.forecastExceeded).toBe(true);
		expect(result.adjustedDate).toBeNull();
	});

	it('0 days remaining: returns immediately (no work left)', () => {
		const forecast = [1, 2, 3].map(d => makeForecast(d, 0, 0));
		const result = calcWeatherAdjustedETA(0, forecast, 0.10);
		expect(result.rainDaysExcluded).toBe(0);
		// workDaysRemaining=0 at start, loop doesn't execute
		expect(result.forecastExceeded).toBe(false);
	});

	it('no forecast data: assumes working days (no exclusions)', () => {
		const result = calcWeatherAdjustedETA(3, [], 0.10);
		// With no forecast data, all days assumed workable => completes in 3 days
		// but maxForecastDays=10 cap: 3 iterations consume 3 working days
		expect(result.rainDaysExcluded).toBe(0);
		expect(result.forecastExceeded).toBe(false);
	});
});
