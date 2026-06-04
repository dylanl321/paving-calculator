// Role-based view mapping for dashboard routing

export type RoleView = 'full' | 'field' | 'office';

/**
 * Maps a role to its corresponding view level.
 * - screed_man, laborer -> 'field' (simplified field view)
 * - office -> 'office' (office-focused view)
 * - owner, admin, foreman, member, operator, inspector -> 'full' (full dashboard)
 */
export function getViewForRole(role: string): RoleView {
	switch (role) {
		case 'screed_man':
		case 'laborer':
			return 'field';
		case 'office':
			return 'office';
		case 'owner':
		case 'admin':
		case 'foreman':
		case 'member':
		case 'operator':
		case 'inspector':
			return 'full';
		default:
			return 'full';
	}
}

/**
 * Returns the redirect path for a given view level.
 * - 'full' -> '/dashboard'
 * - 'field' -> '/app/field'
 * - 'office' -> '/dashboard'
 */
export function getRedirectForView(view: RoleView): string {
	switch (view) {
		case 'field':
			return '/app/field';
		case 'office':
		case 'full':
			return '/dashboard';
	}
}
