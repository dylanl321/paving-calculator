// Auth state store for managing logged-in user and organization.
// Syncs with the backend API at /api/auth/me.

interface UserData {
	id: string;
	email: string;
	name: string;
}

interface OrgData {
	id: string;
	name: string;
	slug: string;
	role: 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office' | 'laborer' | 'screed_man';
}

interface AuthState {
	user: UserData | null;
	org: OrgData | null;
	loading: boolean;
}

class AuthStore {
	#state = $state<AuthState>({ user: null, org: null, loading: true });

	get user() {
		return this.#state.user;
	}

	get org() {
		return this.#state.org;
	}

	get loading() {
		return this.#state.loading;
	}

	get isAuthenticated() {
		return !!this.#state.user;
	}

	async fetch() {
		this.#state.loading = true;
		try {
			const res = await fetch('/api/auth/me', { credentials: 'include' });
			if (res.ok) {
				const data = (await res.json()) as { user: UserData | null; org: OrgData | null };
				this.#state.user = data.user;
				this.#state.org = data.org;
			} else {
				this.#state.user = null;
				this.#state.org = null;
			}
		} catch (err) {
			console.error('Auth fetch error:', err);
			this.#state.user = null;
			this.#state.org = null;
		} finally {
			this.#state.loading = false;
		}
	}

	async login(email: string, password: string): Promise<{ error?: string; redirectTo?: string }> {
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password }),
				credentials: 'include'
			});

			const data = (await res.json()) as { error?: string; redirectTo?: string };

			if (!res.ok) {
				return { error: data.error || 'Login failed' };
			}

			await this.fetch();
			return { redirectTo: data.redirectTo };
		} catch (err) {
			console.error('Login error:', err);
			return { error: 'Network error' };
		}
	}

	async devLogin(): Promise<{ error?: string; redirectTo?: string }> {
		try {
			const res = await fetch('/api/auth/dev-login', {
				method: 'POST',
				credentials: 'include'
			});

			const data = (await res.json()) as { error?: string; redirectTo?: string };

			if (!res.ok) {
				return { error: data.error || 'Dev login failed' };
			}

			await this.fetch();
			return { redirectTo: data.redirectTo };
		} catch (err) {
			console.error('Dev login error:', err);
			return { error: 'Network error' };
		}
	}

	async register(
		name: string,
		email: string,
		password: string,
		orgName: string
	): Promise<{ error?: string; code?: string; retryAfter?: number }> {
		try {
			const res = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, email, password, orgName }),
				credentials: 'include'
			});

			const data = (await res.json()) as { error?: string };

			if (!res.ok) {
				const status = res.status;
				const errorMsg = data.error || 'Registration failed';

				// Handle specific status codes
				if (status === 409) {
					return { error: data.error || 'Email already registered', code: 'EMAIL_EXISTS' };
				}

				if (status === 429) {
					const retryAfterHeader = res.headers.get('Retry-After');
					return {
						error: data.error || 'Too many requests',
						code: 'RATE_LIMITED',
						retryAfter: parseInt(retryAfterHeader || '60')
					};
				}

				if (status === 400) {
					const lowerError = errorMsg.toLowerCase();
					if (lowerError.includes('email')) {
						return { error: errorMsg, code: 'VALIDATION_FAILED_EMAIL' };
					}
					if (lowerError.includes('password')) {
						return { error: errorMsg, code: 'VALIDATION_FAILED_PASSWORD' };
					}
					if (lowerError.includes('name') && !lowerError.includes('org')) {
						return { error: errorMsg, code: 'VALIDATION_FAILED_NAME' };
					}
					if (lowerError.includes('organization') || lowerError.includes('orgname')) {
						return { error: errorMsg, code: 'VALIDATION_FAILED_ORG' };
					}
				}

				return { error: errorMsg };
			}

			await this.fetch();
			return {};
		} catch (err) {
			console.error('Register error:', err);
			return { error: 'Network error' };
		}
	}

	async logout(): Promise<void> {
		try {
			await fetch('/api/auth/logout', {
				method: 'POST',
				credentials: 'include'
			});
		} catch (err) {
			console.error('Logout error:', err);
		} finally {
			this.#state.user = null;
			this.#state.org = null;
		}
	}

	clear() {
		this.#state.user = null;
		this.#state.org = null;
		this.#state.loading = false;
	}
}

export const authStore = new AuthStore();
