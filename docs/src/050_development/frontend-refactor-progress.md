---
title: Frontend Refactor Progress
order: 26
---

# Frontend Refactor Progress

This document is the living execution companion to [Frontend Refactor Handoff](/development/frontend-refactor-handoff).
The handoff document describes the target structure.
This document tracks implementation progress, current status, open questions, and deferred notes so we do not lose context or get sidetracked mid-milestone.


## How To Use This Document

- Treat the handoff document as the architecture target and this document as the execution tracker.
- Update milestone status only when code has actually landed and been verified.
- Put questions and concerns in the dedicated section below instead of interrupting a milestone unless something is blocking.
- Put side thoughts, nitpicks, and non-blocking observations in the parking-lot section.
- Move resolved questions or settled decisions into the decision log instead of deleting them.


## Status Legend

- `not started`: no meaningful implementation work has landed yet.
- `in progress`: some work has landed, but the intended owner or behavior is not final yet.
- `done`: the milestone goal for this phase has landed and been verified.
- `parked`: intentionally deferred for a later phase.


## Current Snapshot

- Last updated: 2026-04-22.
- Last known verification: `npm run build` passed in `src/frontend` on 2026-04-22.
- Current migration strategy: compatibility-first extraction. New owners are introduced first, while old import paths remain as shims.
- Store-model migration status: all former synchronous `src/store/*` state slices now have canonical owners under `features/*/model/*` or `app/state/*`; the old `src/store/*` entrypoints are now compatibility re-export shims.
- Established move pattern for store-slice migrations:
	move the concrete implementation to its canonical owner,
	reduce the old `src/store/*` path to a re-export shim,
	update `app/state/root-store.ts`, devtools, and already-migrated canonical owners where touched,
	then validate with `npm run build` in `src/frontend` before widening scope.
- Current behavioral constraint: URL state is intentionally disconnected from page state. Only vue-router page routing and route-derived `indexId` / `docId` reads for async fetches remain active.
- Current usability safeguard: query parameters, store-to-URL wiring, `popstate` restoration, and initial URL decode are inactive because the previous URL/store coupling was buggy and made the page unusable.
- Temporary validation exception: `src/app/dirty/temporary-article-initial-url-parse.ts` re-enables initial URL decode only for direct article-page loads so the migrated article store can be validated; remove it after the validation pass.


## Progress Log

### 2026-04-22

- Moved the concrete router definition into `src/navigation/router.ts`.
- Reduced `src/route/router.ts` to a compatibility re-export shim.
- Moved the root-store implementation into `src/app/state/root-store.ts`.
- Reduced `src/store/index.ts` to a compatibility re-export shim.
- Moved the article store implementation into `src/features/article/model/article-state.ts`.
- Reduced `src/store/article.ts` to a compatibility re-export shim.
- Moved the history store implementation into `src/features/history/model/query-history-state.ts`.
- Reduced `src/store/history.ts` to a compatibility re-export shim.
- Moved the query store implementation into `src/features/search/model/query-state.ts`.
- Reduced `src/store/query.ts` to a compatibility re-export shim.
- Moved the corpus store implementation into `src/features/corpus/model/corpus-state.ts`.
- Reduced `src/store/corpus.ts` to a compatibility re-export shim.
- Moved the explore form store implementation into `src/features/search/model/form/explore-state.ts`.
- Reduced `src/store/form/explore.ts` to a compatibility re-export shim.
- Moved the filter form store implementation into `src/features/search/model/form/filter-state.ts`.
- Reduced `src/store/form/filters.ts` to a compatibility re-export shim.
- Moved the interface form store implementation into `src/features/search/model/form/interface-state.ts`.
- Reduced `src/store/form/interface.ts` to a compatibility re-export shim.
- Moved the gap form store implementation into `src/features/search/model/form/gap-state.ts`.
- Reduced `src/store/form/gap.ts` to a compatibility re-export shim.
- Moved the pattern form store implementation into `src/features/search/model/form/pattern-state.ts`.
- Reduced `src/store/form/patterns.ts` to a compatibility re-export shim.
- Moved the form aggregate implementation into `src/features/search/model/form/form-state.ts`.
- Reduced `src/store/form/index.ts` to a compatibility re-export shim.
- Moved the global results store implementation into `src/features/search/model/results/global-results-state.ts`.
- Reduced `src/store/results/global.ts` to a compatibility re-export shim.
- Moved the view-state store implementation into `src/features/search/model/results/view-state.ts`.
- Reduced `src/store/results/views.ts` to a compatibility re-export shim.
- Moved the tagset store implementation into `src/features/corpus/model/tagset-state.ts`.
- Reduced `src/store/tagset.ts` to a compatibility re-export shim.
- Moved the UI store implementation into `src/app/state/ui-state.ts`.
- Reduced `src/store/ui.ts` to a compatibility re-export shim.
- Updated touched article consumers to use the canonical feature-owned article model.
- Updated touched history consumers to use the canonical feature-owned history model.
- Updated touched query consumers to use the canonical feature-owned query model.
- Updated app-owned and already-migrated feature-owned corpus consumers to use the canonical feature-owned corpus model.
- Updated app-owned and already-migrated feature-owned explore consumers to use the canonical feature-owned explore model.
- Updated app-owned and already-migrated feature-owned interface consumers to use the canonical feature-owned interface model.
- Updated app-owned and already-migrated feature-owned gap consumers to use the canonical feature-owned gap model.
- Updated app-owned and already-migrated feature-owned filter consumers to use the canonical feature-owned filter model.
- Updated app-owned and already-migrated feature-owned pattern consumers to use the canonical feature-owned pattern model.
- Updated app-owned and already-migrated feature-owned form-aggregate consumers to use the canonical feature-owned form model.
- Updated app-owned and already-migrated feature-owned results consumers to use the canonical feature-owned results models.
- Updated app-owned and already-migrated feature-owned tagset consumers to use the canonical corpus-owned tagset model.
- Updated app-owned and already-migrated feature-owned UI consumers to use the canonical app-owned UI model.
- Left remaining legacy article imports only in the quarantined URL modules.
- Left remaining legacy history imports only in the quarantined URL modules.
- Left remaining legacy query imports only in the quarantined URL modules.
- Left broader remaining legacy corpus imports in existing store, page, and URL modules for incremental cleanup.
- Left remaining legacy explore imports in existing form, helper, page, and URL modules for incremental cleanup.
- Left remaining legacy filter imports in existing helper, page, and URL modules for incremental cleanup.
- Left remaining legacy interface imports in existing form, page, and URL modules for incremental cleanup.
- Left remaining legacy gap imports in the form aggregate, one page component, and URL modules for incremental cleanup.
- Left remaining legacy pattern imports in existing helper, page, and URL modules for incremental cleanup.
- Left remaining legacy results imports in existing page and URL modules for incremental cleanup.
- Left remaining legacy tagset imports in existing page and URL modules for incremental cleanup.
- Left remaining legacy UI imports in existing page and URL modules for incremental cleanup.
- Added a temporary article-only initial URL decode effect in `src/app/dirty/temporary-article-initial-url-parse.ts` to support validating the article-store migration without reconnecting the broader URL sync subsystem.
- Added a route-scoped page-bootstrap signal so `PageMetaUpdater.vue` can defer custom JS injection until article/help/about pages report that their primary async content has settled.
- Updated app-owned consumers to use the canonical `app/state/root-store` owner where touched.
- Verified the frontend with `npm run build` in `src/frontend`.

### 2026-04-21

- Added the initial top-level structure for `app`, `navigation`, `features`, and `interop`.
- Switched the main entrypoint to `src/app/main.ts` while keeping `src/main.tsx` as a thin compatibility entry.
- Moved corpus bootstrap out of `src/store/index.ts` into `src/features/corpus/effects/corpus-bootstrap.effect.ts`.
- Moved route-derived reactive variables into `src/navigation/route-context.ts` with compatibility re-exports from the old async-instance path.
- Moved async singleton resources for corpus data and selected subcorpus count under `features/*/resources`.
- Physically isolated URL synchronization into `src/app/dirty/url-state-sync.ts` and made `src/store/streams.ts` a compatibility export.
- Disconnected URL/store wiring after the coupled implementation proved buggy and made the page unusable.
- Changed runtime ordering so app/plugin installation happens before long-lived effects start.
- Left vue-router active only for route matching and `<router-view>` rendering.
- Kept `indexId` and `docId` reads available for async fetches that update corpus and form-related state.
- Left query parameters and browser-history synchronization inactive until the structural refactor is complete.


## Milestone Plan And Progress

### Milestone 1: Create New Top-Level Owners

Status: `done`

Scope:

- Introduce `app/`, `navigation/`, `features/`, and `interop/`.
- Establish a runtime composition root.

Landed:

- `src/app/main.ts`
- `src/app/create-app-runtime.ts`
- `src/app/install-app.ts`
- `src/app/start-app-effects.ts`
- `src/app/state/root-store.ts`
- `src/navigation/router.ts`
- `src/navigation/route-context.ts`
- `src/features/corpus/...`
- `src/features/search/...`
- `src/interop/...`

Notes:

- `src/main.tsx` is now only a thin compatibility entrypoint.


### Milestone 2: Move Import-Time Runtime Wiring Into Explicit Owners

Status: `done`

Goal:

- Remove important app behavior from arbitrary import-time watchers and move it into explicit app, feature, or navigation owners.

Landed:

- The corpus bootstrap watch no longer lives in `src/store/index.ts`.
- i18n index binding now starts from `src/app/start-app-effects.ts`.
- Corpus and search async singleton resources now live under feature-owned `resources/` modules.
- App/plugin installation now happens before effects are started.
- The concrete router definition now lives in `src/navigation/router.ts`, with `src/route/router.ts` kept as a compatibility shim.
- `src/app/state/root-store.ts` now owns the root-store implementation instead of re-exporting it from `src/store/index.ts`.


### Milestone 3: Quarantine URL Synchronization And Keep It Disconnected

Status: `parked`

Goal:

- Keep URL-related code in one clear owner while the rest of the refactor proceeds with URL wiring disabled.

Landed:

- The former `src/store/streams.ts` implementation now lives in `src/app/dirty/url-state-sync.ts`.
- The old path is now a compatibility export.
- URL/store wiring is currently disconnected because the previous coupled behavior was buggy and made the page unusable.
- Runtime routing currently relies only on vue-router plus route-derived `indexId` and `docId` reads for async fetches that update corpus and form-related state.
- Query-parameter-driven state and browser-history restoration are currently inactive.
- Temporary validation-only exception: direct article-page loads now run a one-shot initial URL decode from `src/app/dirty/temporary-article-initial-url-parse.ts`.

Remaining:

- Finish the remaining structural refactor without reattaching URL behavior.
- Reintroduce URL behavior only after the refactor is stable, in this order: state-to-URL reflection and testing, `popstate` navigation, initial URL decode.

Guardrail:

- Do not reattach query parameters or browser-history behavior during the refactor. The page is currently usable only because URL state is disconnected from store state.
- Remove the temporary article-only initial URL decode again after the article-store validation pass.


### Milestone 4: Move Route-Derived State Into `navigation/`

Status: `done`

Landed:

- `src/navigation/route-context.ts` now owns `indexId`, `docId`, `user`, and `userName`.
- `src/api/async/instances/reactive-variables.ts` now re-exports from the navigation owner.


### Milestone 5: Move Feature State Models Under `features/`

Status: `done`

Scope:

- Move synchronous store slices behind feature-owned model modules.
- Make `app/state/root-store.ts` the actual composition owner instead of a re-export shim.

Landed:

- `src/app/state/root-store.ts` is now the actual composition owner for the aggregate root store.
- `src/store/index.ts` is now a compatibility shim that re-exports from the app owner.
- `src/features/article/model/article-state.ts` now owns the article store implementation.
- `src/store/article.ts` is now a compatibility shim that re-exports from the article feature owner.
- `src/features/history/model/query-history-state.ts` now owns the history store implementation.
- `src/store/history.ts` is now a compatibility shim that re-exports from the history feature owner.
- `src/features/search/model/query-state.ts` now owns the query store implementation.
- `src/store/query.ts` is now a compatibility shim that re-exports from the search feature owner.
- `src/features/corpus/model/corpus-state.ts` now owns the corpus store implementation.
- `src/store/corpus.ts` is now a compatibility shim that re-exports from the corpus feature owner.
- `src/features/search/model/form/explore-state.ts` now owns the explore form store implementation.
- `src/store/form/explore.ts` is now a compatibility shim that re-exports from the search feature owner.
- `src/features/search/model/form/filter-state.ts` now owns the filter form store implementation.
- `src/store/form/filters.ts` is now a compatibility shim that re-exports from the search feature owner.
- `src/features/search/model/form/interface-state.ts` now owns the interface form store implementation.
- `src/store/form/interface.ts` is now a compatibility shim that re-exports from the search feature owner.
- `src/features/search/model/form/gap-state.ts` now owns the gap form store implementation.
- `src/store/form/gap.ts` is now a compatibility shim that re-exports from the search feature owner.
- `src/features/search/model/form/pattern-state.ts` now owns the pattern form store implementation.
- `src/store/form/patterns.ts` is now a compatibility shim that re-exports from the search feature owner.
- `src/features/search/model/form/form-state.ts` now owns the aggregate form store implementation.
- `src/store/form/index.ts` is now a compatibility shim that re-exports from the search feature owner.
- `src/features/search/model/results/global-results-state.ts` now owns the global results store implementation.
- `src/store/results/global.ts` is now a compatibility shim that re-exports from the search feature owner.
- `src/features/search/model/results/view-state.ts` now owns the results view-state implementation.
- `src/store/results/views.ts` is now a compatibility shim that re-exports from the search feature owner.
- `src/features/corpus/model/tagset-state.ts` now owns the tagset store implementation.
- `src/store/tagset.ts` is now a compatibility shim that re-exports from the corpus feature owner.
- `src/app/state/ui-state.ts` now owns the UI store implementation.
- `src/store/ui.ts` is now a compatibility shim that re-exports from the app owner.

Notes:

- The store-model move itself is complete; remaining `@/store/*` usage is now compatibility cleanup rather than ownership migration.
- Keep the old store entrypoints valid until broader canonical-import cleanup is worth the churn, especially in the quarantined URL slice.


### Milestone 6: Consolidate Interop Surfaces

Status: `in progress`

Landed:

- `globalThis.hooks`
- `window.vueApp`
- `window.vueRoot`
- `currentCorpusData`

Remaining:

- `window.vuexModules`
- `window.INDEX_ID`
- DOM and meta customization surfaces currently centered around `PageMetaUpdater.vue`
- Any remaining global customization glue that still lives outside `interop/`


### Milestone 7: Remove Compatibility Shims

Status: `not started`

Scope:

- Update imports to canonical owners.
- Remove old path aliases and re-export shims only after the new owners are stable.


## Near-Term Next Step

The next implementation slice should stop creating new store owners and start shrinking compatibility usage while keeping URL behavior disconnected.

That means:

- Prefer small canonical-import cleanup slices outside the quarantined URL code first, such as page, helper, or app-owned consumers that still use `@/store/*`.
- Keep the old `src/store/*` paths as temporary shims while that cleanup proceeds.
- Treat the quarantined URL modules as a later cleanup pass unless a local change already touches them.
- Consider interop cleanup next where it naturally overlaps, especially moving browser-global ownership out of state modules without removing the exposed customization surfaces.
- Query parameters, store-to-URL reflection, browser-history restoration, and initial URL decode should remain inactive during the refactor.
- Route-derived `indexId` and `docId` can still be used for async fetches that update corpus and form-related state.
- After the refactor is complete, reintroduce URL behavior in this order: state-to-URL reflection and testing, `popstate` navigation, initial URL decode.


## Open Questions And Concerns

Edit this section directly.
If an answer becomes stable and we act on it, move it to the decision log below.

### Q1. Router Ownership Migration

Question:

- When the actual router implementation moves out of `src/route/router.ts`, should the old path remain a longer-lived compatibility shim, or should it be treated as short-lived and cleaned up soon after imports are updated?

Status: answered

User answer / notes:

- Treat old router path at `src/router/router.ts` as a shim and clean up together with the other shims eventually.


### Q2. URL Reattachment Order

Question:

- Once the structural refactor is complete, in what order should URL behavior be reintroduced?

Concern:

- Reattaching too much URL behavior at once will make regressions harder to isolate.

Status: answered

User answer / notes:

- Keep URL state disconnected during the remaining refactor work.
- Reintroduce URL behavior in phases: first state to URL and test it, then `popstate` navigation, then initial URL decode.


### Q3. Startup Ordering Policy

Question:

- Do you want `app/start-app-effects.ts` to remain allowed to start bootstrap effects before router/plugin installation if that preserves first-load behavior, or do you prefer a stricter rule that all effects start only after `app.use(router)` and we solve ordering another way?

Concern:

- The current implementation intentionally starts corpus bootstrap early to avoid a first-navigation race.

Status: answered

User answer / notes:

- Target should always be to init all systems/app.use() calls before starting effects. If during development or testing it appears that reality makes it difficult, or it would require dirty state guards everywhere, we can resort to wiring effects before app has fully initialized, but it should be a last resort.


### Q4. Compatibility Horizon

Question:

- Roughly how long should legacy imports stay valid during the migration?

Examples:

- `@/store/*`
- `@/api/async/instances/*`
- `@/route/router`

Status: answered

User answer / notes:

- until we're done, unless extensive explicit work has to be done to preserve them before that time (e.g. writing compat code, wrappers, etc.), then it would be preferable to bite the bullet and update the imports in the codebase itself.


### Q5. Interop Cleanup Priority

Question:

- Which remaining interop surface should be cleaned up first once we get there?

Candidates:

- `window.vuexModules`
- `window.INDEX_ID`
- `PageMetaUpdater.vue` and related custom-JS/meta wiring

Status: answered

User answer / notes:

- These should be kept. They are for interfacing with the app from user customization scripts.


### C1. Extracted But Not Activated Yet

Concern:

- `src/app/dirty/url-state-sync.ts` is physically isolated, but URL behavior is intentionally disconnected right now.
- It is easy to mistake file movement for live query-parameter or browser-history behavior.

User response / notes:

- This is intentional until the structural refactor is complete and the URL work can be reintroduced in controlled phases.


### C2. Interop Consolidation Is Only Partial

Concern:

- `interop/` now exists, but several important compatibility globals still live elsewhere.

Examples:

- `window.vuexModules`
- `window.INDEX_ID`
- the global i18n facade
- DOM/meta customization surfaces

User response / notes:

- Customization surfaces (vuexmodules) should remain, but exposing them/setting on window can be moved to the `interop/` directory.
- `INDEX_ID` is a legacy artifact from the pre-SPA times that should be removed, but we can keep using it for now and defer that. 
- Authentication, BLS_URL etc. are constant and global across corpora and pages, they are set by the backend in order to properly init the UI. Safe to use, don't change behavior.


### C3. `root-store.ts` Is Still A Compatibility Facade

Concern:

- `src/app/state/root-store.ts` exists, but it is currently just a re-export.
- That is fine for now, but easy to overestimate when planning the next steps.

User response / notes:

- Resolved on 2026-04-22 by moving the implementation into `src/app/state/root-store.ts` and leaving `src/store/index.ts` as a compatibility shim.


## Parking Lot For Thoughts And Nitpicks

Use this section for things that feel off but do not justify interrupting the current milestone.
Revisit these only at milestone boundaries unless an item becomes blocking.

Add new notes directly below this line:

- Why is main.tsx completely empty save for a side-effect import of `app/main.ts`, why not remove it and update vite config to the new entrypoint (might be irrelevant if new content appears in future steps).
- `create-app-runtime.ts`: why the global `_cfApiInitialized` on window and not just as a module local var?
- route-context exports user and userName, but those are auth-related, not route related. The globals file originally only existed to avoid some circular imports. 
- `corpus-resource.ts` and `corpus-bootstrap.effect.ts` both seem to dabble in initiating reactivity on the corpus. Why split these two?
- 

## Decision Log

### 2026-04-22

- Make `src/navigation/router.ts` the concrete router owner and keep `src/route/router.ts` as a compatibility shim during the migration.
- Make `src/app/state/root-store.ts` the concrete aggregate-store owner and keep `src/store/index.ts` as a compatibility shim while feature model modules are introduced.
- Finish the synchronous store-model migration by making `src/features/search/model/form/*`, `src/features/search/model/results/*`, `src/features/corpus/model/tagset-state.ts`, and `src/app/state/ui-state.ts` the concrete owners while keeping the old `src/store/*` paths as compatibility shims.
- Keep legacy `@/store/*` paths valid until the migration is otherwise complete unless preserving a specific path becomes more expensive than updating imports directly.

### 2026-04-21

- Keep URL-related code in one dirty module for now instead of untangling it during the broader structural cleanup.
- Keep URL state disconnected from page state for the remainder of the structural refactor because the previous coupling was buggy and made the page unusable.
- Leave only vue-router page routing plus route-derived `indexId` / `docId` reads active during this phase.
- Reintroduce URL behavior only after the refactor is complete, in this order: state-to-URL reflection and testing, `popstate` navigation, initial URL decode.
- Use a compatibility-first migration strategy instead of a big-bang import rewrite.
- Treat the old router path as a shim and clean it up together with the rest of the migration shims.
- Prefer initializing systems and `app.use(...)` calls before starting long-lived effects when practical.
- Keep user-facing customization globals such as `window.vuexModules`; move ownership if needed, but do not remove the surface.