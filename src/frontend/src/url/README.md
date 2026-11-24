# Page state, URLs, and history

Search uses unidirectional data flow. Components read state from the feature instance and send edits to the owner. The URL is a projection of the submitted query and the selected result view. Vue Router handles browser navigation and path matching inside the navigation adapters; request composition and search components do not read it.

```text
editable form ──submit──> submitted search ─┐
result controls ────────> result stores ────┼──> API request
view tabs ─────────────> selected view ────┤
                                         └──> URL ──> saved history
initial load / Back / Forward / saved search ──> restore application state
```

| State                                                | Owner                                       | Changes                                    |
| ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| Editable draft                                       | Form runtime                                | Editing, submission, form restoration      |
| Submitted query                                      | `createSubmittedSearch()`                   | Submit, reset, incoming search             |
| Selected view                                        | Results instance (views)                    | Tab selection, submission, incoming search |
| Preferred page size                                  | Results instance (persisted preference)     | User preference                            |
| Global result controls                               | Results instance (global controls)          | Controls, incoming search                  |
| Each view's selection, grouping, sort, display state | Results instance (views)                    | Controls, submission, incoming search      |
| Expanded request range                               | Pure derivation of selection and preference | Never stored or serialized                 |
| Unknown URL parameters and hash                      | URL adapter                                 | Preserved from incoming search             |

The search feature creates the owners and connects them to two bindings. `features/search/bindings/search-form.ts` handles form submission, reset, and draft restoration. `url/search-state.ts` handles navigation and history publication. Corpus changes reset the owners together in `search-feature.ts`. The results instance exposes the effective API request as `results.parameters`, computed from the submitted snapshot, corpus, and selected view controls.

## State transitions

- **Submit:** capture the compiled form as a submitted query, apply its result presets, select the target view, and reset every view to the first preferred page. Later draft edits do not affect that snapshot.
- **Result control or tab change:** update the relevant store immediately. Switching views retains each view's selection. Requests derive from the selected view, while the URL projection catches up.
- **Initial load, browser navigation, or saved-search loading:** decode query and result settings synchronously, reset all views to defaults, then hydrate only the matched view. Restore the editable form asynchronously without replacing result controls. The form is visible for orientation during loading; input made before restoration finishes can be replaced.
- **Reset:** clear the submitted query and selected view and reset the form and result views.
- **Form runtime replacement:** restore the new form from the submitted search, preserving result settings. Changes to the submitted search, corpus, or runtime can supersede a restoration while the before-state-loaded hook runs.
- **Corpus change:** recreate the view modules and initialize the stores for the new corpus before publishing its context.

Eligibility belongs to the view. Every registered view stays selectable. A collocation query with `docs` selected displays the inactive-view message and makes no documents request.

## Pagination

A selection is `(first, number)`, with a nonnegative offset and positive count. For preferred page size `p`, the request starts at `floor(first / p) * p` and ends at `ceil((first + number) / p) * p`. The URL serializes the selection, never this expanded range.

An ordinary page satisfies `first % oldPreference === 0 && number === oldPreference`. Changing the preference moves that page to `floor(first / newPreference) * newPreference` with the new count. Other selections retain their bounds; no separate provenance flag is needed.

| Action                                   | Stored selection afterward          | Expanded request      |
| ---------------------------------------- | ----------------------------------- | --------------------- |
| Hydrate `(45,30)`, preference `20`       | `(45,30)`                           | `(40,40)`             |
| Ordinary `(40,20)`, preference `20 → 50` | `(0,50)`                            | `(0,50)`              |
| Custom `(45,30)`, preference `20 → 50`   | `(45,30)`                           | `(0,100)`             |
| Switch views                             | Each retains its selection          | Selected view's range |
| Submit new search                        | Every view becomes `(0,preference)` | First page            |

Each `ResultView` receives the persisted page-size preference from its results instance. Each view exposes `selectedRange` for its stored selection and `expandedRequestRange` for requests. Reset uses the same current preference.

Missing URL counts use the preference at hydration time. The preference is never imported from a URL. `results/pagination.ts` contains the range derivations, shared by view requests and preference changes.

## URL and history boundary

Search and article pages share `createUrlProjection`. On incoming navigation it stops publishing, lets the page restore URL-visible state synchronously, then watches for changes. Draft restoration can finish later. Each outgoing write carries an identity until navigation settles, so Back and Forward can restore that same entry on later visits.

`search-query.ts` reads and writes the submitted query, selected view controls, and extension parameters. Opening a link preserves its spelling and hash. When a shared link requests sampling without a seed, the search binding replaces the URL with the generated seed.

`search-state.ts` records a history entry after a successful publication. Opening a saved search restores its draft even if its URL is already current. Importing a link adds it to history and leaves the active search alone. `query-history.ts` decodes the grouping and query identity used for deduplication. The history store reconstructs missing summaries using the form runtime when it imports a URL.

The browser smoke suite exercises submissions, reloads, Back/Forward, saved searches, ordinary and custom pagination, preference persistence, tab selection, and collocations against BlackLab. Unit tests cover range invariants, URL normalization, snapshot isolation, and asynchronous restoration/navigation races.
