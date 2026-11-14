import { describe, it, expect } from 'vitest';
import { computeTodayAnswer, tonsPerFoot } from '$lib/today-answer';

const now = new Date(2026, 10, 14, 12, 0, 0);
const at = (h: number, m: number) => new Date(2026, 10, 14, h, m, 0).getTime() / 1000;

describe('tonsPerFoot', () => {
	it('12 ft at 165 lbs/SY is 0.11 t per foot', () => {
		expect(tonsPerFoot(12, 165)).toBeCloseTo(0.11, 5);
	});
});

describe('computeTodayAnswer', () => {
	const base = { laneWidthFt: 12, targetRateLbsSy: 165, now };

	it('says no loads yet with the order', () => {
		const a = computeTodayAnswer({ ...base, loads: [], targetTons: 480 });
		expect(a.headline).toBe('No loads yet. 480 t ordered for today.');
		expect(a.tone).toBe('neutral');
	});

	it('projects a finish time when on pace', () => {
		// 4 loads of 22 t from 8:00 to noon = 22 t/h; 480 - 88 = 392 t left is too slow
		// so use a big pace: 10 loads by noon from 10:00 = 110 t/h.
		const loads = Array.from({ length: 10 }, (_, i) => ({ tons: 22, timestamp: at(10, i * 10), spread_rate: 165 }));
		const a = computeTodayAnswer({ ...base, loads, targetTons: 330 });
		// 220 placed, 110 left at 110 t/h = 1 hour → 1:00 PM
		expect(a.placedTons).toBe(220);
		expect(a.tonsLeft).toBe(110);
		expect(a.feetLeft).toBeCloseTo(1000, 0);
		expect(a.loadsLeft).toBe(5);
		expect(a.headline).toBe('On pace, done by 1:00 PM');
		expect(a.tone).toBe('good');
		expect(a.avgRateLbsSy).toBe(165);
	});

	it('warns when the finish is after the end of day', () => {
		const loads = [
			{ tons: 20, timestamp: at(8, 0), spread_rate: null },
			{ tons: 20, timestamp: at(9, 0), spread_rate: null }
		];
		// 40 t over 4 h = 10 t/h; 200 left → 20 h → tomorrow
		const a = computeTodayAnswer({ ...base, loads, targetTons: 240 });
		expect(a.tone).toBe('warn');
		expect(a.headline.startsWith('Behind pace, done around')).toBe(true);
	});

	it('ignores rejected loads and reports a finished order', () => {
		const loads = [
			{ tons: 22, timestamp: at(8, 0), spread_rate: 160 },
			{ tons: 22, timestamp: at(9, 0), spread_rate: 170, rejected: 1 },
			{ tons: 22, timestamp: at(10, 0), spread_rate: 170 }
		];
		const a = computeTodayAnswer({ ...base, loads, targetTons: 44 });
		expect(a.loadCount).toBe(2);
		expect(a.headline).toBe("Today's order is down: 44 of 44 t");
		expect(a.avgRateLbsSy).toBe(165);
	});

	it('falls back to tons placed without an order', () => {
		const a = computeTodayAnswer({ ...base, loads: [{ tons: 21.6, timestamp: at(8, 0), spread_rate: null }], targetTons: null });
		expect(a.headline).toBe('22 t placed today');
		expect(a.tonsLeft).toBeNull();
	});

	it('needs 20 minutes of loads before projecting', () => {
		const loads = [
			{ tons: 22, timestamp: at(11, 50), spread_rate: null },
			{ tons: 22, timestamp: at(11, 55), spread_rate: null }
		];
		const a = computeTodayAnswer({ ...base, loads, targetTons: 400 });
		expect(a.finishAt).toBeNull();
		expect(a.headline).toBe("356 t left of today's 400 t");
	});
});
