import { writable } from 'svelte/store';

export const showOnboarding = writable(false);

export function triggerOnboarding() {
	showOnboarding.set(true);
}
