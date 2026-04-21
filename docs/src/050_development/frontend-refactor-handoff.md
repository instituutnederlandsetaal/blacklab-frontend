---
title: Frontend Refactor Handoff
order: 25
---

# Frontend Refactor Handoff

This document describes the target frontend module structure for the ongoing reorganization work.
It is meant as a handoff reference for implementation, not as a description of the current codebase.

For milestone tracking, open questions, and deferred notes during implementation, see [Frontend Refactor Progress](/development/frontend-refactor-progress).


## Goals

- Make page boot and long-lived runtime wiring explicit.
- Separate synchronous feature state from async derived state.
- Keep global and singleton instances easy to locate and reason about.
- Reduce import-time side effects and move them behind explicit runtime startup.
- Make the codebase easier to migrate incrementally without a full state-management rewrite.


## Non-goals

- Do not replace the current store model as part of this reorganization alone.
- Do not redesign the query URL format as part of this pass.
- Do not reattach query parameters, `popstate`, or initial URL decode during the structural refactor pass.
- Do not untangle the full URL synchronization subsystem yet.
- Do not break existing customization hooks and global interop in this pass.


## Constraints And Exceptions

- The refactor should be incremental. Existing behavior should stay stable while modules move.
- Keep the current route structure and route semantics.
- Keep vue-router route matching and page rendering working while query parameters remain inactive.
- Keep reading `indexId` and `docId` from route context for async fetches that update the corpus store and form-related stores.
- Keep external customization surfaces working, including `globalThis.hooks`, `window.vueApp`, `window.vueRoot`, `window.vuexModules`, `window.INDEX_ID`, and the global i18n facade.
- Keep the current auth before API initialization ordering.
- Keep corpus reinitialization behavior when the active corpus changes.

### URL state synchronization is intentionally disconnected for now

For now, URL state should stay disconnected from page state, except for vue-router page selection and route-derived `indexId` / `docId` reads used by async fetches.
The previous URL/store coupling had bugs and made the page unusable, so the rest of the structural refactor should proceed without query-parameter wiring, browser-history synchronization, or initial URL decode.

The staged plan after the refactor is:

- Wire state-to-URL reflection and test it.
- Wire `popstate` navigation.
- Wire initial URL decode.

When this work resumes, it should still live in one quarantined module so the rest of the application can be cleaned up around it.

The general flow of URL behavior when eventually re-implementing/re-wiring is:
- The URL is authoritative only on first load.
- On first load, the URL is parsed into store state.
  The UI can render before this happens, so the user has something to look at momentarily.
- After initial restore, the store then becomes the source of truth.
- From that point on, the URL is only a reflection of current store state.
- Store changes regenerate the URL and update browser history.
  Open question: since store stores the indexId and articleId, but not which route is active/does not control inter-page navigation, how do we initiate that navigation? The current application does not use current-page navigation, most links open using _blank, sidestepping the issue. 
  As long as the store is considered authoritative, we cannot use router-link, 
  as that would invert the authority, and the URL would have to be decoded. 
  I suppose we could attach a watcher on the route, and when a route change is detected, and there is no attached store state (i.e. navigation forward, not backwards), we could run the url->decode->store cycle once.
- Browser history entries should carry an attached store snapshot.
- `popstate` should restore from that snapshot when available instead of reparsing the URL.
- Reparsing the URL during `popstate` is specifically undesirable because it is async and would be bad UX.
- As described above, pushState could potentially require a url-parse if it concerns an inter-page navigation. I.e. search results => document view (or reverse). The store state is not rich enough to encode these navigations, so they would probably originate from the router/url changing, requiring a parse event.



## Recommended Top-Level Structure

```text
src/
  app/
    main.ts
    create-app-runtime.ts
    install-app.ts
    start-app-effects.ts
    state/
      root-store.ts
    dirty/
      url-state-sync.ts

  core/
    api/
      create-api-clients.ts
      endpoints.ts
      paths.ts
    async/
      create-resource.ts
      loadable.ts
    auth/
      auth-session.ts
    i18n/
      index.ts
    utils/
      ...

  navigation/
    router.ts
    route-context.ts

  features/
    corpus/
      model/
        corpus-state.ts
        corpus-actions.ts
        corpus-selectors.ts
      resources/
        corpus-resource.ts
      effects/
        corpus-bootstrap.effect.ts

    search/
      model/
        query-state.ts
        form/
          explore-state.ts
          filter-state.ts
          gap-state.ts
          interface-state.ts
          pattern-state.ts
        results/
          global-results-state.ts
          view-state.ts
      resources/
        selected-subcorpus-count.resource.ts
      effects/
        search-runtime.effect.ts
      ui/
        ...

    article/
      model/
        article-state.ts
      resources/
        article-resource.ts
      effects/
        article-runtime.effect.ts
      ui/
        ...

    history/
      model/
        query-history-state.ts

  interop/
    hooks.ts
    window-globals.ts
    custom-js.ts

  components/
    ...
  pages/
    ...
```


## Ownership Rules

### `app/`

The `app` layer is the composition root.
It should create the runtime, install Vue plugins, start long-lived effects, and mount the Vue app.
It is the only place that should know how all feature modules are wired together.

Responsibilities:

- Create app-wide singleton instances.
- Start runtime watchers and subscriptions exactly once.
- Mount Vue.
- Expose compatibility shims when needed.

### `core/`

The `core` layer holds reusable infrastructure and stateless helpers.
It should not import feature modules or page code.

Responsibilities:

- API client factories.
- Auth helpers.
- i18n manager and plugin glue.
- Generic async resource primitives.
- Pure utility helpers.

### `navigation/`

The `navigation` layer owns route definitions and route-derived reactive state.
It should not own feature initialization logic.

Responsibilities:

- Route table.
- `currentRoute`-derived refs such as corpus id and document id.
- Navigation-specific helpers.

Rule:

- `router.ts` should define routes only. Startup waits, URL restore sequencing, and store hydration should not live in route definitions.

### `features/`

Each feature owns its own state, async resources, runtime effects, and UI.
Feature boundaries matter more than the old `store/` versus `api/async/instances/` split.

Recommended subfolders:

- `model/`: synchronous state, actions, selectors.
- `resources/`: async derived state and loaders.
- `effects/`: watchers, subscriptions, and runtime wiring.
- `ui/`: feature-local components and composables.

### `interop/`

This layer contains intentionally messy browser/global integration points.
It should isolate custom JS hooks, window globals, and legacy external surfaces.


## Module Rules

- `model` modules may depend on feature-local types, selectors, and pure helpers. They should not call the router, touch `window`, or perform network work.
- `resources` may depend on `core` services and feature selectors. They own async state, retries, refresh, and cancellation.
- `effects` are the only place for `watch`, `watchEffect`, RxJS subscriptions, router guards, `fromEvent`, and browser listeners.
- `ui` code may read feature state and dispatch feature actions, but should not create app-wide singletons.
- `interop` may depend on app runtime and feature actions, but the rest of the application should not depend on `interop` unless the dependency is explicitly about customization or browser globals.


## Singleton And Global Instance Policy

The goal is not to eliminate all singletons.
The goal is to make them explicit, owned, and centrally created.

### App-wide singletons

These should be created from `app/create-app-runtime.ts` and reused for the lifetime of the page:

- Router.
- Auth session manager.
- API clients.
- i18n manager/plugin.
- Hooks registry.
- Root store facade.

### Feature-owned runtime singletons

These are still long-lived single instances, but they should be owned by a feature and created by the app runtime:

- Corpus resource.
- Selected subcorpus count resource.
- Any future search result resource, article resource, or tagset resource.

### Globals exposed for compatibility

These should be exposed from `interop/window-globals.ts`, not sprinkled across unrelated modules:

- `window.vueApp`
- `window.vueRoot`
- `window.vuexModules`
- `window.INDEX_ID`
- `globalThis.hooks`
- global i18n facade


## Runtime Boot Sequence

The target runtime sequence should be explicit and linear:

1. Import polyfills and global CSS.
2. Resolve auth session.
3. Create API clients using the resolved auth state.
4. Create the app runtime.
5. Create the Vue app and install plugins.
6. Start feature effects and interop registration.
7. Start corpus bootstrap from route context plus auth state.
8. Reinitialize feature state when corpus data changes.
9. Mount the Vue app.

Important detail:

- During the refactor phase, query parameters, `popstate` restoration, and initial URL decode are intentionally inactive.
- `indexId` and `docId` still need to be available early enough for async fetches that hydrate corpus and form-related state.
- When URL behavior is reintroduced later, that startup sequencing should be explicit in app boot, not hidden in router guards and import-time watchers.


## Deferred URL Reattachment Plan

The URL is intentionally disconnected from feature state during the remaining structural refactor work.
The previous URL/store coupling was buggy enough to make the page unusable, so the remaining reorganization should not depend on live URL synchronization.

### What remains active

- vue-router route matching and `<router-view>` rendering.
- Route-derived `indexId` and `docId` reads used by async fetches that update corpus and form-related state.

### What is intentionally inactive

- Query-parameter decode into store state.
- Store-to-URL reflection.
- Browser-history snapshot restoration and `popstate` synchronization.

### Reattachment order after the refactor

1. Wire state-to-URL reflection and test it.
2. Wire `popstate` navigation.
3. Wire initial URL decode.

### Structural rule

All URL reattachment work should live in `app/dirty/url-state-sync.ts` for now.
Do not let pieces of this logic spread back into router setup, feature models, or random utility modules.


## Recommended File Moves

These moves keep the current behavior but give each concern a clearer owner.

| Current file or area | Target location | Notes |
| --- | --- | --- |
| `src/main.tsx` | `src/app/main.ts`, `src/app/install-app.ts`, `src/interop/hooks.ts` | Keep entry small. Split hooks and mounting from runtime creation. |
| `src/route/router.ts` | `src/navigation/router.ts` | Keep route definitions only. Remove startup waiting and hydration logic. |
| `src/api/async/instances/reactive-variables.ts` | `src/navigation/route-context.ts` | These values are route-derived state, not API state. |
| `src/api/async/instances/corpus-data.ts` | `src/features/corpus/resources/corpus-resource.ts` | App-specific resource instance. |
| `src/api/async/instances/result-count.ts` | `src/features/search/resources/selected-subcorpus-count.resource.ts` | Async derived search state. |
| `src/store/index.ts` | `src/app/state/root-store.ts` | Keep a root facade during migration. Move watchers out. |
| `src/store/streams.ts` | `src/app/dirty/url-state-sync.ts` | This is the main quarantined dirty module. |
| `src/store/corpus.ts` | `src/features/corpus/model/corpus-state.ts` | Pure feature state. |
| `src/store/query.ts` | `src/features/search/model/query-state.ts` | Pure submitted-query state. |
| `src/store/history.ts` | `src/features/history/model/query-history-state.ts` | Query history, not browser history. |
| `src/store/results/*` | `src/features/search/model/results/*` | Search result state belongs to the search feature. |
| `src/store/form/*` | `src/features/search/model/form/*` | Search form state belongs to the search feature. |
| `src/PageMetaUpdater.vue` and global DOM/meta wiring | `src/interop/custom-js.ts` or a small interop component wrapper | Keep DOM-global customization together. |


## Suggested Compatibility Layer During Migration

To keep the move incremental, keep a compatibility facade for a while.

Recommended approach:

- Keep `root-store.ts` exposing the current `get`, `actions`, and `init` shape while internals move underneath.
- Add re-export shim files at old paths during migration if needed.
- Move watchers first, then move state modules, then remove compatibility shims.

This reduces churn in page and component code while the runtime wiring is being cleaned up.


## Implementation Order

Recommended sequence:

1. Create `app/`, `navigation/`, `features/`, and `interop/` folders.
2. Introduce `app/create-app-runtime.ts` and `app/state/root-store.ts` without changing behavior.
3. Move import-time watchers into explicit feature `effects/` modules.
4. Quarantine URL-related code in `app/dirty/url-state-sync.ts`, but keep it disconnected from page state during the structural refactor.
5. Move route-derived refs into `navigation/route-context.ts`.
6. Move async instance modules into feature `resources/`.
7. Move synchronous store slices into feature `model/`.
8. Consolidate browser globals and customization hooks into `interop/`.
9. Remove compatibility shims only after imports have been updated and behavior is stable.
10. After the structural refactor is complete, reattach URL behavior in phases: state-to-URL reflection and testing, `popstate` navigation, initial URL decode.


## Practical Boundaries To Preserve

- Do not move page components just to satisfy the folder design. Pages can stay where they are until state and runtime ownership are cleaner.
- Do not force every helper into `core`. If a helper is feature-specific, keep it with the feature.
- Do not spread one async flow across multiple top-level directories. Each flow should have one owner.
- Do not let feature models import the router directly.
- Do not create new import-time singleton instances in random modules.


## Definition Of Done For The Reorganization

The structure is in good shape when the following are true:

- App boot can be understood by reading `app/main.ts`, `app/create-app-runtime.ts`, and `app/start-app-effects.ts`.
- Router setup is declarative and no longer doubles as startup orchestration.
- Async derived state lives under feature `resources/`.
- Long-lived watchers and subscriptions live under feature `effects/` or the one dirty URL module.
- Browser globals are isolated in `interop/`.
- URL-related wiring is either disconnected or isolated in the dirty module; it is not spread through router setup and store internals.
- A new contributor can find the owner of a state field, loader, or watcher without searching half the repo.
