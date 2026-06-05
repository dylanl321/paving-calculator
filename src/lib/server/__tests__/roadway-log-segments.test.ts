import { describe, expect, it } from 'vitest';
import { buildLogSegments } from '../roadway-log-segments.js';

describe('roadway-log segments', () => {
	it('builds spans between consecutive events with carried width', () => {
		const segments = buildLogSegments([
			{
				milepost: 0,
				event_type: 'project_start',
				description: 'BEGIN PROJECT BEGIN MILLING 58 ft',
				roadway_width_ft: 58
			},
			{
				milepost: 0.019,
				event_type: 'width_change',
				description: 'WIDTH CHANGE END MILLING BEGIN RESURFACING',
				roadway_width_ft: 28
			},
			{
				milepost: 0.68,
				event_type: 'side_road',
				description: 'STRICKLAND ROAD, LEFT, UNPAVED'
			}
		]);

		expect(segments).toHaveLength(2);
		expect(segments[0].fromMeasure).toBe(0);
		expect(segments[0].toMeasure).toBe(0.019);
		expect(segments[0].widthFt).toBe(58);
		expect(segments[0].activeTreatments.some((t) => t.includes('MILLING'))).toBe(true);
		expect(segments[1].widthFt).toBe(28);
	});
});
