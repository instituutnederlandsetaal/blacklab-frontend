
import { defineConfig } from "oxlint";

export default defineConfig({
  $schema: "./node_modules/oxlint/configuration_schema.json",
  plugins: ["typescript", "oxc", "vue", "vitest"],
  categories: {
    correctness: "error",
  },
  rules: {
    "typescript/consistent-type-imports": ["error", {
      fixStyle: "inline-type-imports",
      prefer: "type-imports",
    }],
    "typescript/consistent-type-exports": "error",
    "eslint/no-unused-vars": ["warn", {
      args: "none",
      varsIgnorePattern: "^_.*"
    }]
  },
  settings: {},
  env: {
    builtin: true,
  },
  options: {
    typeAware: true,
    typeCheck: true,
  }
});
