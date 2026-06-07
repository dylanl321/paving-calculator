// Derived UX-role layer: reduces the 8 DB roles to 4 product-facing UX roles.
// Shared client + server safe (NO server-only imports). This is a pure mapping
// with no schema or permission change — it only drives landing/preset UX.

export type UxRole = 'owner' | 'admin_office' | 'foreman' | 'field_crew';

/**
 * Maps a DB role string to its product-facing UX role.
 *
 * Mapping (8 DB roles -> 4 UX roles):
 * - owner                          -> 'owner'
 * - admin, office                  -> 'admin_office'
 * - inspector                      -> 'admin_office'  (Inspector folded into Admin/Office)
 * - foreman                        -> 'foreman'
 * - operator, laborer, screed_man  -> 'field_crew'    (operator -> field_crew is INTENTIONAL,
 *                                                       confirmed by the user; it lands operator
 *                                                       on /app/field instead of /dashboard)
 *
 * Unknown / unexpected inputs default to the most-restrictive sensible UX role:
 * 'field_crew' (least-privileged landing). We deliberately do NOT default to
 * 'owner' — an unrecognized role must never be granted the highest-trust landing.
 */
export function getUxRole(dbRole: string): UxRole {
	switch (dbRole) {
		case 'owner':
			return 'owner';
		case 'admin':
		case 'office':
		case 'inspector':
			return 'admin_office';
		case 'foreman':
			return 'foreman';
		case 'operator':
		case 'laborer':
		case 'screed_man':
			return 'field_crew';
		default:
			// Safe default: least-privileged landing for unknown roles.
			return 'field_crew';
	}
}

/**
 * Returns the landing path for a UX role.
 * - field_crew -> '/app/field'
 * - owner, admin_office, foreman -> '/dashboard'
 */
export function uxRoleLanding(role: UxRole): string {
	return role === 'field_crew' ? '/app/field' : '/dashboard';
}
