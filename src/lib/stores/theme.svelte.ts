// Theme preference store for light/dark mode toggle.
// Persisted to localStorage so the user's choice is remembered.
const STORAGE_KEY = 'paverate.theme.v1';

type ThemeMode = 'dark' | 'light';

function loadTheme(): ThemeMode {
	if (typeof localStorage === 'undefined') return 'dark';
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		return saved === 'light' ? 'light' : 'dark';
	} catch {
		return 'dark';
	}
}

class Theme {
	#mode = $state<ThemeMode>('dark');

	constructor() {
		if (typeof localStorage !== 'undefined') {
			this.#mode = loadTheme();
		}
	}

	get mode() {
		return this.#mode;
	}

	set mode(v: ThemeMode) {
		this.#mode = v;
		this.#save();
	}

	toggle() {
		this.mode = this.#mode === 'dark' ? 'light' : 'dark';
	}

	#save() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, this.#mode);
		} catch {
			// ignore quota / private-mode errors
		}
	}
}

export const themeStore = new Theme();
