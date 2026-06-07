import { describe, it, expect } from 'vitest';
import { getUxRole, uxRoleLanding, type UxRole } from '../uxRole';

// -----------------------------------------------------------------------
// getUxRole — all 8 DB roles + unknown
// -----------------------------------------------------------------------

describe('getUxRole', () => {
	it('owner -> owner', () => {
		expect(getUxRole('owner')).toBe('owner');
	});

	it('admin -> admin_office', () => {
		expect(getUxRole('admin')).toBe('admin_office');
	});

	it('office -> admin_office', () => {
		expect(getUxRole('office')).toBe('admin_office');
	});

	it('inspector -> admin_office (folded into Admin/Office)', () => {
		expect(getUxRole('inspector')).toBe('admin_office');
	});

	it('foreman -> foreman', () => {
		expect(getUxRole('foreman')).toBe('foreman');
	});

	it('operator -> field_crew (intentional, confirmed by user)', () => {
		expect(getUxRole('operator')).toBe('field_crew');
	});

	it('laborer -> field_crew', () => {
		expect(getUxRole('laborer')).toBe('field_crew');
	});

	it('screed_man -> field_crew', () => {
		expect(getUxRole('screed_man')).toBe('field_crew');
	});

	// Safe default: unknown roles get the least-privileged UX role, NOT owner.
	it('unknown role defaults to field_crew (least privileged)', () => {
		expect(getUxRole('unknown_role')).toBe('field_crew');
	});

	it('empty string defaults to field_crew', () => {
		expect(getUxRole('')).toBe('field_crew');
	});

	it('mis-cased known role defaults to field_crew (case-sensitive)', () => {
		expect(getUxRole('Owner')).toBe('field_crew');
		expect(getUxRole('ADMIN')).toBe('field_crew');
	});
});

// -----------------------------------------------------------------------
// uxRoleLanding
// -----------------------------------------------------------------------

describe('uxRoleLanding', () => {
	it('field_crew lands on /app/field', () => {
		expect(uxRoleLanding('field_crew')).toBe('/app/field');
	});

	it('owner lands on /dashboard', () => {
		expect(uxRoleLanding('owner')).toBe('/dashboard');
	});

	it('admin_office lands on /dashboard', () => {
		expect(uxRoleLanding('admin_office')).toBe('/dashboard');
	});

	it('foreman lands on /dashboard', () => {
		expect(uxRoleLanding('foreman')).toBe('/dashboard');
	});

	it('every UX role maps to a known landing path', () => {
		const roles: UxRole[] = ['owner', 'admin_office', 'foreman', 'field_crew'];
		for (const role of roles) {
			expect(['/dashboard', '/app/field']).toContain(uxRoleLanding(role));
		}
	});
});
