import { describe, expect, it } from 'vitest';
import { isInGeorgia, reprojectMidpoint } from '../ga-state-plane.js';

/** 25185 CONTRACT SUMMARY mid-point (Echols Co SR 11). */
const SR11_MID_E = 386066.213;
const SR11_MID_N = 239963.852;

describe('ga-state-plane', () => {
	it('reprojects 25185 mid-point under NAD83 GA-East ftUS into Georgia', () => {
		const [lon, lat] = reprojectMidpoint(SR11_MID_E, SR11_MID_N, 2239);
		expect(isInGeorgia(lon, lat)).toBe(true);
		expect(lat).toBeGreaterThan(30.6);
		expect(lat).toBeLessThan(30.75);
		expect(lon).toBeLessThan(-83);
		expect(lon).toBeGreaterThan(-83.05);
	});
});
