# Legacy Reference

This file summarizes the old behavior that still matters as migration input.

## Old state layering that is still conceptually correct

Relevant files:

- `src/old-frontend/features/search/model/form/form-state.ts`
- `src/old-frontend/features/search/model/query-state.ts`
- `src/old-frontend/features/history/model/query-history-state.ts`

Important old idea:

- Live form state and submitted query state were separate.

Why it mattered:

- Users could edit the form without immediately replacing the current results.
- History entries could store the submitted form identity and state, not just raw query strings.
- Result views, grouping, and query identity could be derived from a stable submitted snapshot.

This should return in the new app.

## Old search form composition

Relevant files:

- `src/old-frontend/pages/search/form/QueryFormFilters.vue`
- `src/old-frontend/pages/search/form/QueryFormExplore.vue`
- `src/old-frontend/pages/search/form/SearchAdvanced.vue`
- `src/old-frontend/pages/search/form/Within.vue`

Important patterns:

- Filter UI was rendered dynamically from `componentName` plus filter definitions.
- Filter tabs and subtabs were logical groups, not hard-coded per field.
- Explore modes each had their own state and query-generation rules.
- Parallel search UI was shared across multiple query modes.

What is worth keeping:

- dynamic filter-definition rendering
- shared sections across modes
- clear separation between simple inputs, advanced builder, and raw expert editor

What is not worth repeating verbatim:

- hard-coded Vue component trees as the only composition mechanism
- tight coupling between UI restore logic and raw query parsing

## Old filter behavior layer

Relevant files:

- `src/old-frontend/components/filters/filterValueFunctions.ts`
- `src/old-frontend/components/filters/Filter.ts`
- `src/old-frontend/components/filters/*`

Key idea:

- A filter definition carried enough information for rendering and serialization, while `filterValueFunctions` provided the actual logic for parse, summarize, active-state, and Lucene generation.

Why it still matters:

- This is the cleanest old example of UI-agnostic field behavior.
- The new `_new/pages/search/form/filters/lib/filterValueFunctions.ts` already preserves this idea and should be promoted, not discarded.

## Old submission and results behavior

Relevant files:

- `src/old-frontend/features/search/model/query-state.ts`
- `src/old-frontend/features/search/model/results/*`
- `src/old-frontend/utils/grouping.ts`

Important behavior:

- Explore modes could submit not just query inputs but also result presets such as grouping and preferred result family.
- Hits were only available when a CQL pattern existed; docs were always available.
- Grouping, sorting, sampling, and paging lived alongside submitted query state.

Migration takeaway:

- Dynamic form registration is only half the system. It must feed a submitted-query and result-preset pipeline.

## Old URL and history hydration

Relevant files:

- `src/old-frontend/utils/luceneparser.ts`
- `src/frontend/src/_new/app/routes/urls/url-state-parser-search.ts` (commented migration copy)
- `src/old-frontend/features/history/model/query-history-state.ts`
- `src/old-frontend/pages/search/History.vue`

What the old system attempted:

- store raw CQL and Lucene in the URL
- parse those strings back into the best-fitting UI mode
- bail out to expert when full reconstruction was impossible
- persist rich history entries in local storage

Why it became a problem:

- some widgets do not map cleanly back from raw query strings
- the available widget set is corpus-dependent
- best-effort decompilation is inherently partial and brittle
- parse-back sometimes needed backend work in the critical URL-hydrate path

Migration rule:

- Keep raw query strings for universal portability.
- Stop treating raw strings as the primary restore mechanism for rich widget UIs.

## Old customization model

Relevant files:

- old `ui-customization-store`
- old customization helpers referenced from the new compatibility stores

Characteristics:

- heavily push-based
- depended on precise app initialization order
- mixed feature concerns in one broad surface

Migration rule:

- preserve capability, not mechanism
- move from mutable internal store access to explicit feature-level registration callbacks

## Legacy takeaways to preserve

- Separate draft form state from submitted query state.
- Allow shared logical sections between modes.
- Preserve filter behavior as a UI-agnostic layer.
- Preserve raw CQL/Lucene alongside richer state.
- Preserve result presets as part of submission, especially for explore forms.

## Legacy takeaways to reject

- reverse-engineering full widget state from raw query strings as the main restore path
- exposing internal stores as the public extension API
- relying on init-order-sensitive mutable globals for customization