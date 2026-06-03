// Calculation history log — persists the last 20 calc results across page loads.
// Uses Svelte 5 runes (class pattern, same as calcContext.svelte.ts).

const STORAGE_KEY = 'paverate.calcHistory.v1';
const MAX_ENTRIES = 20;

export interface CalcHistoryEntry {
	id: string;
	toolId: string;
	toolLabel: string;
	result: string;
	summary: string;
	timestamp: number;
}

function loadEntries(): CalcHistoryEntry[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed as CalcHistoryEntry[];
	} catch {
		return [];
	}
}

class CalcHistory {
	#entries = $state<CalcHistoryEntry[]>([]);

	constructor() {
		if (typeof localStorage !== 'undefined') {
			this.#entries = loadEntries();
		}
	}

	get entries(): CalcHistoryEntry[] {
		return this.#entries;
	}

	add(entry: Omit<CalcHistoryEntry, 'id' | 'timestamp'>): void {
		const newEntry: CalcHistoryEntry = {
			...entry,
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			timestamp: Date.now()
		};
		this.#entries = [newEntry, ...this.#entries].slice(0, MAX_ENTRIES);
		this.#save();
	}

	clear(): void {
		this.#entries = [];
		this.#save();
	}

	#save(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#entries));
		} catch {
			// ignore quota errors
		}
	}
}

export const calcHistory = new CalcHistory();
