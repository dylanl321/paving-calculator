// Unit system preference store for imperial/metric toggle.
// Persisted to localStorage so the user's choice is remembered.
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
	}

	#save() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, this.#system);
		} catch {
			// ignore quota / private-mode errors
		}
	}
}

export const unitsStore = new Units();
