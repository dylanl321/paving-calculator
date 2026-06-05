/**
 * recentTools - tracks the last 3 used calculator tool IDs in localStorage.
 * Key: paverate_recent_tools  (JSON array of strings, most-recent first)
 */

const STORAGE_KEY = 'paverate_recent_tools';
const MAX_RECENT = 3;

function loadFromStorage(): string[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
		return [];
	} catch {
		return [];
	}
}

function saveToStorage(ids: string[]): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
	} catch {
		// storage full or private mode - fail silently
	}
}

function createRecentToolsStore() {
	let ids = $state<string[]>([]);

	/** Must be called from a browser context (e.g. inside $effect or onMount) */
	function init() {
		ids = loadFromStorage();
	}

	function addTool(id: string) {
		// Remove if already present, then prepend, then cap at MAX_RECENT
		const next = [id, ...ids.filter((x) => x !== id)].slice(0, MAX_RECENT);
		ids = next;
		saveToStorage(next);
	}

	return {
		get ids() {
			return ids;
		},
		init,
		addTool
	};
}

export const recentTools = createRecentToolsStore();
