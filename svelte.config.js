import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},
	// Silence high-volume non-fatal compile warnings so they don't flood the
	// (1000-line capped) Cloudflare Pages build log and bury real build errors.
	onwarn: (warning, handler) => {
		const noisy = ['a11y', 'css_unused_selector', 'state_referenced_locally', 'element_invalid_self_closing_tag'];
		if (noisy.some((code) => warning.code?.startsWith(code))) return;
		handler(warning);
	},
	kit: { adapter: adapter() }
};

export default config;
