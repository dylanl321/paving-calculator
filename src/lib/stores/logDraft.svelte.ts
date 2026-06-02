// Shared "loggable result" channel between a calculator and the workspace's
// Log to Today action. Each calculator publishes its current result here; the
// stage's LogToToday button reads the draft for the active tool and commits it
// to the Today session. Decouples the one-tap bridge from each card's internals.
import type { EntryType } from './today.svelte';

export interface LogDraft {
	/** tool id this draft belongs to (must match the active tool to be loggable) */
	toolId: string;
	entryType: EntryType;
	/** human-readable summary shown on the button / confirmation */
	summary: string;
	fields: {
		station_start?: number | null;
		station_end?: number | null;
		distance_ft?: number | null;
		tons_placed?: number | null;
		loads_count?: number | null;
		spread_rate_actual?: number | null;
		tack_gallons?: number | null;
		lane?: string | null;
		notes?: string | null;
	};
}

class LogDraftStore {
	current = $state<LogDraft | null>(null);

	/** Publish the active calculator's loggable result (or null to clear). */
	set(draft: LogDraft | null) {
		this.current = draft;
	}

	clearFor(toolId: string) {
		if (this.current?.toolId === toolId) this.current = null;
	}
}

export const logDraft = new LogDraftStore();
