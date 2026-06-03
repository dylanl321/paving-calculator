import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},
	// Silence the high-volume a11y warnings during compile so they don't flood the
	// (1000-line capped) Cloudflare Pages build log and bury real build errors.
	onwarn: (warning, handler) => {
		if (warning.code?.startsWith('a11y')) return;
		handler(warning);
	},
	kit: { adapter: adapter() }
};

export default config;
