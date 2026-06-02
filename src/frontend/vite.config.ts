import { fileURLToPath } from "node:url";
/// <reference types="vitest/config" />
import path from "path";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [
    ...(process.env.VITEST
      ? []
      : [
          checker({
            vueTsc: {
              root: dirname,
              tsconfigPath: "tsconfig.app.json", // relative to root prop above
            },
            oxlint: {
              lintCommand: "oxlint --config oxlint.config.mts  ./src/",
            },
          }),
        ]),
    vue(),
  ],
  resolve: {
    alias: {
      // allow importing from 'src' using '@/...' instead of relative paths
      "@": path.resolve(dirname, "src"),
      "@assets": path.resolve(dirname, "assets"),
      "@test": path.resolve(dirname, "test"),
    },
    dedupe: ["vue", "vuex", "jquery"],
  },
  optimizeDeps: {
    include: ["jquery", "bootstrap"],
  },
  define: {
    __VUE_PROD_DEVTOOLS__: false, // can enable for debugging prod builds, but larger bundle size
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Ensure CSS url(...) assets resolve against the Vite dev server even when
    // styles are consumed from another origin (e.g. Java backend on a different port).
    origin: "http://localhost:5173",
    strictPort: true,
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    proxy: {
      "/blacklab-server": "http://localhost:8080",
      "/blacklab-frontend": "http://localhost:8080",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "esnext",
    assetsDir: "assets",
    rolldownOptions: {
      transform: {
        inject: {
          $: "jquery",
          jQuery: "jquery",
        },
      },
      input: {
        main: path.resolve(dirname, "src/app/entrypoint/main.ts"),
        callback: path.resolve(dirname, "src/app/entrypoint/callback.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  // test: {
  // 	// Use `workspace` field in Vitest < 3.2
  // 	projects: [
  // 		{
  // 			extends: true,
  // 			plugins: [
  // 				storybookTest({
  // 					// The location of your Storybook config, main.js|ts
  // 					configDir: path.join(dirname, '.storybook'),
  // 					// This should match your package.json script to run Storybook
  // 					// The --no-open flag will skip the automatic opening of a browser
  // 					storybookScript: 'yarn storybook --no-open',
  // 				}),
  // 			],
  // 			test: {
  // 				name: 'storybook',
  // 				// Enable browser mode
  // 				browser: {
  // 					enabled: true,
  // 					// Make sure to install Playwright
  // 					provider: playwright({}),
  // 					headless: true,
  // 					instances: [{ browser: 'chromium' }],
  // 				},
  // 				setupFiles: ['./.storybook/vitest.setup.ts'],
  // 			},
  // 		},
  // 	],
  // 	onConsoleLog(log, type) {
  // 		return true;
  // 	},
  // },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
          setupFiles: ["./test/setup.ts"],
        },
      },
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: "chromium",
              },
            ],
          },
        },
      },
    ],
  },
});
