# Customization API boundaries

- [`external/`](./external/) is the browser-facing API for corpus customization scripts.
  - `external-api.ts` defines the public typed contract and is the declaration-package entry point.
  - `browser-api.ts` implements the `window.frontend` facade.
  - `legacy.ts` implements the legacy callback API.
  - `search-form-configuration-api.ts` and `search-form-customization-api.ts` construct the public callback API objects and adapt their calls to application data.
  - `search-form-legacy-adapter.ts` translates legacy form settings through the modern configuration contract.
- [`internal/`](./internal/) is the frontend-facing customization API.
  - `internal-api.ts` owns `useCustomizations()`, invokes registered callbacks through the external adapters, and resolves their output for application consumers.
- [`shared/`](./shared/) contains form contracts and helpers used by both form construction and external callback adapters.
- Standard search-form construction lives with the search feature in `features/search/model/form/search-form-system.ts` and consumes the internal customization API.
- [`registry.ts`](./registry.ts) is the boundary between external registrations and internal behavior resolution.

External scripts must only consume the package generated from `external/external-api.ts`. Nothing from `internal/` or `registry.ts` is a stable client API.
