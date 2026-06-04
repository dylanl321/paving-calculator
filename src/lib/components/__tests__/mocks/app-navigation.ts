/**
 * src/lib/components/__tests__/mocks/app-navigation.ts
 *
 * Mock for $app/navigation used in component tests.
 */
import { vi } from 'vitest';

export const goto = vi.fn().mockResolvedValue(undefined);
export const invalidate = vi.fn().mockResolvedValue(undefined);
export const invalidateAll = vi.fn().mockResolvedValue(undefined);
export const preloadData = vi.fn().mockResolvedValue({ type: 'loaded', status: 200, data: {} });
export const preloadCode = vi.fn().mockResolvedValue(undefined);
export const afterNavigate = vi.fn();
export const beforeNavigate = vi.fn();
export const onNavigate = vi.fn();
export const pushState = vi.fn();
export const replaceState = vi.fn();
