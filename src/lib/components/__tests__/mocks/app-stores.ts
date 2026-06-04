/**
 * src/lib/components/__tests__/mocks/app-stores.ts
 *
 * Mock for $app/stores used in component tests.
 */
import { writable, readable } from 'svelte/store';

export const page = writable({
	url: new URL('http://localhost/'),
	params: {},
	route: { id: null },
	data: {},
	status: 200,
	error: null,
	form: undefined
});

export const navigating = readable(null);
export const updated = readable(false);
