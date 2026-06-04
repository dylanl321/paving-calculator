import { defineConfig, defineProject } from 'vitest/config';
import yaml from '@rollup/plugin-yaml';

export default defineConfig({
	test: {
		projects: [
			// Unit tests: pure logic in src/lib (excluding components)
			defineProject({
				plugins: [yaml() as any],
				test: {
					name: 'unit',
					include: ['src/lib/**/__tests__/**/*.test.ts'],
					exclude: ['src/lib/components/__tests__/**/*.test.ts'],
					environment: 'node',
					globals: false
				}
			}),
			// Integration tests: server routes with better-sqlite3 D1 shim
			defineProject({
				test: {
					name: 'integration',
					include: ['**/*.integration.test.ts'],
					environment: 'node',
					globals: false,
					setupFiles: ['tests/setup-d1.ts']
				}
			}),
			// Component tests: Svelte components with jsdom
			defineProject({
				plugins: [yaml() as any],
				test: {
					name: 'components',
					include: ['src/lib/components/__tests__/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
					setupFiles: ['tests/setup-dom.ts']
				}
			})
		]
	}
});
