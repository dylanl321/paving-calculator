import type { SaveStatus } from '$lib/components/AutoSaveIndicator.svelte';

/**
 * createAutoSave — composable for debounced auto-save with status tracking.
 *
 * Usage:
 *   const saver = createAutoSave((data) => fetch('/api/...', { method: 'PUT', body: JSON.stringify(data) }));
 *   // In template: <AutoSaveIndicator status={saver.status} onRetry={saver.retry} />
 *   // On change: saver.schedule(myData);
 */
export function createAutoSave<T>(
	saveFn: (data: T) => Promise<Response | void>,
	options: { debounceMs?: number } = {}
) {
	const debounceMs = options.debounceMs ?? 800;

	let status = $state<SaveStatus>('idle');
	let timer: ReturnType<typeof setTimeout> | null = null;
	let lastData: T | undefined = undefined;
	let lastError = $state('Failed to save');

	async function execute(data: T) {
		status = 'saving';
		try {
			const result = await saveFn(data);
			if (result instanceof Response && !result.ok) {
				throw new Error(`HTTP ${result.status}`);
			}
			status = 'saved';
			// Fade back to idle after 2.5 seconds
			setTimeout(() => {
				if (status === 'saved') status = 'idle';
			}, 2500);
		} catch (err) {
			lastError = err instanceof Error ? err.message : 'Failed to save';
			status = 'error';
		}
	}

	function schedule(data: T) {
		lastData = data;
		if (timer) clearTimeout(timer);
		// Show saving immediately to avoid lag perception
		if (status !== 'saving') status = 'saving';
		timer = setTimeout(() => {
			execute(data);
		}, debounceMs);
	}

	function retry() {
		if (lastData !== undefined) {
			execute(lastData);
		}
	}

	return {
		get status() { return status; },
		get errorMessage() { return lastError; },
		schedule,
		retry,
		/** Fire immediately, skip debounce (e.g. for button-triggered saves). */
		flush(data?: T) {
			if (timer) { clearTimeout(timer); timer = null; }
			execute(data ?? lastData as T);
		}
	};
}
