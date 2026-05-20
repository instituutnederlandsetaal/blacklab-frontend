# Current Form Surface

This file describes the implementation that currently exists under `src/frontend/src/features/form`. It does not describe app wiring; the slice is still isolated for review in Storybook.

## Placement and public surface

Current files of interest:

- `features/form/index.ts`
- `features/form/model/types/*`
- `features/form/model/builder/form-shape-builder.ts`
- `features/form/model/runtime.ts`
- `features/form/ui/FormSystem.vue`
- `features/form/stories/*`

Current public barrel exports:

- `FormSystem` and the internal renderer components.
- `FormBuilder` and `ControllerRegistry`.
- builtin controller registration and controller instances.
- builtin view registration and view instances.
- runtime helpers such as `createFormSystemRuntime`, `useFormSystemRuntime`, and `useParentForm`.
- state helpers such as `createFormState` and `cloneFormState`.
- compile helpers such as `buildFormQuery`, `summarizeForm`, and `createCompiledQueryProjections`.
- persistence helpers `encodeSubmittedForm` and `decodeSubmittedSnapshot`.

This is an internal feature surface, not yet the stable external customization API.

## Composition model

The current node model is defined in `model/types/form-shape.ts`.

Supported node kinds:

- `container`: structural group, optional custom component, optional `config.variant`, optional `config.combine`.
- `form`: submit boundary with children and optional `resultPreset`.
- `field`: query-producing controller node with controller object and field-specific config.
- `view`: non-query node with view definition and view-specific config.

Important current details:

- Container presentation uses `config.variant: 'list' | 'tabs' | 'small-tabs'`.
- Container query combination uses `config.combine: 'allOf' | 'anyOf' | 'sequence'`.
- Field/view variants are still lightly typed and not consistently used.
- Containers may specify a custom internal Vue component; this is used for the grouped filter renderer.

## Builder and registry

Current builder files:

- `model/builder/form-shape-builder.ts`
- `model/controllers/index.ts`
- `model/views/index.ts`

The current builder is class-based:

- create a `ControllerRegistry`
- call `registerBuiltinControllers()` and `registerBuiltinViews()`
- create a `FormBuilder`
- call `newContainer()`, `newForm()`, `newField()`, and `newView()`
- call `addChildren()` to compose a graph
- call `build()` to validate loops and generate `schemaVersion`

State sharing now follows node IDs and object reuse. There is no `stateKey` field. The builder currently prevents creating a second node with the same ID, so intentional sharing in builder-authored forms should reuse the same node object via helper functions.

## Runtime and state

Current files:

- `model/types/form-state.ts`
- `model/state.ts`
- `model/runtime.ts`
- `model/form-utils.ts`

Current `FormState` shape:

```ts
type FormState = {
	controllerState: Record<string, unknown>;
	uiState: {
		activeContainers: Record<string, string | null>;
	};
};
```

Current runtime behavior:

- `createFormState()` initializes controller state by walking fields and calling `controller.createDefaultState()`.
- `createInitialContainerUiStates()` picks the first child container/form for tab-like containers.
- `FormSystemRuntime.state` is a mutable `Ref<FormState>`.
- `compile(formId)` builds live projections for a form.
- `summarize(formId)` asks field controllers for summary entries.
- `persist(formId)` copies the active form state plus compiled raw query projections and schema version.
- `submit(formId)` adds summaries and `resultPreset` to the persisted snapshot.
- `reset()` recreates the internal form state.

There is no separate draft object in this slice. The runtime's internal `FormState` is the editable state. A submitted snapshot is produced by copying state during `persist()`/`submit()`.

## Query artifact and compile path

Current files:

- `model/compile/index.ts`
- `model/compile/query-artifact.ts`

Controllers contribute a `CompilableQuery` with these parts:

- `pattern`
- `filter`
- `wrappers`
- `searchField`
- `summaries`

The compile path supports:

- token patterns
- boolean pattern grouping
- sequence pattern grouping
- raw CQL patterns
- term/range/raw/boolean filters
- `within` wrappers
- a single `searchField`

Current projections are:

- `cql`
- `filter`
- `searchField`

Missing projections:

- `filter-only`
- `pattern-only`
- subtree-scoped previews for totals and localized summaries
- richer separation between filter summaries, pattern summaries, and submitted-query summaries

## Built-in controllers

Current files:

- `model/controllers/annotation-controller.ts`
- `model/controllers/metadata-filter-controller.ts`
- `model/controllers/within-controller.ts`
- `model/controllers/parallel-controller.ts`
- `model/controllers/raw-cql-query-controller.ts`

Current built-ins:

- `annotation`: token annotation input, emits token CQL.
- `metadata-filter`: wraps moved legacy filter behavior, emits Lucene filter and summary.
- `within`: emits a CQL wrapper and summary.
- `parallel`: currently sets `searchField` and summary entries; target query compilation is not complete.
- `raw-cql-query`: emits raw CQL.

The metadata filter controller uses `filter-value-functions.ts`, which remains the main preserved logic from the old filter system.

## Built-in views

Current files:

- `model/views/*`
- `views/HeadingView.vue`
- `views/SummaryView.vue`
- `views/TotalsView.vue`

Current built-ins:

- `heading`: static title/description.
- `summary`: reads `useParentForm()` and displays live summaries plus raw projections.
- `totals`: placeholder estimate based on whether a filter exists.

The summary and totals views are useful review scaffolding, but the summary interface needs to become richer before real app integration.

## Rendering

Current files:

- `ui/FormSystem.vue`
- `ui/NodeRenderer.vue`
- `ui/ContainerRenderer.vue`
- `ui/ContainerRendererFilters.vue`
- `ui/FormRenderer.vue`
- `ui/FieldHost.vue`
- `ui/ViewHost.vue`

Rendering flow:

- `FormSystem` creates/provides the runtime and renders the root node.
- `NodeRenderer` dispatches by node kind and now respects custom container components.
- `ContainerRenderer` renders list/tabs/small-tabs.
- `ContainerRendererFilters` is the specialized grouped filter container.
- `FormRenderer` provides parent form context and calls `runtime.submit()`/`runtime.reset()`.
- `FieldHost` binds field state by node ID with `v-model:state`.
- `ViewHost` renders the configured view component.

## Storybook review surface

Current story files:

- `ui/FormSystem.stories.ts`
- `ui/FilterPanel.stories.ts`
- `fields/FieldCatalog.stories.ts`
- `stories/sample-form-system.ts`
- `stories/FormSystemStoryHarness.vue`

The stories are colocated next to the form feature and use `FormBuilder` directly. They cover:

- search form tabs with simple, extended, and expert modes
- restored submitted snapshot shape
- grouped metadata filter container
- built-in field/controller catalog

The harness shows live runtime state, the last submitted snapshot, and the encoded persistable state.

## Search page integration status

The current form feature is still not wired into `pages/search`. Existing search-page stores and URL/result code remain separate migration inputs.

Integration still needs:

- submitted-query store ownership outside `features/form`
- URL/history codec wiring
- result preset handling
- totals/result loaders connected to submitted snapshots rather than live editing state
- corpus-driven default form construction
- a stable external customization API and generated declarations