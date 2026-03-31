import path from 'path';
import { defineConfig, type UserConfig } from 'vite';
import inject from '@rollup/plugin-inject';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';

export default defineConfig(({ mode }): UserConfig => ({
	plugins: [
		inject({
			$: 'jquery',
			jQuery: 'jquery',
			include: ['**/*.js', '**/*.mjs', '**/*.cjs'],
			exclude: ['**/*.vue'],
		}),
		vue({
			template: {
				compilerOptions: {
					compatConfig: {
						MODE: 2,
					},
				},
			},
		}),
		vueJsx(),
	],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
			vue: '@vue/compat',
			vuex: path.resolve(__dirname, 'node_modules/vuex/dist/vuex.esm-bundler.js'),
			'vuex-typex/node_modules/vuex': path.resolve(__dirname, 'node_modules/vuex/dist/vuex.esm-bundler.js'),
		},
		dedupe: ['vue', 'vuex', 'jquery'],
	},
	optimizeDeps: {
		include: ['vuex-typex', 'vuex', 'jquery', 'bootstrap'],
	},
	define: {
		'process.env.NODE_ENV': JSON.stringify(mode),
		__VUE_OPTIONS_API__: true,
		__VUE_PROD_DEVTOOLS__: false,
		__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
	},
	server: {
		host: '0.0.0.0',
		port: 5173,
		strictPort: true,
		cors: true,
		headers: {
			'Access-Control-Allow-Origin': '*',
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
				main: path.resolve(__dirname, 'src/main.tsx'),
				callback: path.resolve(__dirname, 'src/callback.ts'),
			},
			output: {
				entryFileNames: '[name].js',
				chunkFileNames: 'assets/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash][extname]',
			},
		},
	},
}));
