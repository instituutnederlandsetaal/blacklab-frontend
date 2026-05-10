import path from 'path';

import inject from '@rollup/plugin-inject';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { defineConfig, type UserConfig } from 'vite';
import checker from 'vite-plugin-checker';

export default defineConfig(
	({ mode }): UserConfig => ({
		plugins: [
			checker({
				vueTsc: {
					root: __dirname,
					tsconfigPath: 'tsconfig.app.json', // relative to root prop above
				},
				// oxlint: {
				// 	lintCommand: 'oxlint --config oxlint.config.ts --tsconfig tsconfig.app.json ./src/_new/',
				// },
			}),
			inject({
				$: 'jquery',
				jQuery: 'jquery',
				include: ['**/*.js', '**/*.mjs', '**/*.cjs'],
				exclude: ['**/*.vue'],
			}),
			vue(),
			vueJsx(),
		],
		resolve: {
			alias: {
				// allow importing from 'src' using '@/...' instead of relative paths
				'@': path.resolve(__dirname, 'src'),
				'@assets': path.resolve(__dirname, 'assets'),
			},
			dedupe: ['vue', 'vuex', 'jquery'],
		},
		optimizeDeps: {
			include: ['jquery', 'bootstrap'],
		},
		define: {
			'process.env.NODE_ENV': JSON.stringify(mode),
			__VUE_PROD_DEVTOOLS__: false, // can enable for debugging prod builds, but larger bundle size
		},
		server: {
			host: '0.0.0.0',
			port: 5173,
			// Ensure CSS url(...) assets resolve against the Vite dev server even when
			// styles are consumed from another origin (e.g. Java backend on a different port).
			origin: process.env.VITE_DEV_SERVER_ORIGIN ?? 'http://localhost:5173',
			strictPort: true,
			cors: true,
			headers: {
				'Access-Control-Allow-Origin': '*',
			},
			proxy: {
				'/blacklab-server': 'http://localhost:8080',
				'/blacklab-frontend': 'http://localhost:8080',
			},
		},
		build: {
			outDir: 'dist',
			emptyOutDir: true,
			sourcemap: true,
			target: 'esnext',
			assetsDir: 'assets',
			rollupOptions: {
				input: {
					main: path.resolve(__dirname, 'src/_new/app/entrypoint/main.ts'),
					callback: path.resolve(__dirname, 'src/_new/app/entrypoint/callback.ts'),
				},
				output: {
					entryFileNames: '[name].js',
					chunkFileNames: 'assets/[name]-[hash].js',
					assetFileNames: 'assets/[name]-[hash][extname]',
				},
			},
		},
	}),
);
