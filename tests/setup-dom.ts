// Setup file for component tests.
// Runs in jsdom environment. Import @testing-library/jest-dom matchers
// so assertions like expect(el).toBeInTheDocument() work out of the box.
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);
