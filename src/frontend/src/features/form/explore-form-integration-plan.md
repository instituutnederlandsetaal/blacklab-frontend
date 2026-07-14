## Bottom line

Documents should be integrated as a normal new-form boundary whose field contributes no BlackLab query, but whose form resolves a dynamic result preset. Shared filters continue to produce the Lucene filter.

The existing scaffold is close on UI and `f.*` persistence, but four integration pieces are missing:

1. Legacy Explore customization is absent from `SearchFormConfiguration`.
2. `ResultPreset` exists only as a type; compilation and submission ignore it.
3. New-form history/interface identity currently assumes every new form is a Search form.
4. Legacy canonical Documents URLs cannot hydrate the new field state.

There is also a current regression: commit `25cb66d2` removed the old submit-time Explore preset handling. Consequently, the legacy Documents form currently selects the docs view but does not apply its chosen grouping or display mode.

## Legacy customization inventory

| Capability         | Legacy source and behavior                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grouping choices   | `results.shared.groupMetadataIds`; validated against corpus metadata, preserving configured metadata/group order. Falls back to metadata in visible corpus groups.       |
| Default grouping   | `explore.defaultGroupMetadataId`; automatically changed to the first available grouping field if invalid or excluded. The stored result value is prefixed with `field:`. |
| Group labels       | `dropdowns.groupBy.metadataGroupLabelsVisible` controls the small metadata-group suffixes. Labels and group names are localized.                                         |
| Per-field callback | `corpusCustomizations.search.metadata.showField(id)` can hide an allowed grouping choice. It cannot force-add a field omitted from `groupMetadataIds`.                   |
| Display mode       | Fixed choices: `table`, `docs`, `tokens`. Not customizable. Default is hardcoded to `table`.                                                                             |
| Filters            | All Explore forms inherit the complete filter panel: `search.shared.searchMetadataIds`, metadata grouping/order, `showField`, custom tabs, and custom span filters.      |
| Availability       | Documents is always shown; there is no legacy enable/disable option. It does not require a source version for parallel corpora.                                          |

The visible form and option construction are in [QueryFormExplore.vue](/Users/koen/workspace/blacklab-frontend/src/frontend/src/pages/search/form/QueryFormExplore.vue:17). The customization state and validation live in [ui-state.ts](/Users/koen/workspace/blacklab-frontend/src/frontend/src/app/state/ui-state.ts:93). The documented public API is summarized in [08_explore.md](/Users/koen/workspace/blacklab-frontend/docs/src/030_customizing_the_interface/04_search_form/08_explore.md:17).

One important parity issue: the new shared-filter builder currently supports ordinary metadata fields, but not all legacy custom tabs/span-filter definitions.

## How legacy URL persistence worked

On submit, the flow was:

```text
Explore.corpora draft state
  → submitted legacy query snapshot
  → docs result-view state
  → canonical URL + history entry
```

The relevant persisted URL state was approximately:

```text
/{corpus}/search/docs
?group=field:date
&groupDisplayMode=table
&filter=...
&interface={"form":"explore","exploreMode":"corpora",...}
```

- `/search/docs` selected the results view.
- `group` and `groupDisplayMode` represented the actual result state.
- `filter` represented selected document filters.
- `interface` preserved the originating form/mode and draft filter tab.
- Browser/query history additionally stored the complete `explore.corpora` form state and docs view state.

Restoration happens in [url-state-parser-search.ts](/Users/koen/workspace/blacklab-frontend/src/frontend/src/url/url-state-parser-search.ts:346). Without an `interface` hint, it recognizes Documents when the path selects `docs`, grouping is present, and there is no pattern. It restores the first group and falls back to `table` when `groupDisplayMode` is absent.

The new form system adds authoritative scoped state:

```text
f.form=explore.corpora
f.explore-corpora=field:date
f.explore-corpora=table
```

The scaffolded codec already round-trips those two values in [explore-corpora-field.ts](/Users/koen/workspace/blacklab-frontend/src/frontend/src/features/form/fields/explore/explore-corpora-field.ts:22). Canonical `group` and `groupDisplayMode` should remain in generated URLs for legacy links and non-form consumers.

## Result-preset flow

Historically, submission explicitly:

1. Reset result views.
2. Selected `docs`.
3. Set docs `groupBy` from the form.
4. Set docs `groupDisplayMode`.
5. Snapshot the query and generate the URL/history entry.

The current [root-store.ts](/Users/koen/workspace/blacklab-frontend/src/frontend/src/app/state/root-store.ts:171) now only chooses `docs` because Documents has no pattern. It never copies grouping/display state.

The new system defines `ResultPreset` in [form-shape.ts](/Users/koen/workspace/blacklab-frontend/src/frontend/src/features/form/model/types/form-shape.ts:38), but [compileFormNode()](/Users/koen/workspace/blacklab-frontend/src/frontend/src/features/form/model/persistence.ts:356) does not read it, and nothing consumes it after submission. It is currently dead API.

## Recommended integration

1. Extend `SearchFormConfiguration` with:

```ts
explore: {
  corpora: {
    groupMetadataIds: string[];
    defaultGroupMetadataId: string | null;
    metadataGroupLabelsVisible: boolean;
  };
}
```

Apply `showField` when building options, and give the controller configuration-backed defaults rather than its current `null/null` defaults.

2. Build `explore.corpora` as an independent form containing:

- `ExploreCorporaField`
- the shared filters node
- fields that contribute the result preset through the query IR

Conceptually:

```ts
queryFragment({
	resultPreset: {
		viewedResults: 'docs',
		groupBy: state.groupBy ? [state.groupBy] : [],
		groupDisplayMode: state.groupDisplayMode ?? 'table',
		sort: null,
	},
});
```

The preset follows the same `getQueryContribution`/`QueryIR` path as the rest of the compiled submission state.

3. Add the resolved preset to the compiled submit snapshot. On fresh submit, `root-store` should apply it after resetting views and before results refresh. Do not reapply it during history/popstate restoration—the persisted view state may contain later user changes and should win.

4. Generalize the host integration:

- Render `FormSystem` inside the Documents pane.
- Hide the legacy external filter panel while that form is active.
- Avoid the outer nested `<form>`.
- Preserve the Explore “over five million tokens” confirmation in [QueryForm.vue](/Users/koen/workspace/blacklab-frontend/src/frontend/src/pages/search/form/QueryForm.vue:122).

5. Derive submitted interface identity from `snapshot.formId`. Currently new-form history is always recorded as `form: 'search'` in [url-state-sync.ts](/Users/koen/workspace/blacklab-frontend/src/frontend/src/url/url-state-sync.ts:115), and [state-to-url.ts](/Users/koen/workspace/blacklab-frontend/src/frontend/src/url/state-to-url.ts:49) samples the live interface instead of the submitted new form. Both will misidentify `explore.corpora`.

6. Add a legacy URL adapter: when the old parser identifies `explore/corpora` and no `f.*` state exists, synthesize scoped state from canonical `group` and `groupDisplayMode` before calling `restoreFormState()`.

Priority-wise, I would implement result-preset compilation/consumption and submitted form identity first; without those, the scaffold can render and persist its controls but cannot reproduce the actual Documents behavior. No files were changed during this investigation.
