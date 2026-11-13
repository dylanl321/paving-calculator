import { describe, expect, it } from 'vitest';
import { addDaysToIsoDate } from '../schedule-dates';

describe('addDaysToIsoDate', () => {
	it('adds days on the calendar without shifting the start date', () => {
		expect(addDaysToIsoDate('2026-06-01', 0)).toBe('2026-06-01');
		expect(addDaysToIsoDate('2026-06-01', 2)).toBe('2026-06-03');
	});

	it('rolls over month and year boundaries', () => {
		expect(addDaysToIsoDate('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01');
	});

	it('rejects dates that are not real calendar days', () => {
		expect(addDaysToIsoDate('2026-02-31', 1)).toBeNull();
		expect(addDaysToIsoDate('06/01/2026', 1)).toBeNull();
		expect(addDaysToIsoDate('', 1)).toBeNull();
	});
});
