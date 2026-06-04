// Setup file for component tests.
// Runs in jsdom environment. Import @testing-library/jest-dom matchers
// so assertions like expect(el).toBeInTheDocument() work out of the box.
import { expect, afterEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/svelte';

expect.extend(matchers);

// Clean up the DOM after every test to prevent state bleed across tests.
afterEach(() => cleanup());
