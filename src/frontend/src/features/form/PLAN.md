# Incremental New Form Integration: Simple Search First

## Summary

Integrate the new form system as the active simple search UI when `useNewSearchForm` is enabled, while leaving extended, advanced, expert, filters, explore, and legacy query behavior in place. Construct one corpus-aware form definition up front during app bootstrap, pass it into URL sync/parser, and use it in the search UI so URL restore, rendering, submit, and URL generation all operate on the same `FormBuilder`.

## Key Changes

- Add a small search form factory/service created from `main.ts` with `{ corpus, blacklabApi, translate }`.
  - Build only `search.simple`.
  - Use the configured simple annotation from `UIStore.search.simple.searchAnnotationId`.
  - Use `annotationSelectController + SelectField` for `select`; otherwise use `annotationTextController + TextField`, with autocomplete enabled for `combobox`.
  - For parallel corpora, wrap the simple annotation field in `parallelController + ParallelField` using existing parallel field and align-by options.
  - Rebuild lazily when the loaded corpus id changes.

- Render the new form in `QueryFormSearch.vue` where the placeholder currently is.
  - Replace `Rendering new simple search` with `<FormSystem :definition="..." @submit="..." @reset="..." />`.
  - On submit, call a new root-store action that accepts the compiled form snapshot.
  - Keep legacy simple UI behind the existing `newForm` conditional.

- Avoid nested HTML forms in `QueryForm.vue`.
  - Add `newSimpleSearchActive = activeForm === 'search' && patternMode === 'simple' && useNewSearchForm`.
  - Render the old outer wrapper as `div` instead of `form` while `newSimpleSearchActive` is true.
  - Hide only the old submit/reset buttons in that mode; keep history/settings buttons visible.

- Add a narrow new-form branch to query/root state.
  - Extend `QueryModule.ModuleRootState` with a `form: 'new-search'` variant containing the compiled `patt`, `filter`, `searchfield`, `encoded`, summaries, and enough legacy metadata to keep history entries usable.
  - Update `RootStore.get.blacklabParameters()` to use compiled new-form params directly for this variant.
  - Add `RootStore.actions.searchFromNewFormSubmit(snapshot)` that mirrors existing submit behavior: reset views, choose `hits` when `snapshot.patt` exists otherwise `docs`, store the new query snapshot, and blur the active element.

- Integrate restore into `UrlStateParserSearch`.
  - Extend the constructor with an optional `FormBuilder`.
  - When a builder is provided, restore it during `get()` after CQL parsing:
    - If `f.*` params exist, call `restoreScopedFormState(builder, params, canonical BlackLab params)`.
    - If no `f.*` params exist and the legacy parser selected search/simple with no filters/gap, seed the simple form from `simplePattern`.
    - Otherwise restore canonical params as raw overrides so the new form shows the query without claiming full editability.
  - Preserve the existing returned legacy `HistoryEntry` shape for non-new-form restores.

- Wrap new-form URL generation in `url-state-sync`.
  - In `toUrlPayload` / `stateToUrl` input, carry optional scoped form params from the new query snapshot.
  - Merge `snapshot.encoded` into search URL query params alongside canonical `patt`, `filter`, and `searchfield`.
  - Keep canonical params for compatibility while new `f.*` params become the source of truth for the new form state.
  - On browser history restore and imported URLs, pass the upfront form builder into `UrlStateParserSearch`.

## Public Interfaces / Types

- `UrlStateParserSearch` gains optional constructor parameter: `newFormDefinition?: FormBuilder | null`.
- `startUrlSync(router, deps)` gains an optional dependency: `searchForms?: SearchFormSystem`.
- `QueryModule.ModuleRootState` gains a new submitted-query variant for compiled new-form snapshots.
- `stateToUrl` input gains optional `scopedFormQuery?: ScopedFormQuery`.

## Test Plan

- Add parser tests for:
  - New `f.*` simple URL restores builder state and preserves legacy history state.
  - Old canonical simple URL seeds the new simple form when it is genuinely simple.
  - Complex/extended/expert canonical URL becomes raw override instead of corrupting field state.

- Add URL generation tests for:
  - New simple form submit emits canonical `patt/searchfield` plus scoped `f.form` and field keys.
  - Legacy search/explore URL generation remains unchanged.

- Add component/store tests for:
  - New simple form submit calls the new root-store path and updates BlackLab params.
  - Old outer submit/reset buttons are hidden only when the new simple form is active.
  - Extended, advanced, expert, filters, explore, history, and settings remain available.

## Assumptions

- The first migration target is simple search only; filters and other search modes stay legacy.
- New scoped `f.*` URLs are additive: canonical BlackLab params remain in URLs during migration.
- Old URLs that cannot be represented by the simple form should remain searchable through raw overrides instead of being lossy-converted.
