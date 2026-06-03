import { browser } from '$app/environment';

const STORAGE_KEY = 'nav-collapsed';

function createNavCollapsedStore() {
	let collapsed = $state(browser ? localStorage.getItem(STORAGE_KEY) === 'true' : false);

	return {
		get collapsed() {
			return collapsed;
		},
		toggle() {
			collapsed = !collapsed;
			if (browser) {
				localStorage.setItem(STORAGE_KEY, String(collapsed));
			}
		}
	};
}

export const navCollapsedStore = createNavCollapsedStore();
