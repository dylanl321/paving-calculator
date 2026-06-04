/**
 * src/lib/components/__tests__/mocks/calc-context.ts
 *
 * Mock for calcContext store used in component tests.
 * Provides configurable reactive values without real store dependencies.
 */

export const mockCalcContext = {
	air_temp: { value: 72, source: 'manual' as const, updatedAt: Date.now() },
	wind_speed: { value: 5, source: 'manual' as const, updatedAt: Date.now() },
	road_width: { value: 12, source: 'manual' as const, updatedAt: Date.now() },
	lift_thickness: { value: 2, source: 'manual' as const, updatedAt: Date.now() },
	course_type: { value: 'surface', source: 'manual' as const, updatedAt: Date.now() }
};

export const calcContext = mockCalcContext;
