// DOT state selection store with localStorage persistence

type StateDot = 'AL' | 'TX' | 'GA' | 'FL';

const STATE_LABELS: Record<StateDot, string> = {
	AL: 'ALDOT',
	TX: 'TxDOT',
	GA: 'GDOT',
	FL: 'FDOT'
};

const STORAGE_KEY = 'paverate_dot_state';
const DEFAULT_STATE: StateDot = 'AL';

class DotStateStore {
	#state = $state<StateDot>(DEFAULT_STATE);
	#initialized = false;

	constructor() {
		// Load from localStorage on client
		if (typeof window !== 'undefined') {
			this.#loadFromStorage();
		}
	}

	#loadFromStorage() {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored && this.#isValidState(stored)) {
				this.#state = stored as StateDot;
			}
		} catch (err) {
			console.warn('Failed to load DOT state from localStorage:', err);
		}
		this.#initialized = true;
	}

	#isValidState(value: string): boolean {
		return ['AL', 'TX', 'GA', 'FL'].includes(value);
	}

	get selectedDotState(): StateDot {
		return this.#state;
	}

	get dotStateLabel(): string {
		return STATE_LABELS[this.#state];
	}

	setDotState(state: StateDot) {
		if (!this.#isValidState(state)) {
			console.warn(`Invalid DOT state: ${state}`);
			return;
		}

		this.#state = state;

		// Persist to localStorage
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem(STORAGE_KEY, state);
			} catch (err) {
				console.warn('Failed to persist DOT state to localStorage:', err);
			}
		}
	}
}

export const dotStateStore = new DotStateStore();
