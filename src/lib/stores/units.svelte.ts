// Unit system preference store for imperial/metric toggle.
// Persisted to localStorage so the user's choice is remembered across sessions.
// If authenticated, also synced to the server (server pref wins on login).
const STORAGE_KEY = 'paverate.units.v1';

type UnitSystem = 'imperial' | 'metric';

function loadUnits(): UnitSystem {
	if (typeof localStorage === 'undefined') return 'imperial';
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		return saved === 'metric' ? 'metric' : 'imperial';
	} catch {
		return 'imperial';
	}
}

class Units {
	#system = $state<UnitSystem>('imperial');

	constructor() {
		if (typeof localStorage !== 'undefined') {
			this.#system = loadUnits();
		}
	}

	get system() {
		return this.#system;
	}

	set system(v: UnitSystem) {
		this.#system = v;
		this.#save();
		this.#syncToServer(v);
	}

	/**
	 * Apply a server-side preference (server wins over localStorage on login).
	 * Does not trigger a server sync.
	 */
	applyServerPref(units: string) {
		if (units === 'imperial' || units === 'metric') {
			this.#system = units;
			try {
				if (typeof localStorage !== 'undefined') {
					localStorage.setItem(STORAGE_KEY, units);
				}
			} catch {
				// ignore quota / private-mode errors
			}
		}
	}

	#save() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, this.#system);
		} catch {
			// ignore quota / private-mode errors
		}
	}

	#syncToServer(units: UnitSystem) {
		if (typeof fetch === 'undefined') return;
		void fetch('/api/user/preferred-view', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ units }),
			credentials: 'include'
		}).catch(() => {
			// Fire-and-forget: silently ignore errors (unauthenticated users, network issues)
		});
	}
}

export const unitsStore = new Units();
