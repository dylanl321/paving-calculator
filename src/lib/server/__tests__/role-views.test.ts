import { describe, it, expect } from 'vitest';
import {
	getViewForRole,
	getDefaultView,
	getRedirectForView,
	getRedirectPath,
	getLoginRedirect,
	type RoleView
} from '../role-views';

// -----------------------------------------------------------------------
// getViewForRole / getDefaultView
// -----------------------------------------------------------------------

describe('getViewForRole', () => {
	it('owner gets full view', () => {
		expect(getViewForRole('owner')).toBe('full');
	});

	it('admin gets full view', () => {
		expect(getViewForRole('admin')).toBe('full');
	});

	it('foreman gets full view', () => {
		expect(getViewForRole('foreman')).toBe('full');
	});

	it('member gets full view', () => {
		expect(getViewForRole('member')).toBe('full');
	});

	it('operator gets full view', () => {
		expect(getViewForRole('operator')).toBe('full');
	});

	it('inspector gets full view', () => {
		expect(getViewForRole('inspector')).toBe('full');
	});

	it('screed_man gets field view', () => {
		expect(getViewForRole('screed_man')).toBe('field');
	});

	it('laborer gets field view', () => {
		expect(getViewForRole('laborer')).toBe('field');
	});

	it('office role gets office view', () => {
		expect(getViewForRole('office')).toBe('office');
	});

	// Edge: unknown / null-like inputs
	it('unknown role falls back to full view', () => {
		expect(getViewForRole('unknown_role')).toBe('full');
	});

	it('empty string role falls back to full view', () => {
		expect(getViewForRole('')).toBe('full');
	});

	it('uppercase version of known role falls back to full (case-sensitive)', () => {
		// Role strings come from DB; enforcing strict lowercase avoids escalation via casing
		expect(getViewForRole('ADMIN')).toBe('full');
		expect(getViewForRole('Owner')).toBe('full');
	});
});

describe('getDefaultView (alias)', () => {
	it('is the same function as getViewForRole', () => {
		expect(getDefaultView).toBe(getViewForRole);
	});

	it('returns matching results for all views', () => {
		expect(getDefaultView('owner')).toBe('full');
		expect(getDefaultView('laborer')).toBe('field');
		expect(getDefaultView('office')).toBe('office');
	});
});

// -----------------------------------------------------------------------
// getRedirectForView / getRedirectPath
// -----------------------------------------------------------------------

describe('getRedirectForView', () => {
	it('full view redirects to /dashboard', () => {
		expect(getRedirectForView('full')).toBe('/dashboard');
	});

	it('field view redirects to /app/field', () => {
		expect(getRedirectForView('field')).toBe('/app/field');
	});

	it('office view redirects to /dashboard', () => {
		expect(getRedirectForView('office')).toBe('/dashboard');
	});
});

describe('getRedirectPath (alias)', () => {
	it('is the same function as getRedirectForView', () => {
		expect(getRedirectPath).toBe(getRedirectForView);
	});

	it('returns matching redirect for each view', () => {
		const views: RoleView[] = ['full', 'field', 'office'];
		for (const view of views) {
			expect(getRedirectPath(view)).toBe(getRedirectForView(view));
		}
	});
});

// -----------------------------------------------------------------------
// getLoginRedirect
// -----------------------------------------------------------------------

describe('getLoginRedirect', () => {
	it('owner with no preferred view goes to /dashboard', () => {
		expect(getLoginRedirect('owner')).toBe('/dashboard');
	});

	it('admin with no preferred view goes to /dashboard', () => {
		expect(getLoginRedirect('admin')).toBe('/dashboard');
	});

	it('member with no preferred view goes to /dashboard', () => {
		expect(getLoginRedirect('member')).toBe('/dashboard');
	});

	it('laborer with no preferred view goes to /app/field', () => {
		expect(getLoginRedirect('laborer')).toBe('/app/field');
	});

	it('screed_man with no preferred view goes to /app/field', () => {
		expect(getLoginRedirect('screed_man')).toBe('/app/field');
	});

	it('office role with no preferred view goes to /dashboard', () => {
		expect(getLoginRedirect('office')).toBe('/dashboard');
	});

	// Preferred view override
	it('laborer with preferred_view=full goes to /dashboard', () => {
		expect(getLoginRedirect('laborer', 'full')).toBe('/dashboard');
	});

	it('owner with preferred_view=field goes to /app/field', () => {
		expect(getLoginRedirect('owner', 'field')).toBe('/app/field');
	});

	it('owner with preferred_view=office goes to /dashboard', () => {
		expect(getLoginRedirect('owner', 'office')).toBe('/dashboard');
	});

	// Escalation prevention: a field-level user should NOT be able to escalate
	// their view by requesting a higher-trust view (since preferred_view here
	// is a stored column, not a user-controlled param — but we document the
	// behavior so tests catch any future bypass)
	it('preferred_view override is respected regardless of role (stored pref, not user input)', () => {
		// This is a documentation test: preferred_view comes from a DB column, not
		// from the request. The function trusts it. If this changes, the test fails
		// and forces a review of the trust boundary.
		expect(getLoginRedirect('laborer', 'full')).toBe('/dashboard');
	});

	// Null / undefined preferred view falls through to role-based view
	it('null preferred_view falls back to role-based view', () => {
		expect(getLoginRedirect('laborer', null)).toBe('/app/field');
	});

	it('undefined preferred_view falls back to role-based view', () => {
		expect(getLoginRedirect('laborer', undefined)).toBe('/app/field');
	});

	// Edge cases
	it('unknown role with no preferred view falls back to full -> /dashboard', () => {
		expect(getLoginRedirect('unknown_role')).toBe('/dashboard');
	});

	it('empty string role with no preferred view returns /dashboard', () => {
		expect(getLoginRedirect('')).toBe('/dashboard');
	});
});

// -----------------------------------------------------------------------
// Type guard: RoleView is the union full | field | office
// -----------------------------------------------------------------------

describe('RoleView type coverage', () => {
	it('all three view values are returned somewhere', () => {
		const views = new Set<RoleView>();
		for (const role of ['owner', 'laborer', 'office', 'admin', 'screed_man', 'member']) {
			views.add(getViewForRole(role));
		}
		expect(views.has('full')).toBe(true);
		expect(views.has('field')).toBe(true);
		expect(views.has('office')).toBe(true);
	});
});
