import path from 'path';

import type { storybookTest as StorybookTest } from '@storybook/addon-vitest/vitest-plugin';
import vue from '@vitejs/plugin-vue';
import type { playwright as Playwright } from '@vitest/browser-playwright';
import { defineConfig, type PluginOption, type UserConfigFnPromise } from 'vite';
import type checkerPlugin from 'vite-plugin-checker';
import type { TestProjectConfiguration } from 'vitest/config';

const dirname = import.meta.dirname;
const sourcePrefix = `${dirname.replaceAll('\\', '/')}/src/`;
const importDevelopmentDependency = <T>(name: string) => import(name) as Promise<T>;

const createConfigAsync: UserConfigFnPromise = async ({ command }) => {
	const vitePort = Number(process.env.BLF_VITE_PORT || process.env.PORT || 5173);
	const frontendProxyTarget = process.env.BLF_FRONTEND_PROXY_TARGET || 'http://localhost:8080';
	const blacklabProxyTarget = process.env.BLF_BLACKLAB_PROXY_TARGET || 'http://localhost:8080';
	const plugins: PluginOption[] = [vue()];
	if (command === 'serve' && !process.env.VITEST) {
		const { default: checker } = await importDevelopmentDependency<{ default: typeof checkerPlugin }>('vite-plugin-checker');
		plugins.unshift(
			checker({
				vueTsc: {
					root: dirname,
					tsconfigPath: 'tsconfig.app.json', // relative to root prop above
				},
				oxlint: {
					lintCommand: 'oxlint --config tooling/oxlint.config.ts ./src/',
				},
			}),
		);
	}

	const testProjects: TestProjectConfiguration[] = [
		{
			extends: true,
			test: {
				name: 'unit-shared',
				pool: 'vmThreads',
				// These suites clean up their fixtures and can share modules and DOM when batched.
				isolate: false,
				include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
				exclude: ['test/isolated/**'],
				setupFiles: ['./test/setup.ts'],
			},
		},
		{
			extends: true,
			test: {
				name: 'unit-isolated',
				// VM pools ignore isolate and can batch module mocks into the same context.
				pool: 'threads',
				isolate: true,
				include: ['test/isolated/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
				setupFiles: ['./test/setup.ts'],
			},
		},
	];

	if (process.env.VITEST) {
		const [{ storybookTest }, { playwright }] = await Promise.all([
			importDevelopmentDependency<{ storybookTest: typeof StorybookTest }>('@storybook/addon-vitest/vitest-plugin'),
			importDevelopmentDependency<{ playwright: typeof Playwright }>('@vitest/browser-playwright'),
		]);
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
		base: './',
		plugins,
		resolve: {
			alias: [
				// CommonJS consumers use the same runtime; the compiler remains an explicit lazy import.
				{ find: /^vue$/, replacement: 'vue/dist/vue.runtime.esm-bundler.js' },
				// allow importing from 'src' using '@/...' instead of relative paths
				{ find: '@', replacement: path.resolve(dirname, 'src') },
				{ find: '@assets', replacement: path.resolve(dirname, 'assets') },
				{ find: '@test', replacement: path.resolve(dirname, 'test') },
			],
			dedupe: ['vue', 'vuex', 'jquery'],
		},
		optimizeDeps: {
			include: ['jquery', 'bootstrap', 'monaco-yaml/yaml.worker.js'],
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
			origin: process.env.VITEST ? undefined : `http://localhost:${vitePort}`,
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
				},
				output: {
					// Merge common application modules and their dependencies, keeping lazy libraries separate.
					codeSplitting: { groups: [{ name: 'shared', test: id => id.startsWith(sourcePrefix), minShareCount: 2 }] },
					entryFileNames: '[name].js',
					chunkFileNames: chunk => `assets/${chunk.facadeModuleId?.match(/\/([^/]+)\/entrypoint\.ts$/)?.[1] ?? '[name]'}-[hash].js`,
					assetFileNames: asset => (asset.names.some(name => name === 'main.css' || name === 'shared.css') ? '[name][extname]' : 'assets/[name]-[hash][extname]'),
				},
			},
		},
		test: {
			vmMemoryLimit: '256MB',
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
