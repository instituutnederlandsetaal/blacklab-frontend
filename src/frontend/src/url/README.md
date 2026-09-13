# Page state, URLs, and history

Components read and change application state through the search stores. The URL is a projection of the submitted query and the selected result view. Vue Router handles browser navigation and path matching inside the navigation adapters; request composition and search components do not read it.

```text
editable form ──submit──> submitted search ─┐
result controls ────────> result stores ────┼──> API request
view tabs ─────────────> selected view ────┤
                                         └──> URL ──> saved history
initial load / Back / Forward / saved search ──> restore application state
```

| State                                                | Owner                                       | Changes                                    |
| ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| Editable draft                                       | Form runtime and legacy form stores         | Editing, submission, form restoration      |
| Submitted query                                      | `SubmittedSearch` ref created in `main.ts`  | Submit, reset, incoming search             |
| Selected view                                        | `InterfaceStore.viewedResults`              | Tab selection, submission, incoming search |
| Preferred page size                                  | Persisted global results store              | User preference                            |
| Global result controls                               | Global results store                        | Controls, incoming search                  |
| Each view's selection, grouping, sort, display state | View store                                  | Controls, submission, incoming search      |
| Expanded request range                               | Pure derivation of selection and preference | Never stored or serialized                 |
| Unknown URL parameters and hash                      | URL adapter                                 | Preserved from incoming search             |

`main.ts` wires the submitted-search ref to the root store and request composition, and supplies the history store's URL codec. It creates and provides article page state, then passes that state to the article URL binding. Both page bindings are installed here. Components consume the provided state and actions; neither page manages a binding's lifecycle. The legacy singleton stores remain in place; none needs router types or URL decoding helpers.

## State transitions

- **Submit:** capture the compiled form as a submitted query, apply its result presets, select the target view, and reset every view to the first preferred page. Later draft edits do not affect that snapshot.
- **Result control or tab change:** update the relevant store immediately. Switching views retains each view's selection. Requests derive from the selected view, while the URL projection catches up.
- **Initial load, browser navigation, or saved-search loading:** decode query and result settings synchronously, reset all views to defaults, then hydrate only the matched view. Restore editable forms asynchronously without replacing result controls. The form is visible for orientation during loading; input made before restoration finishes can be replaced.
- **Reset:** clear the submitted query and selected view and reset the form and result views.
- **Form runtime replacement:** restore the new form from the submitted search, preserving result settings. Submission, reset, another import, corpus changes, or another runtime replacement prevent an old asynchronous restoration from applying.
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

`createViewModule` receives its page-size preference explicitly; `main.ts` wires the legacy view registry to the persisted preference. Each view exposes `selectedRange()` for its stored selection and `expandedRequestRange()` for requests. Reset uses the same current preference.

Missing URL counts use the preference at hydration time. The preference is never imported from a URL. `results/pagination.ts` contains the range derivations, shared by view requests and preference changes.

## URL and history boundary

`createUrlProjection` provides the binding used by both `createSearchUrlBinding` and `createArticleUrlBinding`. Each adapter supplies its active corpus context, incoming-state reader, and outgoing-state writer. The binding observes serialized application state after Vue batches synchronous mutations, handles browser navigation and explicit saved-link loading, and stops observing when the page is inactive or the application unmounts. Article paging and hit selection use the same state-first flow as search controls.

A completed action produces one URL publication. Draft edits and inactive-view changes do not affect the search projection. A custom selection's preference change can update the request without changing the URL.

The projection watcher is detached during incoming hydration and attached afterward, so opening a link preserves its spelling, aliases, hash, and range without pushing another history entry. The exception is seedless sampling: hydration creates one seed in application state and replaces the URL with it.

`createUrlProjection` identifies an in-flight publication through an opaque browser history identity. Its own completed navigation never hydrates stores. Once the publication settles, revisiting that entry through Back or Forward imports it normally. When a newer navigation supersedes an earlier write, only the completed navigation adds a saved-history entry. There are no submission gates, rollbacks, or publication retries.

`SearchNavigation.open` restores a saved search, including when its URL is already current. Importing a link is a history action with a decoder supplied at the application entrypoint; it adds an entry without changing the current search or draft. Components use ordinary store actions for all other interactions. The old `vuexModules.root.actions.navigateSearch` wrapper remains only as a compatibility shim for customization scripts.

`search-query.ts` owns search URL decoding and serialization, including aliases, form persistence fields, result controls, and extension parameters. `submitted-search.ts` owns the submitted snapshot and its shared form-restoration computation. `search-form-restoration.ts` applies restored fields on incoming navigation or runtime replacement; `form/restore-legacy-form.ts` interprets the submitted query for legacy widgets. Neither needs URL syntax or router access. `search-summary.ts` derives summaries from the shared restoration and captured legacy summaries. Replacing a form runtime discards its draft without submitting, publishing a URL, or adding a history entry.

The history model owns entry construction, ordering, persistence, deduplication, and versioned file import/export. `url/query-history.ts` interprets URLs into history metadata and reconstructs display summaries for imported links. The application entrypoint supplies these decoders to history actions. Existing URL-based entries and exports remain readable. Form restoration and summary generation reuse the submitted query's form data when only pagination or result controls change.

Publishing a URL records its history entry synchronously. Legacy submissions capture summary strings from the submitted form; incoming legacy links reuse the form restoration that already runs on navigation. Only importing an external URL without a stored summary needs its own legacy parse. Reading saved entries from local storage uses their embedded summaries.

The browser smoke suite exercises submissions, reloads, Back/Forward, saved searches, ordinary and custom pagination, preference persistence, tab selection, collocations, and legacy forms against BlackLab. Unit tests cover range invariants, URL normalization, snapshot isolation, and asynchronous restoration/navigation races.
