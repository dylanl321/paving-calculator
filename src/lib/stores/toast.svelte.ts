// Toast notifications as a Svelte 5 rune store (replaces the legacy writable
// store so all app state uses the same runes pattern).

export interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
	duration: number;
}

function createToastStore() {
	let toasts = $state<Toast[]>([]);

	function showToast(message: string, type: Toast['type'] = 'success', duration = 4000) {
		const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
		toasts = [...toasts, { id, message, type, duration }];

		if (duration > 0) {
			setTimeout(() => dismiss(id), duration);
		}
		return id;
	}

	function dismiss(id: string) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	return {
		get toasts() {
			return toasts;
		},
		showToast,
		success: (message: string, duration?: number) => showToast(message, 'success', duration),
		error: (message: string, duration?: number) => showToast(message, 'error', duration),
		info: (message: string, duration?: number) => showToast(message, 'info', duration),
		dismiss
	};
}

export const toastStore = createToastStore();
