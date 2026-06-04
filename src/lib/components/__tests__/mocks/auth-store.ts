/**
 * src/lib/components/__tests__/mocks/auth-store.ts
 *
 * Mock for auth store used in component tests.
 * Provides a logged-in user state without real fetch calls.
 */

export const mockAuthStore = {
	user: { id: 'test-user-1', email: 'test@example.com', name: 'Test User' },
	org: {
		id: 'test-org-1',
		name: 'Test Org',
		slug: 'test-org',
		role: 'foreman' as const,
		preferred_view: null
	},
	loading: false,
	isAuthenticated: true,
	fetch: async () => {},
	login: async () => ({}),
	logout: async () => {},
	clear: () => {}
};

export const authStore = mockAuthStore;
