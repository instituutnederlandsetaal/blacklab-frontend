---
title: 🧪 New search customization API
---

# New search customization API (experimental)

<!-- @include: _custom_js_tip.md -->

## External API

Custom JavaScript uses the global `frontend` object. The new API has two functions:

- `frontend.customizeSearchForm(...)` changes the built-in search forms.
- `frontend.customizeSearchResults(...)` changes search requests, result data, exports, sorting, and grouping.

The functions take callback functions or objects containing callback functions. The callbacks receive corpus, form, or result data. The form API also provides functions for creating and changing form nodes. Both APIs are experimental.

The existing `frontend.customize(...)` API still works. Use the new functions for new search customizations.

## Type declarations

The frontend serves the declaration file at:

```text
${CONTEXT_URL}/js/customization-api/index.d.ts
```

Download the declaration file from the same frontend version you deploy. For a JavaScript file, enable checking and reference the local file:

```js
// @ts-check
/// <reference path="./blacklab-frontend-customization-api.d.ts" />

frontend.customizeSearchForm(form => {
	form.setExtendedAnnotations(['word', 'lemma', 'pos']);
});
```

The declaration file is also available in the `.d.ts` and `.tgz` files attached to GitHub releases. A project with `package.json` can install the package:

```sh
npm install --save-dev https://github.com/instituutnederlandsetaal/blacklab-frontend/releases/download/v5.0.0/blacklab-frontend-customization-api-5.0.0.tgz
```

Then reference it with:

```js
/// <reference types="@instituutnederlandsetaal/blacklab-frontend-customization-api" />
```

Pin the declarations to the deployed frontend version. If a changed script is served from the same URL, add a query string such as `custom.search.js?v=2` to avoid a cached copy.

## Search forms

The form API has two parts:

- `configure` runs before the built-in form nodes are created. Use it to change the built-in fields and defaults in the predifined ways we have builtin support for.
- `customize` runs after the built-in form has been created. Use it to change the form nodes themselves, add custom fields or even add/remove entire form sections, and generally do custom things the standard form configuration options can't express.

A callback passed directly is the same as `configure`:

```js
frontend.customizeSearchForm(form => {
	form.setSimpleAnnotation('word');
	form.setExtendedAnnotations(['word', 'lemma', 'pos']);
	form.setAnnotationControl('word', 'autocomplete');
	form.setMetadataFilters(['author', 'title']);
	form.configureWithin({ enabled: false });
});
```

The available configuration functions are:

| Function                                      | What it changes                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `setSimpleAnnotation(id)`                     | Annotation used by Simple search.                                                              |
| `setExtendedAnnotations(ids)`                 | Annotations available in Extended search.                                                      |
| `setAnnotationControl(id, control, fieldId?)` | Control used for an annotation: `auto`, `text`, `autocomplete`, `select`, `pos`, or `lexicon`. |
| `configureAdvanced(options)`                  | Advanced search visibility, annotations, and default annotation.                               |
| `setMetadataFilters(ids)`                     | Metadata fields used by the standard filters.                                                  |
| `filterMetadataFields(fn)`                    | Metadata fields shown in search and Explore.                                                   |
| `configureWithin(options)`                    | Within elements and attributes.                                                                |
| `configureAlignBy(options)`                   | Align-by elements and default.                                                                 |
| `configureExplore(options)`                   | Explore annotations, groups, and corpus metadata groups.                                       |
| `configureLexicon({ database })`              | Lexicon database.                                                                              |
| `addSpanFilter(options)`                      | A filter for a span element attribute.                                                         |

Unknown annotation and metadata IDs are ignored and logged to the console. If a default is not in the available list, the first available value is used.

`filterMetadataFields` only affects search fields and Explore. To change metadata fields in result sorting and grouping menus, use `includeMetadataField` in `customizeSearchResults` as well.

### Span filters

`addSpanFilter` adds a filter for a span attribute. `auto` uses a select when BlackLab supplies a complete list of values, and a text input otherwise.

```js
frontend.customizeSearchForm(form => {
	form.addSpanFilter({
		elementName: 'speech',
		attributeName: 'speaker',
		control: 'auto',
		groupId: 'Speakers',
		defaultDisplayName: 'Speaker',
	});

	form.addSpanFilter({
		elementName: 'ab',
		attributeName: 'verse',
		control: 'range',
		groupId: 'Chapter and verse',
	});
});
```

A span filter requests span data when it is active. It does not automatically add the attribute to the Group By menu. Use `includeGroupingSpanAttribute` for that.

### Changing the form

The second phase receives `form.graph`, which contains the built-in form nodes. Use `form.graph` to find, remove, replace, or move nodes. Use the constructors on `form` to create nodes.

```js
frontend.customizeSearchForm({
	configure(form) {
		form.setMetadataFilters(['place']);
	},
	customize(form) {
		const year = form.metadataMultiFieldRange(
			{ id: 'witness-year', defaultDisplayName: 'Witness year' },
			{
				id: 'witness-year',
				groupId: 'Date',
				fromField: 'witness_year_from',
				toField: 'witness_year_to',
				inputType: 'number',
			},
		);

		const filters = form.graph.getContainer(form.ids.sharedFilters());

		const tabId = form.ids.filterTab('Date');
		const tab = form.graph.getContainer(tabId) ?? form.newContainer(tabId, { title: 'Date' });
		tab.addChildren(year);
		if (!filters.children.some(child => child.id === tabId)) filters.prependChild(tab);
	},
});
```

`form.ids` provides stable IDs for standard nodes. The constructors include annotation, metadata, within-attribute, container, and form constructors. See the declaration file for all arguments. This lets you easily get the standard builtin fields.

`form.corpus` is the complete corpus information object, containing all the info about available annotations, metadata, etc. It is read-only. Result callbacks receive the same corpus object.

## Search results

`customizeSearchResults` accepts these hooks:

| Hook                           | What it changes                                                       |
| ------------------------------ | --------------------------------------------------------------------- |
| `withSpans`                    | Sets `withspans`, or decides from the final BCQL query.               |
| `includeMetadataField`         | Shows or hides a metadata field in result sorting and grouping menus. |
| `highlightStyle`               | Returns `none`, `static`, or `hover` for a capture or relation.       |
| `hitInfoColumn`                | Adds a result column and returns its text.                            |
| `exportDescription`            | Returns the description used for an export.                           |
| `includeExportSpanAttribute`   | Includes or excludes a span attribute from exports.                   |
| `customizeSorting`             | Changes a sorting option group.                                       |
| `includeGroupingSpanAttribute` | Includes or excludes a span attribute from Group By.                  |
| `customizeGrouping`            | Changes a grouping option group.                                      |

For the include and style hooks, return `null` to leave the decision to another customization or the default. For `withSpans`, a callback returns `true`, `false`, or `null`:

```js
frontend.customizeSearchResults({
	withSpans: query => (query.includes('within <ab/>') ? true : null),
	includeMetadataField: field => field.id !== 'internal_id',
	highlightStyle: section => (section.kind === 'relation' ? 'hover' : 'static'),
	includeGroupingSpanAttribute: ({ elementName, attributeName }) => (elementName === 'ab' && attributeName === 'chapter' ? true : null),
});
```

Sorting and grouping callbacks receive an option group. Return a replacement group or `null` to leave it unchanged. The grouping callback also receives translation helpers:

```js
frontend.customizeSearchResults({
	customizeSorting(group) {
		return {
			...group,
			options: group.options.filter(option => typeof option === 'string' || option.value !== 'doc:internal_id'),
		};
	},
	customizeGrouping(group, translate) {
		return group;
	},
});
```

### Result callback data

Result data passed to callbacks is read-only. The main callback arguments are:

- `hitInfoColumn.content({ corpus, hit, spans, field, document })`: the hit, its tag spans, the annotated field, and the document.
- `hitInfoColumn.visible(overview)`: result statistics and either hits with documents or hit groups.
- `exportDescription({ corpus, sourceField, targetFields, bcql, summary })`: fields and the complete search summary.
- `highlightStyle(section)`: capture or relation offsets and names.

Metadata and span attribute values are arrays, so select a value explicitly:

```js
frontend.customizeSearchResults({
	hitInfoColumn: {
		content({ spans, field, document }) {
			const verse = spans.find(span => span.tagName === 'ab')?.attributes?.['chapter-verse']?.[0];
			const book = document.metadata.bookId?.[0];
			return [field.displayName, book, verse].filter(Boolean).join(' ');
		},
	},
});
```

## Multiple scripts

Both registration functions return a function that removes the registration:

```js
const unregister = frontend.customizeSearchResults({
	withSpans: true,
});

unregister();
```

Callbacks run in registration order. Result selectors use the newest callback first; returning `null` continues to the next callback and eventually to the default. For functions that always must return a value (e.g. `hitInfoColumn` or `exportDescription`), the newest registration is used.

Registrations belong to the script that created them. They are removed when that script is disposed or when the corpus changes. Register customizations synchronously, not from within an asynchronous callback, this may cause errors or cause the customization to be ignored.

Errors in callbacks are logged to the console. Other callbacks still run where possible.

## Moving from `frontend.customize`

| Old API                                            | New API                                                        |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `search.pattern.uiType(...)`                       | `customizeSearchForm` → `setAnnotationControl(...)`            |
| `search.metadata.showField(...)` for search fields | `customizeSearchForm` → `filterMetadataFields(...)`            |
| `search.metadata.showField(...)` for result menus  | `customizeSearchResults` → `includeMetadataField(...)`         |
| `search.within.includeSpan/includeAttribute`       | `customizeSearchForm` → `configureWithin(...)`                 |
| `createSpanFilter(...)` + `addCustomTab(...)`      | `customizeSearchForm` → `addSpanFilter(...)`                   |
| `search.pattern.shouldAddWithSpans(...)`           | `customizeSearchResults` → `withSpans`                         |
| `results.matchInfoHighlightStyle(...)`             | `customizeSearchResults` → `highlightStyle(...)`               |
| `customHitInfo(...)`                               | `customizeSearchResults` → `hitInfoColumn`                     |
| `results.export.description(...)`                  | `customizeSearchResults` → `exportDescription(...)`            |
| `results.export.includeSpanAttribute(...)`         | `customizeSearchResults` → `includeExportSpanAttribute(...)`   |
| `group.includeSpanAttribute(...)`                  | `customizeSearchResults` → `includeGroupingSpanAttribute(...)` |
| `sort.customize(...)`                              | `customizeSearchResults` → `customizeSorting(...)`             |
| `group.customize(...)`                             | `customizeSearchResults` → `customizeGrouping(...)`            |

The old API will remain available for the forseeable future, but will eventually be removed. Avoid using an old and a new hook for the same setting. Modern form settings take precedence over old form settings. For result selectors, returning `null` lets the old behavior decide when no newer callback returns a value. A registered `hitInfoColumn` or `exportDescription` replaces the corresponding old callback.

There is no new hook for split-batch searches when `splitBatch.enabled` is true. Concordance rendering and article/document-page callbacks are not covered yet either; check back later and keep using the old API for those features for now.
