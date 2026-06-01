// Centralized store for collecting calculator states for PDF export.
// Each calculator can register its current state here.

interface CalculatorSnapshot {
	title: string;
	inputs: Array<{ label: string; value: string }>;
	formula?: string;
	result: { value: string; unit: string };
	notes?: string;
}

class CalculatorDataStore {
	#snapshots = $state<Map<string, CalculatorSnapshot>>(new Map());

	register(id: string, snapshot: CalculatorSnapshot) {
		this.#snapshots.set(id, snapshot);
	}

	getAll(): CalculatorSnapshot[] {
		return Array.from(this.#snapshots.values());
	}

	clear() {
		this.#snapshots.clear();
	}
}

export const calculatorData = new CalculatorDataStore();
