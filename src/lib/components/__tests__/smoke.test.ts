/**
 * src/lib/components/__tests__/smoke.test.ts
 *
 * Smoke test to verify the jsdom + @testing-library/svelte component test
 * environment is working correctly. Renders a simple Svelte component and
 * asserts basic DOM behaviour.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CompletenessBar from '$lib/components/CompletenessBar.svelte';

describe('component test environment smoke test', () => {
	it('jsdom: document object is available', () => {
		expect(typeof document).toBe('object');
		expect(document.createElement('div')).toBeDefined();
	});

	it('jsdom: can create and attach DOM elements', () => {
		const div = document.createElement('div');
		div.textContent = 'hello from jsdom';
		document.body.appendChild(div);
		expect(document.body.contains(div)).toBe(true);
		document.body.removeChild(div);
	});

	it('CompletenessBar: renders into the document without throwing', () => {
		const { container } = render(CompletenessBar, {
			props: {
				data: {
					weather_temp_f: 72,
					crew_count: 3,
					start_time: '07:00',
					end_time: '15:00',
					entries: [{ id: '1', qty_tons: 10 }],
					notes: null,
					wind_speed_mph: 5,
					plant_name: 'Test Plant'
				}
			}
		});
		expect(container).toBeDefined();
		expect(document.body.contains(container)).toBe(true);
	});
});
