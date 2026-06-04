import { defineConfig } from 'vitest/config';
import yaml from '@rollup/plugin-yaml';

export default defineConfig({
	plugins: [yaml() as any],
	test: {
		include: ['src/**/__tests__/**/*.test.ts'],
		environment: 'node',
		globals: false
	}
});
