# Current New Surface

This is the current implementation map in `_new`, grouped by responsibility.

## Runtime boot and customization timing

Relevant files:

- `src/frontend/src/_new/app/entrypoint/main.ts`
- `src/frontend/src/_new/app/plugins/installCorpusData.ts`
- `src/frontend/src/_new/app/plugins/installRoutePageBootstrapped.ts`
- `src/frontend/src/_new/app/plugins/effects/page-customization.effect.ts`
- `src/frontend/src/_new/app/interop/page-customization.ts`
- `src/frontend/src/_new/app/routes/router-options.ts`

Current behavior:

- Corpus metadata, page config, and tagset are loaded together through `installCorpusData.ts`.
- Custom CSS is inserted immediately after config is available.
- Custom JS is inserted either immediately or after the page marks itself bootstrapped, based on route meta.
- Search route currently uses immediate custom-script timing.
- Legacy globals are mostly gone. `window` now exposes only a very small surface such as `INDEX_ID`, `currentCorpusData`, `vueApp`, and `vueRoot`.

Implication for form registration:

- A future external API cannot rely on the old `window.vuexModules` surface.
- Registration needs its own stable runtime hook.
- Registration can safely be callback-based because page customization already inserts external scripts after config load.

## Search page status

Relevant files:

- `src/frontend/src/_new/pages/search/SearchPage.vue`
- `src/frontend/src/_new/pages/search/search-store.ts`
- `src/frontend/src/_new/pages/search/form/ui/QueryForm.vue`
- `src/frontend/src/_new/pages/search/form/ui/QueryFormSearch.vue`

What is actually live:

- Search page loads corpus data, initializes the search stores, and renders the form.
- The live form UI currently only renders the `search/simple` path.
- Results UI is commented out.
- Explore UI is commented out.
- Filters UI is commented out.
- History and settings dialogs are commented out.
- Submit logic is commented out.

Implication:

- There is no end-to-end query pipeline in `_new` yet.
- The current code is best viewed as state and utility scaffolding plus a minimal simple-search pilot.

## Stores that already exist

### Interface state

Relevant file:

- `src/frontend/src/_new/pages/search/form/store/interface-state.ts`

Owns:

- top-level form mode: `search | explore`
- active query subform
- active explore subform
- active results view
- active annotation tab
- active filter tab

Assessment:

- Small and usable.
- Good candidate to remain as UI navigation state even after registration exists.

### Pattern store

Relevant file:

- `src/frontend/src/_new/pages/search/form/store/pattern-store.ts`

Owns:

- shared parallel state: source, targets, alignBy, within, withinAttributes
- `simple` state
- `extended` state
- `advanced` query-builder state
- `expert` raw-query state

Assessment:

- This is one of the most valuable existing assets.
- It already models draft state separately from query serialization.
- It is still store-shaped around the old hard-coded modes, so it is not itself the future registry.

### Explore store

Relevant file:

- `src/frontend/src/_new/pages/search/form/store/explore-state.ts`

Owns:

- n-gram inputs
- frequency annotation selection
- corpora grouping preset

Assessment:

- Another useful draft-state container.
- Still hard-coded per explore mode.

### Filter store

Relevant file:

- `src/frontend/src/_new/pages/search/form/filters/store/filter-store.ts`

Owns:

- logical filter definitions keyed by `id`
- filter groups and subtabs
- active filter values
- custom filter registration via `registerFilterGroup()` and `registerFilter()`

Why it matters:

- This is already a mini registry.
- A filter is defined by logical metadata, a render key (`componentName`), and a behavior key (`behaviourName`).
- Custom tabs and custom span filters are already supported.

Assessment:

- This is the clearest prototype for the lower layer of the future registration system.

## Serialization and reusable logic

### Filter behavior layer

Relevant file:

- `src/frontend/src/_new/pages/search/form/filters/lib/filterValueFunctions.ts`

Provides:

- decode from parsed URL state into widget value
- serialize filter value into Lucene
- human-readable filter summary
- active-state checks
- special span-filter behavior using `behaviourName`

Assessment:

- This is exactly the kind of UI-agnostic leaf-controller logic worth preserving.
- It should likely become a formal controller or driver interface in the new system.

### Pattern serialization layer

Relevant file:

- `src/frontend/src/_new/pages/search/form/utils/pattern-utils.ts`

Provides:

- simple and extended annotation value serialization to CQL
- parallel query assembly
- within-clause derivation from filters and within widget state
- explore query serialization
- query-builder and expert serialization bridge

Assessment:

- This is the existing submission core for pattern generation.
- It should be reused behind a registration facade instead of rewritten immediately.

### Query builder model

Relevant file:

- `src/frontend/src/_new/widgets/cql-query-builder/model.ts`

Provides:

- typed builder state model
- CQL generator
- parser bridge from parsed BCQL JSON back into builder state

Assessment:

- Strong candidate to remain an internal built-in field driver.
- Important proof that a widget can have its own rich opaque state shape and still emit raw CQL when needed.

## UI building blocks already present

### Annotation widget

Relevant file:

- `src/frontend/src/_new/pages/search/form/annotations/Annotation.vue`

What it does:

- renders a concrete annotation input based on annotation metadata
- handles select, autocomplete, case sensitivity, uploads
- writes directly into the pattern store

Assessment:

- Good reusable UI primitive.
- Still too coupled to the current store shape to be the public abstraction.
- In a future registry it should become an internal renderer for an `annotation` field driver.

### Corpus-driven field grouping helpers

Relevant file:

- `src/frontend/src/_new/shared/blacklab-helpers/field-groups.ts`

What it does:

- converts annotation and metadata groups into grouped option lists
- already supports search, group-by, and sort-by option generation

Assessment:

- This should stay a shared utility behind registration callbacks.

## Customization surfaces still in play

### Push-based UI customization store

Relevant file:

- `src/frontend/src/_new/pages/search/config/ui-customization-store.ts`

Current role:

- giant mutable config object for search, explore, results, dropdowns, and some helper methods
- validates customization state after corpus load
- still exposes global customization entry points

Assessment:

- Useful as a compatibility layer and corpus-derived defaults source.
- Not a good long-term public API boundary.
- The file itself documents why its current init-order model is problematic.

### Callback customization store

Relevant file:

- `src/frontend/src/_new/pages/search/config/customization-callback-store.ts`

Current role:

- proxy-wrapped callback hooks with fallback behavior
- supports custom search metadata tabs and span filters

Assessment:

- Closer to the desired timing model than the push store.
- Still too broad, too dynamic, and too error-prone to be the final form-registration API.

## Results and URL state in `_new`

Relevant files:

- `src/frontend/src/_new/pages/search/search-store.ts`
- `src/frontend/src/_new/app/routes/urls/url-state-parser-search.ts`
- `src/frontend/src/_new/app/routes/urls/state-to-url.ts`
- `src/frontend/src/_new/app/plugins/effects/url-sync/index.ts`
- `src/frontend/src/_new/app/plugins/effects/url-state-sync.ts`
- `src/frontend/src/_new/features/totals/*`

Current reality:

- The totals loaders and result-count helpers are implemented and reusable.
- The broader search submission, result-view stores, URL parsing, and URL reflection paths are still commented out or absent.

Implication:

- The future registration work must explicitly include a submitted-query pipeline.
- There is no hidden finished results architecture waiting to be plugged in.

## Bottom line on the current `_new` surface

Pieces worth building on:

- `pattern-store.ts`
- `explore-state.ts`
- `filter-store.ts`
- `filterValueFunctions.ts`
- `pattern-utils.ts`
- `widgets/cql-query-builder/model.ts`
- `field-groups.ts`
- the new page customization timing path

Pieces that are still transitional scaffolding:

- `search-store.ts` submission flow
- `QueryForm.vue` and `QueryFormSearch.vue` commented sections
- route URL parsing/reflection code
- the broad mutable `ui-customization-store.ts` as a public extension surface