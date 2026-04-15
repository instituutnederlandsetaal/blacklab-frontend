
import { defineConfig } from "oxlint";

export default defineConfig({
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
      varsIgnorePattern: "^_.*" // allow unused vars if they start with underscore, e.g. _unused
    }], 
    "typescript/await-thenable": "off",
    "eslint/no-async-promise-executor": "off",
    "eslint/no-debugger": "off",
    "typescript/restrict-template-expressions": ["error", {
      allowArray: true,
    }]
  },
  settings: {
  },
  env: {
    builtin: true,
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
  
});
