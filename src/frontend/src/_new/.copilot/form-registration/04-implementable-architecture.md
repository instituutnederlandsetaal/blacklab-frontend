# Implementable Architecture

This is the recommended design for dynamic form registration in `_new`.

## Design principles

- Prefer a tree-shaped composition model for UI definitions.
- Store presentation metadata on nodes when it simplifies the implementation.
- Container presentation is bounded and boring: list, tabs, small-tabs, a class escape-hatch for styling.
- Leaf node presentation can be richer: headings, form summary, etc.
- Draft state is unified by controller identity. A controller may contribute Lucene, CQL, both, or neither.
- Forms are the submit and state boundary.
- Leaf controllers own their own draft state shape, summaries, and query contributions.
- Parent containers own sibling combine semantics.
- Submission produces both raw BlackLab parameters and opaque UI state.
- Restore uses opaque state first and raw strings as fallback.
- A persistence codec is a first-class architectural concern, not a late add-on.
- Non-field built-in UI nodes such as summaries and totals are first-class.
- External scripts can compose built-in controllers through a typed callback API.
- Internal Vue code owns final rendering.
- External configuration may choose from a bounded set of primitives, but not arbitrary components or DOM layout.

## Proposed conceptual layers

### 1. Registration and composition layer

Responsibility:

- collect external and built-in form registrations
- validate them against the current corpus
- materialize an immutable composition tree for the active corpus

Input sources:

- built-in registrations shipped in `_new`
- external callbacks registered by custom scripts
- corpus metadata and page config

Important property:

- this layer should be recomputable when corpus or registrations change
- it should not depend on mutating internal stores directly

### 2. Form-state, query-artifact, submission, and persistence layer

Responsibility:

- hold widget or controller state while the user edits a form
- track active form and nested container selections
- build query artifacts and projections from a submitted form
- encode and decode browser history, in-app history, and URL state

Target shape:

- one `FormState` per registered form
- controller state keyed by controller ID. Controllers may appear multiple times per form, with shared state.
- one small UI-state map per form for active nested containers such as tabs
- one submitted snapshot that stores `form + formState + compiled query projections`

Migration note:

- early migration spikes may temporarily adapt `pattern-store.ts`, `explore-state.ts`, `filter-store.ts`, and `interface-state.ts`
- that is a migration tactic, not the intended final boundary

### 3. Rendering and runtime-context layer

Responsibility:

- render the composition tree using internal Vue components
- provide read-only runtime context to fields and views
- expose convenience composables such as `useParentForm()` for derived views
- never expose arbitrary Vue component references to external scripts

## Composition primitives

The composition model should use four primitives.

### `container`

Purpose:

- simple structural grouping
- tab switching
- CSS-driven horizontal or vertical lists

Allowed children:

- `container`
- `form`
- `field`
- `view`

Core built-in presentation properties:

- `presentation: 'list' | 'tabs' | 'small-tabs'`
- `class?: string` escape hatch for horizontal/vertical layer, and customization.
- `title?` so user can provide context without being required to add i18n entries

Notes:

- The page will typically contain one or more levels of `container` before the actual forms. E.g. `search` vs `explore`, and inside that `simple/extended/advanced/expert` and `corpus/n-gram/statistics`
- A `container` inside a form is just nested presentation.

### `form`

Purpose:

- define the submit boundary
- wrap a root list container with non-optional internal actions such as submit and reset

Allowed parent:

- must not have a parent form
- should appear directly under a `container`

Allowed children:

- `container, field, view` nodes

Core built-in presentation properties:

- `class`
- `title`
- optional simple layout props passed through to the implicit root container

### `field`

Purpose:

- terminal query-generating controller node

Invariant:

- a `field` cannot exist outside a form

Typical properties:

- `controllerKind`
- small renderer variant hints such as `variant: 'large' | 'inline'`

### `view`

Purpose:

- terminal non-query node such as a heading, summary, totals panel, or toolbar

Typical properties:

- `viewKind`
- view-specific configuration

Notes:

- some views are self-contained and presentation-only, such as headings
- some views require read access to the parent form, such as summary and totals panels

## Limited node-level presentation model

The goal is not to reintroduce a layout DSL. The goal is to stop paying the complexity cost of a separate attachment model for a very small presentation vocabulary.

Rules:

- keep presentation props on the nodes themselves
- keep the presentation prop set intentionally tiny
- prefer CSS classes and internal renderers for the final look
- if a later use case needs richer placement semantics, add them deliberately rather than pre-optimizing now

This is a practical compromise: less pure than a strict logic and presentation split, but much easier to reason about.

## Sharing Fields

Fields and containers are "global" and separately registered from forms
A form simply contains one or more containers, keyed by their ID.
Two forms containing the same container or Field will render that instance from the same state.

Example strategy:

- both `extended` and `expert` may render “the same filters”
- they do this by including the global filters container, e.g. `shared.filters`
- reusable helper functions can generate the default containers and field structures that the forms can then reference

## Field controllers and view nodes

Each `field` node should be backed by a built-in controller or driver.

Minimum controller responsibilities:

- create default draft state
- validate corpus compatibility
- contribute query fragments or wrappers
- restore from opaque payload
- provide optional human-readable summary entries

Suggested built-in controller families:

- annotation input
- filter input
- within selector
- parallel source selector
- parallel target selector
- align-by selector
- query builder
- expert raw query editor
- explore n-gram builder
- explore frequency selector
- explore corpora preset

Suggested built-in view-node families:

- heading
- summary panel
- totals panel

The `summary` view is intentionally a small exception: it is not self-contained in the same way as a heading, but its dependency is very limited. It needs read access to the parent form.

Future extension point:

- internal code may later support custom controller registration
- do not make that part of the first external API unless a real use case demands it

## Runtime context and `useParentForm()`

Built-in renderers, fields, and views need a small read-only runtime context.

Recommended core composable:

- `useParentForm()`

It should expose computed read-only access to:

- `formId`
- `formState`
- `filter-summary`, `query-summary`, `filter`, `query`
- current corpus metadata
- currently active nested container selections

This is enough for the odd-but-important cases:

- a filter summary view can call `useParentForm()['filter']`
- a totals view can use the same projection to drive `FilteredResultCountLoader`
- a heading view does not need form context at all

Fields should generally use controller-specific helpers instead of rummaging through the entire form state directly, but the form context must still exist as an escape hatch for carefully bounded built-in cases.

## Draft and submitted state model

Recommended shape:

```ts
type FormState = {
	controllerState: Record<string, unknown>;
	uiState: {
		activeContainers: Record<string, string | null>;
	};
};

type DraftSearchState = {
	activeForm: string;
	forms: Record<string, FormState>;
};

type SubmittedSearchState = {
	form: string;
	state: FormState;
	compiled: {
		cql: string | null;
		filter: string | null;
		searchField: string | null;
		resultPreset?: {
			viewedResults?: 'hits' | 'docs' | string;
			groupBy?: string[];
			sort?: string | null;
			groupDisplayMode?: string | null;
		};
	};
	schemaVersion: string;
};
```

Why both are needed:

- the submitted snapshot is centered on `form + form state`, which keeps the model aligned with the actual submit boundary
- `compiled` is portable and always interpretable by the backend or expert fallback
- `state` is what lets the UI restore without decompiling raw query strings
- `uiState` preserves selected nested tabs and subforms all the way down

## Query artifact and projections

The accumulator model should not be a narrow purpose-built object that permanently limits expressiveness.

Recommendation:

- accumulate into a minimal internal query artifact with separate pattern and filter trees plus wrapper requests
- keep simple helpers for common leaf cases
- let parent containers decide how sibling contributions combine
- allow advanced controllers to emit raw subtrees at their own boundary when necessary

Minimal shape:

```ts
type QueryArtifact = {
	pattern: PatternNode | null;
	filter: FilterNode | null;
	wrappers: QueryWrapper[];
	resultPreset: Partial<ResultPreset>;
	summaries: SummaryEntry[];
};

type PatternNode =
	| { type: 'sequence'; children: PatternNode[] }
	| { type: 'token'; clauses: TokenClauseNode[] }
	| { type: 'boolean'; operator: 'and' | 'or'; children: PatternNode[] }
	| { type: 'parallel'; source: PatternNode; targets: ParallelTargetNode[] }
	| { type: 'raw'; cql: string };

type FilterNode =
	| { type: 'term'; field: string; values: string[] }
	| { type: 'range'; field: string; low?: string; high?: string }
	| { type: 'boolean'; operator: 'and' | 'or'; children: FilterNode[] }
	| { type: 'raw'; lucene: string };

type QueryWrapper = { type: 'within'; element: string; attributes: Record<string, FilterNode | string> } | { type: 'with-spans'; enabled: boolean };
```

Important behavior:

- leaves do not normally decide how siblings join
- containers open a build scope and combine child outputs according to declared semantics such as `allOf`, `anyOf`, `sequence`, or `parallel-targets`
- wrapper-style controllers such as `within` attach wrappers to the current scope instead of trying to post-process finished strings
- advanced controllers can emit `raw` subtrees when they intentionally operate at a larger semantic granularity

This keeps simple cases easy while still leaving room for richer future widgets.

Helper API expectation:

- `builder.pattern.tokenEq(name, value, options)`
- `builder.pattern.regex(name, value, options)`
- `builder.filter.term(field, values)`
- `builder.filter.range(field, low, high)`
- `builder.wrap.within(element, attributes)`
- `builder.summary.add(entry)`

The build pipeline must also be able to compile the artifact into at least these projections:

- full raw submission output
- `filter-only`
- `pattern-only`
- subtree-scoped previews for summaries and totals

This is the missing primitive needed for the old filter summary and count panel.

## Submission flow

At submit time:

1. determine the active form
2. traverse the active form tree
3. build a scoped query artifact
4. compile artifact projections
5. store a submitted snapshot separate from draft state
6. hand the same submitted snapshot to history and URL codecs

This traversal model is what makes arbitrary nesting possible without coupling parent containers to child controller implementation details.

## Worked examples

These are not final API names. They are shape tests for the design.

### Example: old extended form

Pseudo registration:

```ts
frontend.registerSearchForms(api => {
	const search = api.container('search', {
		presentation: 'tabs',
	});

	const extended = api.form('search.extended');

	const body = api.container('search.extended.body', {
		presentation: 'list',
		class: 'horizontal',
	});

	const patternColumn = api.container('search.extended.patternColumn', {
		presentation: 'list',
	});

	if (api.corpus.isParallel) {
		patternColumn.addView(api.view.parallelControls('search.shared.parallelControls'));
	}

	const annotationTabs = api.container('search.extended.annotationTabs', {
		presentation: 'tabs',
	});

	for (const group of api.corpus.searchAnnotationGroups()) {
		const groupContainer = api.container(`search.extended.annotationGroup.${group.id}`, {
			presentation: 'list',
		});

		for (const annotation of group.annotations) {
			groupContainer.addField(
				api.field.annotation(`search.extended.annotation.${annotation.id}`, {
					annotationId: annotation.id,
				}),
			);
		}

		annotationTabs.addContainer(groupContainer);
	}

	patternColumn.addContainer(annotationTabs);
	patternColumn.addField(api.field.within('search.shared.within'));
	patternColumn.addView(
		api.view.toolbar('search.extended.actions', {
			actions: [{ id: 'copyToExpert', action: 'copy-to-expert' }],
		}),
	);

	const filterColumn = api.container('search.extended.filterColumn', {
		presentation: 'list',
		title: 'Filter by...',
	});

	const filterTabs = api.container('search.shared.filters', {
		presentation: 'small-tabs',
	});

	for (const group of api.corpus.metadataGroups()) {
		const groupContainer = api.container(`search.shared.filters.${group.id}`, {
			presentation: 'list',
			title: group.title,
		});

		for (const field of group.fields) {
			groupContainer.addField(
				api.field.metadataFilter(`search.shared.filter.${field.id}`, {
					definition: field,
				}),
			);
		}

		filterTabs.addContainer(groupContainer);
	}

	filterColumn.addContainer(filterTabs);
	filterColumn.addView(
		api.view.summary('search.extended.filterSummary', {
			source: form => form.preview('filter-only'),
		}),
	);
	filterColumn.addView(
		api.view.totals('search.extended.filterTotals', {
			source: form => form.preview('filter-only'),
		}),
	);

	body.addContainer(patternColumn);
	body.addContainer(filterColumn);
	extended.addContainer(body);
	search.addForm(extended);
});
```

Rough internal Vue components:

- `SearchFormsRenderer`
- `ContainerRenderer`
- `FormRenderer`
- `FieldHost`
- `ViewHost`
- `SummaryView`
- `TotalsView`
- `ToolbarView`

What this exposes:

- a horizontal `list` plus `tabs` and `small-tabs` is enough for the old extended layout
- shared fields can reuse the same underlying state through reusing `id`
- summary and totals are just built-in views that read through `useParentForm()`
- no attachment metadata is required to express the layout cleanly

### Example: old simple form

Pseudo registration:

```ts
frontend.registerSearchForms(api => {
	const search = api.container('search', {
		presentation: 'tabs',
		title: 'Search for...',
	});

	const simple = api.form('search.simple', {
		title: 'simple',
	});

	const body = api.container('search.simple.body', {
		presentation: 'list',
	});

	if (api.corpus.isParallel) {
		body.addView(api.view.parallelControls('search.shared.parallelControls'));
	}

	body.addField(
		api.field.annotation('search.simple.mainAnnotation', {
			annotationId: api.corpus.defaultSimpleAnnotation(),
			stateKey: 'pattern.simple.main',
			variant: 'large',
		}),
	);

	simple.addContainer(body);
	search.addForm(simple);
});
```

Rough internal Vue components:

- `SearchFormsRenderer`
- `ContainerRenderer`
- `FormRenderer`
- `ViewHost`
- `FieldHost`

This is intentionally much smaller, but it fits the same system.

## URL and history strategy

Recommended restore precedence:

1. compatible submitted snapshot from browser history state or explicit persisted blob
2. compatible submitted snapshot from URL when present
3. raw `patt` and `filter` fallback into expert or minimal compatible modes

Rules:

- never require full raw-query decompilation to get the page usable
- treat raw strings as the universal fallback, not the canonical UI state
- version submitted snapshots explicitly so incompatible configs can fail gracefully
- preserve enough visible state in URL to reach legacy parity over time

Practical recommendation:

- keep full submitted snapshots in browser history and local history entries
- give URL state a shared codec schema from the beginning
- include submitted form id, form controller state, nested container selection state, and visible result state in that schema
- prefer a reasonably legible parameter layout where possible, even if some controller payload remains opaque

## How this should map onto the current `_new` code

### Reuse immediately

- `filterValueFunctions.ts` as the filter controller behavior core
- `pattern-utils.ts` as the pattern submission core
- `widgets/cql-query-builder/model.ts` as the advanced controller model
- `field-groups.ts` to derive corpus-driven registration defaults

### Temporary migration inputs

- `pattern-store.ts`
- `explore-state.ts`
- `filter-store.ts`
- `interface-state.ts`

These may still be wrapped during a migration spike, but the target architecture is `forms[formId].controllerState`, not long-lived parallel stores.

### Replace or narrow later

- `ui-customization-store.ts` as the public extension surface
- direct store mutation from UI widgets
- hard-coded top-level tab components

## External API shape

Recommendation:

- expose a dedicated public module, not the internal stores
- keep it callback-based and corpus-aware

Example direction:
See above for exploratory simple/extended form definition code.

Important limitation for v1:

- external code should compose built-in field and view kinds
- do not let external code mount arbitrary components or raw render functions

## Type-generation plan

Current state:

- `package.json` has no dedicated declaration build for a public customization API
- `tsconfig.app.json` does not emit declarations

Recommended addition:

- create a dedicated feature-owned entrypoint under something like `src/frontend/src/_new/pages/search/config/form-registration/`
- create a focused tsconfig for declaration emit only
- add a script such as `build:types:form-registration`

Placement rule:

- `app` should only wire config scripts into feature registration
- the feature-owned module should define the public search-form registration surface and declaration entrypoint

Reason for a separate entrypoint:

- it avoids leaking internal store types
- it lets the API stabilize independently from implementation files
- it gives customization scripts a small, intentional declaration surface for triple-slash references or future package publishing

## What this architecture explicitly avoids

- a configuration language for raw DOM layout
- store mutation as the extension protocol
- mandatory reverse parsing from raw queries into widgets
- coupling results to live draft state instead of submitted state
