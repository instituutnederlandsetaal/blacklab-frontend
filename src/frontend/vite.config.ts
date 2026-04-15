import inject from '@rollup/plugin-inject';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import path from 'path';
import { defineConfig, type UserConfig } from 'vite';
import checker from 'vite-plugin-checker';

export default defineConfig(({ mode }): UserConfig => ({
  plugins: [
    checker({
      vueTsc: {
        root: __dirname,
        tsconfigPath: 'tsconfig.app.json', // relative to root prop above
      },
      oxlint: {
        lintCommand: 'oxlint --config oxlint.config.ts --tsconfig tsconfig.app.json .',
      }
    }),
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
            COMPILER_V_BIND_OBJECT_ORDER: false,
          },
        },
      },
    }),
    vueJsx(),
  ],
  resolve: {
    alias: {
      // allow importing from 'src' using '@/...' instead of relative paths
      '@': path.resolve(__dirname, 'src'),
      // temporary vue compat mode
      vue: '@vue/compat',
    },
    dedupe: ['vue', 'vuex', 'jquery'],
  },
  optimizeDeps: {
    include: ['jquery', 'bootstrap'],
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
