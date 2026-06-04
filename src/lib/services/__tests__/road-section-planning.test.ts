import { describe, expect, it } from 'vitest';
import { plannedSegmentEndStation, validatePlannedSegment } from '../roadSectionPlanning';

describe('road section planning', () => {
	it('converts start plus feet into station end', () => {
		expect(plannedSegmentEndStation(12.5, 100)).toBe(13.5);
		expect(plannedSegmentEndStation(0, 250)).toBe(2.5);
	});

	it('rejects planned segments beyond route length', () => {
		const result = validatePlannedSegment(9.5, 100, 1000);
		expect(result.stationEnd).toBe(null);
		expect(result.error).toContain('beyond');
	});

	it('accepts planned segments within route length', () => {
		const result = validatePlannedSegment(4, 100, 600);
		expect(result).toEqual({ stationEnd: 5, error: null });
	});
});
