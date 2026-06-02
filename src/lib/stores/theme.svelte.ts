// Theme preference store for light/dark/sunlight mode toggle.
// Persisted to localStorage so the user's choice is remembered.
const STORAGE_KEY = 'paverate.theme.v2';

type ThemeMode = 'dark' | 'light' | 'sunlight';

function loadTheme(): ThemeMode {
	if (typeof localStorage === 'undefined') return 'dark';
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'light') return 'light';
		if (saved === 'sunlight') return 'sunlight';
		return 'dark';
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
		if (this.#mode === 'dark') {
			this.mode = 'light';
		} else if (this.#mode === 'light') {
			this.mode = 'sunlight';
		} else {
			this.mode = 'dark';
		}
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
