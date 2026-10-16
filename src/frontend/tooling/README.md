# Frontend tooling

Non-Vite build, lint, smoke-test, and manual-test support lives here.

- `*.config.ts` and `knip.json` are the shared tooling configuration.
- `lint.js` runs the type, lint, locale, Knip, and abstraction checks.
- `url-sync-smoke.js` is the Docker/Playwright smoke test.
- `check-bundle-boundaries.js` builds and checks production dependency boundaries with `npm run test:bundles`. It is silent on success; add `-- --report` to see JavaScript request counts and sizes for each page.
- `vite.callback.config.js` builds the OIDC callback independently so auth is included in the application's common bundle and the callback remains standalone. `npm run build` runs both builds.
- `customization-api/` contains the test fixtures for the published customization API type definitions.
- `compile-schema.js` generates the schema files in `../assets/`.
- `compare-locale-bundles.js` checks locale completeness and source usage as part of `npm run lint` (or directly with `node tooling/compare-locale-bundles.js`).

The Vite/Vitest configuration remains `../vite.config.ts`. Package scripts and the workspace VS Code settings point explicitly at the configs here so editor tooling can find them.
