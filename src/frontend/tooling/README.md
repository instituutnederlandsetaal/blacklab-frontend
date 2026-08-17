# Frontend tooling

Non-Vite build, lint, smoke-test, and manual-test support lives here.

- `*.config.mts` and `knip.json` are the shared tooling configuration.
- `lint.mjs` runs the type, lint, Knip, and abstraction checks.
- `url-sync-smoke.mjs` is the Docker/Playwright smoke test.
- `customization-api/` contains the test fixtures for the published customization API type definitions.
- `compile-schema.js` generates the schema files in `../assets/`.
- `compare-locale-bundles.py` checks locale completeness and source usage (`python3 tooling/compare-locale-bundles.py`).

The Vite/Vitest configuration remains `../vite.config.ts`. Package scripts and the workspace VS Code settings point explicitly at the configs here so editor tooling can find them.
