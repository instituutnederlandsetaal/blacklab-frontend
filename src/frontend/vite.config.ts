import { fileURLToPath } from 'node:url';
/// <reference types="vitest/config" />
import path from 'path';

import vue from '@vitejs/plugin-vue';
import { defineConfig, type UserConfigFnPromise, type PluginOption } from 'vite';
import type { TestProjectConfiguration } from 'vitest/config';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

const createConfigAsync: UserConfigFnPromise = async ({ command }) => {
	const vitePort = Number(process.env.BLF_VITE_PORT || process.env.PORT || 5173);
	const frontendProxyTarget = process.env.BLF_FRONTEND_PROXY_TARGET || 'http://localhost:8080';
	const blacklabProxyTarget = process.env.BLF_BLACKLAB_PROXY_TARGET || 'http://localhost:8080';
	const plugins: PluginOption[] = [vue()];
	if (command === 'serve' && !process.env.VITEST) {
		const { default: checker } = await import('vite-plugin-checker');
		plugins.unshift(
			checker({
				vueTsc: {
					root: dirname,
					tsconfigPath: 'tsconfig.app.json', // relative to root prop above
				},
				oxlint: {
					lintCommand: 'oxlint --config oxlint.config.mts ./src/',
				},
			}),
		);
	}

	const testProjects: TestProjectConfiguration[] = [
		{
			extends: true,
			test: {
				name: 'unit',
				include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
				setupFiles: ['./test/setup.ts'],
			},
		},
	];

	if (process.env.VITEST) {
		const [{ storybookTest }, { playwright }] = await Promise.all([import('@storybook/addon-vitest/vitest-plugin'), import('@vitest/browser-playwright')]);
		testProjects.push({
			extends: true,
			plugins: [
				// The plugin will run tests for the stories defined in your Storybook config
				// See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
				storybookTest({
					configDir: path.join(dirname, '.storybook'),
				}),
			],
			test: {
				name: 'storybook',
				setupFiles: ['./.storybook/vitest.setup.ts'],
				browser: {
					enabled: true,
					headless: true,
					provider: playwright({}),
					instances: [
						{
							browser: 'chromium',
						},
					],
				},
			},
		});
	}

	return {
		plugins,
		resolve: {
			alias: {
				// allow importing from 'src' using '@/...' instead of relative paths
				'@': path.resolve(dirname, 'src'),
				'@assets': path.resolve(dirname, 'assets'),
				'@test': path.resolve(dirname, 'test'),
			},
			dedupe: ['vue', 'vuex', 'jquery'],
		},
		optimizeDeps: {
			include: ['jquery', 'bootstrap'],
		},
		define: {
			__VUE_PROD_DEVTOOLS__: false, // can enable for debugging prod builds, but larger bundle size
		},
		css: {
			devSourcemap: true,
		},
		server: {
			host: '0.0.0.0',
			port: vitePort,
			// Ensure CSS url(...) assets resolve against the Vite dev server even when
			// styles are consumed from another origin (e.g. Java backend on a different port).
			origin: `http://localhost:${vitePort}`,
			strictPort: true,
			cors: true,
			headers: {
				'Access-Control-Allow-Origin': '*',
			},
			proxy: {
				'/blacklab-server': blacklabProxyTarget,
				'/blacklab-frontend': frontendProxyTarget,
			},
		},
		build: {
			outDir: 'dist',
			emptyOutDir: true,
			sourcemap: true,
			target: 'esnext',
			assetsDir: 'assets',
			rolldownOptions: {
				transform: {
					inject: {
						$: 'jquery',
						jQuery: 'jquery',
					},
				},
				input: {
					main: path.resolve(dirname, 'src/app/entrypoint/main.ts'),
					callback: path.resolve(dirname, 'src/app/entrypoint/callback.ts'),
				},
				output: {
					entryFileNames: '[name].js',
					chunkFileNames: 'assets/[name]-[hash].js',
					assetFileNames: 'assets/[name]-[hash][extname]',
				},
			},
		},
		test: {
			coverage: {
				provider: 'v8', // or 'istanbul'
				exclude: ['**/*.stories.*', '**/.storybook/**', '**/*.json', '**/*.json?*'],
			},
			projects: testProjects,
		},
	};
};

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig(createConfigAsync);
