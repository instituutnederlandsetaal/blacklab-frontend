# Form System Migration Notes

This document captures the first production integration of the new form system:
simple search behind `useNewSearchForm`. It is meant as a practical map for the
next migration steps, not as a full form-system reference.

## Key Decisions

- The new form system is integrated through one shared `FormBuilder` instance.
  `createSearchFormSystem()` creates a computed definition from the loaded
  corpus, tagset, BlackLab API, and i18n translator. The same definition is
  used by the search UI and by URL parsing/restoration.

- The submitted query remains mostly legacy-shaped. A new-form submit is stored
  as normal `search/simple` query state with an attached compiled snapshot
  (`newForm`) instead of introducing a new top-level query form enum. This keeps
  history, viewed-results logic, and most legacy state consumers working while
  allowing compiled form output to drive BlackLab params.

- URLs are intentionally dual-format during migration. New-form URLs include
  canonical BlackLab params (`patt`, `filter`, `searchfield`) plus scoped
  `f.*` params. Canonical params keep links interoperable; `f.*` is the
  authoritative form UI state.

- New-form submissions emit `searchfield`, not `field`, for the searched
  annotated field. URL parsing remains lenient and accepts `searchfield`,
  historical `searchField`, and legacy `field`.

- Old canonical URLs are restored conservatively. If an old URL is clearly a
  simple search, the parser seeds the new simple form. If not, canonical params
  are restored as raw overrides, so the query remains searchable without
  pretending the current form can faithfully edit it.

- The old outer search form becomes a `div` while the new simple form is active.
  This avoids nested HTML forms because `FormSystem` renders its own submit
  boundary.

## URL Data Flow

### New Form To URL

1. `FormSystem` submits a `CompiledFormStateWithSummaries`.
2. `RootStore.actions.searchFromNewFormSubmit(snapshot)` stores the compiled
   snapshot on `QueryStore` as `query.newForm`.
3. `RootStore.get.blacklabParameters()` reads compiled `patt`, `filter`, and
   `searchfield` from the snapshot. It suppresses legacy `field` for new-form
   submissions.
4. `url-state-sync` observes the store, calls `stateToUrl()`, and passes
   `QueryStore.get.scopedFormQuery()`.
5. `stateToUrl()` merges `snapshot.encoded` into the query string, producing
   URLs with canonical params and scoped `f.*` params.

### URL To New Form

1. `url-state-sync` constructs `UrlStateParserSearch` with the shared
   `FormBuilder`.
2. `UrlStateParserSearch.get()` parses canonical CQL as before, then calls the
   new-form restore path.
3. If `f.*` params exist, `restoreScopedFormState(builder, params, canonical)`
   restores field state and records raw overrides for any canonical params the
   form cannot reproduce.
4. If `f.*` params are absent but the legacy URL is a plain simple search, the
   parser builds a minimal scoped query and restores that into the builder.
5. Otherwise, canonical params become raw overrides. The form remains useful as
   a display/submit host, but locked fields indicate that the URL contains query
   state outside the form's editable surface.

## In-App History Flow

- When URL reflection pushes a search URL, `toBrowserHistoryEntry()` still
  creates a legacy-shaped history entry. The attached browser history state is
  useful for fast restore, but search routes with a new form are reparsed from
  the URL on popstate so the shared builder receives the latest `f.*` state.

- Query history display uses the normal summary path. For new-form submissions,
  `QueryStore.get.patternSummary()` reads the submitted form summaries. If no
  summary is available, history falls back to the canonical pattern string.

- Loading an entry from the history modal reparses the entry URL when available.
  This ensures `f.*` params restore into the form builder instead of only
  replacing legacy store state.

- Importing saved query files also reparses the saved URL whenever a new form
  definition is available, even if the saved history version is current. This is
  necessary because the serialized history entry does not contain live
  `FormBuilder` state.

## Extending The Migration

- Prefer adding the next form segment to `createSearchFormSystem()` before
  introducing generic host abstractions. The current integration is deliberately
  direct: build concrete nodes, submit compiled snapshots, and keep legacy
  state only where it still feeds unmigrated screens.

- Keep `f.*` keys stable as soon as a segment is exposed. Treat controller
  `getPersistKey()` output as URL contract, not as internal implementation
  detail.

- For each migrated segment, decide whether old canonical URLs can be restored
  exactly. If exact restoration is not obvious, use raw overrides first and add
  smarter canonical-to-scoped conversion later.

- Migrate submit behavior segment by segment. The current new-form submit path
  assumes simple search and clears filters/gap. Filters, extended search,
  expert search, and explore modes should each get explicit behavior when they
  move, rather than inheriting accidental simple-search rules.

- Keep canonical params in generated URLs until the full search surface has
  moved. They are still useful for external links, older frontends, and result
  requests that do not understand scoped form state.

- Add tests at the URL boundary for every segment:
  scoped restore, canonical fallback/raw override behavior, generated canonical
  params, and generated `f.*` params. These catch most migration regressions
  without requiring broad UI tests.

- Watch out for nested forms whenever a migrated form renders inside legacy
  search containers. Either let `FormSystem` own the submit boundary or make the
  legacy wrapper non-form for that mode.
