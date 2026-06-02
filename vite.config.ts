import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import yaml from '@rollup/plugin-yaml';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			'layerchart/dist/states/chart.svelte.js': path.resolve(
				root,
				'patches/layerchart-chart.svelte.js'
			)
		}
	},
	plugins: [
		yaml(),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Paverate',
				short_name: 'Paverate',
				description: 'In-field asphalt paving calculators for spread rate, tack, tonnage and more.',
				lang: 'en',
				theme_color: '#2e3b46',
				background_color: '#1b2228',
				display: 'standalone',
				orientation: 'portrait',
				start_url: '/',
				scope: '/',
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/icons/icon-512-maskable.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			}
		})
	]
});
