import { defineConfig, defineProject } from 'vitest/config';
import yaml from '@rollup/plugin-yaml';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			reportsDirectory: './coverage',
			// Coverage is measured for the lib logic the suites target. The UI/route
			// layer is excluded (components have their own suite); counting it as 0%
			// would make the global number meaningless.
			include: [
				'src/lib/calc/**/*.ts',
				'src/lib/config/**/*.ts',
				'src/lib/server/**/*.ts',
				'src/lib/services/**/*.ts',
				'src/lib/utils/**/*.ts'
			],
			exclude: [
				'src/lib/**/__tests__/**',
				'src/lib/**/*.d.ts',
				'node_modules',
				'src/lib/components/__tests__/**'
			],
			// Default threshold (components floor — 50%).
			// CI jobs override per-project:
			//   unit        -> 80 lines/branches/functions/statements
			//   integration -> 60 lines/branches/functions/statements
			//   components  -> 50 lines/branches/functions/statements
			thresholds: {
				lines: 50,
				branches: 50,
				functions: 50,
				statements: 50
			}
		},
		projects: [
			// Unit tests: pure logic in src/lib (excluding components)
			defineProject({
				plugins: [yaml() as any],
				resolve: {
					alias: {
						'$lib': new URL('./src/lib', import.meta.url).pathname,
						'$app/environment': new URL('./tests/mocks/app-environment.ts', import.meta.url).pathname
					}
				},
				test: {
					name: 'unit',
					include: ['src/lib/**/__tests__/**/*.test.ts'],
					exclude: ['src/lib/components/__tests__/**/*.test.ts'],
					environment: 'node',
					globals: false,
					server: {
						deps: {
							inline: ['better-sqlite3']
						}
					}
				}
			}),
			// Integration tests: server routes with better-sqlite3 D1 shim
			defineProject({
				plugins: [yaml() as any],
				test: {
					name: 'integration',
					include: ['**/*.integration.test.ts'],
					environment: 'node',
					globals: false,
					setupFiles: ['tests/setup-d1.ts']
				},
				resolve: {
					alias: {
						'$lib': new URL('./src/lib', import.meta.url).pathname,
						'$app/environment': new URL('./tests/mocks/app-environment.ts', import.meta.url).pathname
					}
				},
				server: {
					deps: {
						inline: ['better-sqlite3']
					}
				}
			}),
			// Component tests: Svelte components with jsdom
			defineProject({
				plugins: [yaml() as any, svelte()],
				test: {
					name: 'components',
					include: ['src/lib/components/__tests__/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
					setupFiles: ['tests/setup-dom.ts']
				},
				resolve: {
					alias: {
						'$app/navigation': new URL('./src/lib/components/__tests__/mocks/app-navigation.ts', import.meta.url).pathname,
						'$app/stores': new URL('./src/lib/components/__tests__/mocks/app-stores.ts', import.meta.url).pathname,
						'$lib': new URL('./src/lib', import.meta.url).pathname
					},
					conditions: ['browser']
				}
			})
		]
	}
});
