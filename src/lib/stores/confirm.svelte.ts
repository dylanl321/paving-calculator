interface ConfirmOptions {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
}

class ConfirmStore {
	open = $state(false);
	title = $state('');
	message = $state('');
	confirmLabel = $state('Confirm');
	cancelLabel = $state('Cancel');
	destructive = $state(false);

	private resolver: ((value: boolean) => void) | null = null;

	ask(options: ConfirmOptions): Promise<boolean> {
		this.title = options.title;
		this.message = options.message;
		this.confirmLabel = options.confirmLabel ?? 'Confirm';
		this.cancelLabel = options.cancelLabel ?? 'Cancel';
		this.destructive = options.destructive ?? false;
		this.open = true;

		return new Promise<boolean>((resolve) => {
			this.resolver = resolve;
		});
	}

	confirm() {
		this.open = false;
		if (this.resolver) {
			this.resolver(true);
			this.resolver = null;
		}
	}

	cancel() {
		this.open = false;
		if (this.resolver) {
			this.resolver(false);
			this.resolver = null;
		}
	}
}

export const confirmStore = new ConfirmStore();
