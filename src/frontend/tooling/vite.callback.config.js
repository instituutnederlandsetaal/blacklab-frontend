import path from 'node:path';

import { defineConfig } from 'vite';

// Build separately so the callback stays standalone and auth can join the application's common bundle.
export default defineConfig({
	root: path.resolve(import.meta.dirname, '..'),
	base: './',
	build: {
		emptyOutDir: false,
		sourcemap: true,
		target: 'esnext',
		rolldownOptions: {
			input: { callback: path.resolve(import.meta.dirname, '../src/app/entrypoint/callback.ts') },
			output: { entryFileNames: '[name].js', codeSplitting: false },
		},
	},
});
