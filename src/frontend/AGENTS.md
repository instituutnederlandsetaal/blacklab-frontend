# Frontend agent guidance

These rules describe the intended frontend architecture. Some legacy code does not comply yet. When changing code, use these rules where practical, rather than expanding legacy patterns.

## Dependency boundaries

### Vue code may inject; ordinary TypeScript may not

- Framework-neutral TypeScript must receive dependencies through arguments. This includes stores, builders, controllers, resources, resolvers, parsers, effects, and utilities.
- A helper being called by a component does not make hidden injection acceptable. Resolve the dependency in the component and pass it down.
- Vue components and composables solely meant for use in components may use `use*()`/`provide`/`inject`.
- Never add persistent local module-level references such as “current corpus”, state or similar implicit globals.
- Existing outside-injection fallbacks such as `installedCorpus` are temporary migration hacks, and should never be used in new code.
- When a singleton system needs another system, wire them together explicitly in `src/app/entrypoint/main.ts`. An imperative `init()` or setter is acceptable for legacy singletons where setup is not currently practical.

### Prefer narrow dependencies

- Pass only the state a system needs. For example, a customization registry that needs the corpus receives `corpusState.corpus`, not the complete corpus context.
- Explicit reactive dependencies are allowed. APIs accepting reactive input should generally consume `MaybeRefOrGetter<T>` with `toValue()` so tests and non-reactive callers can pass plain values. Always use a MaybeRefOrGetter or explicit Ref, never pass reactive objects across logical boundaries to avoid introducing implicit knowledge and non-obvious coupling through the reactivity.
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
- It must not invoke systems on its own. Downstream systems read its exposed state and use it locally.
- Components may obtain the registry with `useCustomizations()` and pass the relevant state to ordinary TypeScript helpers.
- Customizations never outlive corpora, even when two corpora happen to load the same script.
- A registration attempted while corpus context (with or without active corpus) is loading/errored is unsupported. Warn clearly and abort registration; do not queue it or recover through an implicit corpus global.

### Script ownership and disposal

- Registrations belong to the script element that created them and should be purged when that script disappears.
- Removing or replacing a legacy script within the same corpus is supported, but legacy mutations may remain until the corpus changes.
- Do not add replay, undo, or per-callback invalidation machinery for legacy root callbacks
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

- Globals meant for customization scripts must be kept/exposed solely in `interop/window-globals.ts`. This is the single place developers should inspect to see what is exposed publicly.
- Globals are compatibility/public interop surfaces, never to be used for internal code.

## Callback design

- Callbacks must not need to know about `CorpusContext`, script loading, Vue injection, or where their input data originated.
- Prefer pure resolver functions that accept callback collections and all runtime context explicitly.
- Invoke ongoing customizations at the actual usage boundary. In components, inject the registry there and pass explicit arguments into helpers.
- Keep exception handling at callback invocation boundaries so one client customization does not break default behavior.

## Legacy stores

- Do not add new singleton stores when component-local or injected state is sufficient.
- Gradually replace store reads with props and injected contexts as nearby code is refactored; a complete store migration is not required for unrelated work.

## Testing and implementation practice

- Preserve hard boundaries above even if a shorter implementation using `useCorpus()`, `useCustomizations()`, or a module singleton appears convenient.
- Run relevant Vitest tests and `npm run lint` from `src/frontend` after changes.

# Style

- Keep code terse and "dumb"
- Never use explicit tracking/version/cycle/change number variables for tracking reactive changes, this is an antipattern. Instead think harder about the intended reactivity and set up regular reactive dependencies accordingly. It's almost always a smell to use `watch()`.
- Use `npm run format` in the `src/frontend` folder to fix style, whitespace, indentation, and imports. Do not bother manually editing these.
- When writing comments comments or editing docs, avoid llm-isms, such as short sentences, repeated full stops, "not x, but y", invented, needless or uncommon terminology, and assess whether introducing a term contributes meaningful additional information to a developer, often it does not. A good reference is wikipedia's guide on what to avoid in llm-output: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing , particularly the "Language_and_grammar" section.
