import { writable } from 'svelte/store';

export interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
	duration: number;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	function showToast(message: string, type: Toast['type'] = 'success', duration = 4000) {
		const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const toast: Toast = { id, message, type, duration };

		update((toasts) => [...toasts, toast]);

		// Auto-dismiss after duration
		if (duration > 0) {
			setTimeout(() => {
				dismiss(id);
			}, duration);
		}

		return id;
	}

	function dismiss(id: string) {
		update((toasts) => toasts.filter((t) => t.id !== id));
	}

	return {
		subscribe,
		showToast,
		success: (message: string, duration?: number) => showToast(message, 'success', duration),
		error: (message: string, duration?: number) => showToast(message, 'error', duration),
		info: (message: string, duration?: number) => showToast(message, 'info', duration),
		dismiss
	};
}

export const toastStore = createToastStore();
