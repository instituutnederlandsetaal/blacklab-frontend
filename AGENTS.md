# Frontend agent guidance

These rules describe the intended frontend architecture. Some legacy code does not comply yet. When changing such code, avoid spreading the legacy pattern and move the touched boundary toward these rules where practical.

## Dependency boundaries

### Vue code may inject; ordinary TypeScript may not

- Vue components and composables called from component setup may obtain application services through `use*()`/`provide`/`inject`.
- Framework-neutral TypeScript must receive its dependencies explicitly through function arguments, constructor arguments, or setup options. This includes stores, builders, controllers, resources, resolvers, parsers, effects, and utilities.
- A helper being called by a component does not make hidden injection acceptable. Resolve the dependency in the component and pass it down.
- Do not add module-level “current corpus” state or similar implicit globals.
- Do not call `useCorpus()` or another injected accessor from ordinary TypeScript. Existing outside-injection fallbacks such as `installedCorpus` are temporary migration hacks, not patterns to reuse.
- When a singleton system needs another system, wire them together explicitly in `src/app/entrypoint/main.ts`. An imperative `init()` or setter is acceptable for legacy singleton stores when constructor-style setup is not currently practical.

### Prefer narrow dependencies

- Pass only the state a system needs. For example, a customization registry that needs the corpus receives `corpusState.corpus`, not the complete corpus context.
- Explicit reactive dependencies are allowed. APIs accepting reactive input should generally consume `MaybeRefOrGetter<T>` with `toValue()` so tests and non-reactive callers can pass plain values.
- Do not hide an explicit dependency behind a new injected getter merely to shorten call sites.

## Composition and corpus context

- `src/app/entrypoint/main.ts` is the composition root for application-wide singleton systems and their interdependencies.
- `CorpusContext` is materialized asynchronous data: normalized corpus data, page configuration, and tagset data. It must not own state created dynamically after publication.
- Keep this knowledge boundary intact:
  1. corpus/config/tagset are loaded and normalized;
  2. the context is published;
  3. the custom-JS system reacts by mounting scripts;
  4. scripts independently register customization callbacks.
- Do not move custom-script execution or customization registration upstream into corpus loading or normalization.
- `beforePublish` exists only as a legacy synchronization checkpoint: old singleton stores must receive the incoming corpus before consumers can observe a mixture of old context and old store state. Do not expand it into a general lifecycle/event system.
- Corpus changes are uncommon. Prefer a simple clean reset and reconstruction over complicated incremental reconciliation.

## Intended corpus/customization lifecycle

The intended order is:

1. Load corpus, page configuration, and tagset.
2. Normalize the loaded data.
3. Initialize/update legacy singleton stores.
4. Mount configured scripts.
5. Scripts register callbacks and may invoke legacy UI-state setters.
6. Form setup reads defaults from legacy UI state.
7. Form configuration callbacks run during or immediately before form construction.
8. Form graph customization callbacks run after graph construction.
9. Components invoke ongoing result/display callbacks where required.

Do not introduce ordering that requires customization scripts to exist before the corpus context is published.

## Customization registry

- `customization-api/registrations.ts` is a registry, not a customization resolution service.
- It may own registration collections, script-disposal bookkeeping, and the current per-corpus legacy customization target.
- It must not decide downstream defaults or invoke ongoing result/form behavior on behalf of consumers. Downstream systems read its exposed state and invoke callbacks explicitly.
- Components may obtain the registry with `useCustomizations()` and pass the relevant state to ordinary TypeScript helpers.
- Non-component singleton systems receive the registry, or a narrower registry ref, from `main.ts`.
- Avoid internal-facing injected “customization getters” that combine registration lookup, default resolution, and reactive global state. Prefer pure resolver functions with explicit arguments.

### Corpus lifecycle

- Construct the registry with the narrow corpus dependency, preferably `MaybeRefOrGetter<Corpus | undefined>` backed by `corpusState.corpus` in production.
- On a corpus transition, synchronously clear typed registrations and discard the complete legacy customization object.
- Create a fresh legacy customization object for the new corpus. Scripts are unmounted and reevaluated, so they will register again.
- Registrations never intentionally span corpora, even when two corpora happen to load the same script URL.
- A registration attempted without a loaded corpus is unsupported. Warn clearly and abort registration; do not queue it or recover through an implicit corpus global.

### Script ownership and disposal

- Typed form/result registrations belong to the script element that created them and should be purged when that script disappears.
- Removing or replacing a legacy script within the same corpus is unsupported. Legacy mutations may remain until the corpus changes.
- Do not add replay, undo, or per-callback invalidation machinery for legacy root callbacks solely to support same-corpus script replacement.
- A corpus transition is the reliable cleanup boundary for all legacy customization state.

## Legacy callback API

The deprecated API intentionally has two stages:

```js
frontend.customize(function configureImmediately(customizations) {
	customizations.someHook = function invokeLater(context) {
		// ...
	};
});
```

- The root callback passed to `frontend.customize` runs immediately because scripts are mounted only after a corpus is available.
- Do not retain root legacy callbacks after invoking them.
- The per-corpus legacy customization object retains the installed just-in-time hooks.
- Recreate that object when the corpus changes; object identity is not part of the external contract.
- External scripts must not retain handles to app-owned customization objects.
- `_corpus` is an internal implementation detail. Capture the corpus in the per-corpus legacy object rather than sourcing it from `installedCorpus`, injection, or a publication-time global.
- Legacy customization code may continue mutating corpus-derived objects where required for compatibility. Keep casts and mutations localized to the legacy adapter; do not treat this as precedent for new APIs.
- Place the legacy object factory and compatibility behavior under `customization-api/legacy.ts`. Form-specific adaptation belongs under `customization-api/form/legacy.ts`.

## Public globals

- Keep installation and documentation-by-code of browser globals in `interop/window-globals.ts`. This is the single place developers should inspect to see what is exposed publicly.
- The customization registry itself should not mutate `window` as a construction side effect.
- Globals are compatibility/public interop surfaces, not valid dependency sources for internal code.

## Callback design

- Registered callbacks receive plain arguments and return plain values.
- Callbacks must not need to know about `CorpusContext`, script loading, Vue injection, or where their input data originated.
- Prefer pure resolver functions that accept callback collections and all runtime context explicitly.
- Invoke ongoing customizations at the actual usage boundary. In components, inject the registry there and pass explicit arguments into helpers.
- Keep exception handling at callback invocation boundaries so one client customization does not break default behavior.

## Legacy stores

- Existing global stores may retain `init(context)` lifecycle methods for now.
- Do not add new singleton stores when component-local or injected state is sufficient.
- Gradually replace store reads with props and injected contexts as nearby code is refactored; a complete store migration is not required for unrelated work.
- Never solve store/context synchronization by adding another implicit global corpus accessor.

## Testing and implementation practice

- Test framework-neutral code with plain dependency values where possible; `MaybeRefOrGetter` APIs should not force tests to create Vue apps or injection contexts.
- Add corpus-transition tests for registries and other corpus-scoped state. Verify old registrations and legacy hooks are absent before new scripts register.
- Add a test for unsupported pre-corpus legacy registration: it should warn and leave state unchanged.
- Preserve the hard boundaries above even if a shorter implementation using `useCorpus()`, `useCustomizations()`, or a module singleton appears convenient.
- Run relevant Vitest tests and `npm run lint` from `src/frontend` after changes.

# Style

- Keep code terse and "dumb"
- Do not use tracking/version/cycle/change IDs in reactive contexts, this is an antipattern. Instead think harder about the intended reactivity and set up dependencies accordingly.
- Use `npm run format` in the `src/frontend` folder to automatically fix style, indentation, and import order.
