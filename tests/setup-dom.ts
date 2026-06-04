// Setup file for component tests.
// Runs in jsdom environment. Import @testing-library/jest-dom matchers
// so assertions like expect(el).toBeInTheDocument() work out of the box.
import { expect, afterEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/svelte';

expect.extend(matchers);

// jsdom does not implement the Web Animations API (element.animate).
// Svelte's built-in transitions (slide, fade) call it during enter/exit.
// Stub it out so transition-related tests don't emit unhandled errors.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
	Element.prototype.animate = () =>
		({
			cancel: () => {},
			finish: () => {},
			pause: () => {},
			play: () => {},
			reverse: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			onfinish: null,
			oncancel: null,
			finished: Promise.resolve({} as Animation)
		}) as unknown as Animation;
}

// Clean up the DOM after every test to prevent state bleed across tests.
afterEach(() => cleanup());
