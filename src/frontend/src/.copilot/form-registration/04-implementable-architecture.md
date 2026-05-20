# Implemented Architecture

This document describes the form system as it exists now, plus the target boundaries that still matter before app integration.

## Current principles

- The form system is an isolated feature under `features/form`.
- A form definition is a graph rooted at a `container` or `form` node.
- `form` nodes are submit boundaries.
- `field` nodes own controller-specific state and query contributions.
- `view` nodes display derived or static UI without contributing query clauses.
- Runtime state is mutable inside `FormSystemRuntime` and keyed by node ID.
- Submitted/persisted state is produced by copying the relevant live state at submit/persist time.
- Metadata filters are regular fields; grouped filters are a specialized container renderer.
- Vue rendering is internal. External/public API design is still unsettled.

## Node model

The current primitives are defined in `model/types/form-shape.ts`.

### `container`

Purpose:

- group children
- render list or tabs
- define child query combination semantics
- optionally use an internal specialized renderer

Current shape:

```ts
type FormContainerNode = FormNodeBase & {
	kind: 'container';
	component?: Component;
	config?: {
		variant?: 'list' | 'tabs' | 'small-tabs';
		combine?: 'allOf' | 'anyOf' | 'sequence';
	};
	children: FormNode[];
};
```

Notes:

- `config.variant` replaced the old `presentation` property.
- `config.combine` is read by the query compiler.
- `class` remains a small styling escape hatch on the node base.

### `form`

Purpose:

- submit/reset boundary
- parent-form provider boundary for views
- owner of optional result presets

Current shape:

```ts
type FormBoundaryNode = FormNodeBase & {
	kind: 'form';
	children: FormChildNode[];
	resultPreset?: Partial<ResultPreset>;
};
```

### `field`

Purpose:

- render a controller component
- store controller state under `controllerState[node.id]`
- contribute query artifact and summaries through the controller

Current shape:

```ts
type FormFieldNode<Config extends FieldControllerConfig = FieldControllerConfig> = FormNodeBase & {
	kind: 'field';
	controller: FieldController<string, any, Config>;
	config: Config;
};
```

### `view`

Purpose:

- render static or derived UI such as headings, summaries, and totals
- read parent-form runtime where needed

Current shape:

```ts
type FormViewNode<Config = unknown> = FormNodeBase & {
	kind: 'view';
	view: ViewDefinition<string, Config>;
	config: Config;
	variant?: string;
};
```

## Builder and graph ownership

`FormBuilder` is the current construction tool.

Current flow:

```ts
const registry = new ControllerRegistry();
registerBuiltinControllers(registry);
registerBuiltinViews(registry);

const builder = new FormBuilder(registry);
const root = builder.newContainer('search', { config: { variant: 'tabs' } });
const form = builder.newForm('search.simple', { title: 'Simple' });
form.addChildren(builder.newField('search.simple.word', annotationController, config));
root.addChildren(form);

const definition = builder.build();
```

Current behavior:

- `FormBuilder` rejects duplicate node IDs.
- `build()` checks loops and generates a schema hash.
- Reused fields/containers are represented by reusing the same node object in multiple places.
- Manual definitions can still create duplicate IDs; runtime state will then be shared because state maps are keyed by ID.

Architectural consequence:

- `stateKey` is gone. Sharing is no longer a separate field property.
- Helper factories are the safest way to share form pieces because they can return the same node object deliberately.
- The builder should eventually validate form invariants more explicitly, especially field-inside-form and duplicate-ID behavior in manually authored definitions.

## Runtime state

Current state shape:

```ts
type FormState = {
	controllerState: Record<string, unknown>;
	uiState: {
		activeContainers: Record<string, string | null>;
	};
};
```

Runtime responsibilities:

- initialize controller state from the definition
- hold mutable live editing state
- track active container/form children for tabs
- compile live state for a specific form
- summarize live state for a specific form
- copy active form state for persistence/submission
- reset live state back to controller defaults

Runtime API:

```ts
type FormSystemRuntime = {
	definition: FormSystemDefinition;
	context: FormRuntimeContext;
	state: Ref<FormState>;
	activeFormNode: Ref<FormBoundaryNode | null>;
	forms: Record<string, FormBoundaryNode>;
	compile(formId: string): CompiledFormState;
	persist(formId: string): PersistableFormState;
	submit(formId: string): PersistableSubmittableFormState;
	summarize(formId: string): SummaryEntry[];
	reset(): void;
};
```

Important behavior:

- The runtime mutates live state directly.
- `persist()` copies only the active form subtree state.
- `submit()` currently returns a combined persistable/submittable object.
- The app-level submitted-query store does not exist yet; callers must own submitted snapshots outside the form runtime.

## Query artifact

Controllers contribute `CompilableQuery` objects.

Current shape:

```ts
type CompilableQuery = {
	pattern: QueryPatternNode | null;
	filter: QueryFilterNode | null;
	wrappers: QueryWrapper[];
	searchField: string | null;
	summaries: SummaryEntry[];
};
```

Compilation currently supports:

- CQL token clauses
- raw CQL
- boolean and sequence pattern nodes
- raw/term/range/boolean Lucene filters
- `within` wrappers
- a single selected search field

Combination rules:

- Containers combine child artifacts with `config.combine`.
- Missing `config.combine` defaults to `allOf`.
- `anyOf` maps to boolean OR for patterns and filters.
- `sequence` maps to sequence for patterns and AND for filters.

Known limitations:

- Parallel target query compilation is not implemented beyond `searchField` and summaries.
- Span filter behavior is not represented as a first-class wrapper yet.
- There are no first-class `filter-only`, `pattern-only`, or subtree previews.
- Summary entries are one flat list and do not distinguish query, filter, span, and submitted-result summaries.

## Controller contract

Current field controller contract:

```ts
type FieldController<Kind extends string, State, Config extends FieldControllerConfig> = {
	kind: Kind;
	component: Component;
	createDefaultState(node, runtime): State;
	buildQuery?(input): CompilableQuery;
	restore?(payload, node, runtime): State;
	encode?(state, node, runtime): unknown;
	validate?(node, runtime): string[];
	toJSON(): unknown;
};
```

Current built-in controllers:

- `annotation`
- `metadata-filter`
- `within`
- `parallel`
- `raw-cql-query`

Open controller work:

- advanced query builder controller
- explore/frequency/n-gram controllers
- richer parallel controller semantics
- controller-level encode/restore coverage
- validation surfaced in builder/runtime output

## View contract

Current view contract:

```ts
type ViewDefinition<Kind extends string, Config> = {
	kind: Kind;
	component: Component;
};
```

Current built-in views:

- `heading`
- `summary`
- `totals`

Open view work:

- summary source/projection selection
- submitted-versus-live summary display
- real totals loader integration
- toolbar/action views if needed for copy-to-expert or similar behavior

## Rendering architecture

Current renderer chain:

```text
FormSystem
  NodeRenderer
    ContainerRenderer | custom container component
    FormRenderer
    FieldHost
    ViewHost
```

Current runtime providers:

- `provideFormSystemRuntime()` at `FormSystem`.
- `provideParentForm()` inside `FormRenderer` through `createAndProvideParentForm()`.
- `useFormSystemRuntime()` for field hosts and container renderers.
- `useParentForm()` for summary/totals/filter-container views.

Important rendering details:

- `FieldHost` binds `v-model:state` to `runtime.state.value.controllerState[node.id]`.
- `NodeRenderer` respects `container.component`, allowing specialized internal containers.
- `ContainerRendererFilters` relies on summary `group` values matching child container IDs for active badges.

## Persistence shape

Current persisted encoding:

```ts
type EncodedPersistableFormState = {
	v: string;
	form: string;
	state: string;
	cql?: string;
	filter?: string;
	searchField?: string;
};
```

Current limitations:

- Encoded state is JSON-in-string, not URL-optimized.
- Controller `encode()`/`restore()` hooks are not used by the codec yet.
- Result preset and summaries are not encoded.
- Schema compatibility handling is caller-owned.
- Raw CQL/filter fallback restore is not implemented.

## Integration target

Before app wiring, the system still needs these boundaries:

- search-owned submitted-query store
- URL/history codec that stores submitted snapshots and raw fallback strings
- corpus-driven form factory
- result preset bridge
- result/totals loaders driven from submitted state
- public customization callback API with generated declarations

The current implementation is a good reviewable form/runtime slice, but it is not yet the full search-page architecture.