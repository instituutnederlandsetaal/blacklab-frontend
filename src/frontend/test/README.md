# Unit tests

Run all suites with `npm run test:unit`, or `npm run test:unit:coverage` for coverage. Pass a path after `--` to select files, for example `npm run test:unit -- test/form`.

Most suites run in the `unit-shared` project using VM workers. Files can share modules and DOM environments when Vitest batches them, so create fresh fixtures and dispose effects, timers, listeners and global stubs in each suite. The shared setup unmounts Vue wrappers and empties the document body after each test; individual suites do not need to call `enableAutoUnmount`.

Suites that replace modules with `vi.mock` or `vi.doMock` live under `test/isolated/` and run in the `unit-isolated` project with isolated thread workers. VM workers do not preserve module isolation when files are batched, even with `isolate: true`. Use this group for any suite that requires fresh module state. Keep the same functional subdirectories and use `@test/` for shared fixture imports.

For API client tests, pass `createMockHttp().adapter` from `@test/mocks/http` through the client's `axiosOptions`. It records outgoing requests and lets tests respond or cancel while the real serialization, interceptors and response handling run. Each fixture belongs to one client and needs no module replacement.

For components that consume APIs, create a fresh `createMockApi()` from `@test/mocks/api` in each test or `beforeEach`. Every BlackLab and frontend method is a stable typed mock with its own call history. Install the provider through the mount's `global.plugins`, then configure the calls needed by the test:

```ts
const api = createMockApi();
api.blacklabApi.getCorpora.mockReturnValue(resolvedRequest([]));
const wrapper = mount(Component, { global: { plugins: [api] } });
expect(api.blacklabApi.getCorpora).toHaveBeenCalledOnce();
```

Import `resolvedRequest` and `rejectedRequest` from the same helper to preserve the API's cancellation contract. Unconfigured methods reject with a diagnostic naming the method. The options form, such as `createMockApi({ blacklab: { getCorpora: [] } })`, also remains available.

For corpus consumers, install a fresh `createMockCorpusContext({ corpus, config })` from `@test/mocks/corpus`. Both inputs accept values, refs or getters, and omitted configuration fields receive fresh defaults. Tests that exercise loading or errors can supply a `loader` instead; the injected corpus and configuration follow that loader. Tests of corpus loading and normalization should use the real `createCorpusContext` with an API fixture.

For components that consume customizations, create a fresh `createMockCustomizations(corpus)` from `@test/mocks/customizations` in each test or `beforeEach`, then install it through the mount's `global.plugins`. Every method is a typed mock with its own call history; configure the behavior relevant to the test:

```ts
const customizations = createMockCustomizations(corpus);
customizations.resultDetailedMetadataIds.mockReturnValue(['title']);
const wrapper = mount(Component, { global: { plugins: [customizations] } });
```

Defaults supply empty collections, disabled optional features and unchanged option groups. `searchFormSimpleAnnotation` requires an explicit return value because it needs a corpus annotation. Tests of customization registration, configuration and callback behavior should use the real implementation.

To check that shared suites do not depend on file order, run `npx vitest run --project unit-shared --maxWorkers=1 --sequence.shuffle.files --sequence.seed=1729`.

Also run the DOM suites together so Vitest can batch files sharing the jsdom environment. In PowerShell:

```powershell
$domSuites = rg -l '@vitest-environment jsdom' test -g '*.test.ts' -g '!**/isolated/**'
npx vitest run --project unit-shared --maxWorkers=1 --sequence.shuffle.files --sequence.seed=2026 @domSuites
```
