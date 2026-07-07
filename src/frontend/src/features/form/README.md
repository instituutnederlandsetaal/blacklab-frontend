# Form System Overview for Agents

This feature implements a declarative, runtime-rendered form system for building
BlackLab search forms. It is not a generic form library: each form field owns a
piece of UI state, knows how to compile that state into BlackLab query
parameters, and knows how to encode/restore itself from the scoped `f.*` URL
namespace.

Use this document as a map before editing `src/features/form`. The most useful
examples are in `test/form-*.ts` and `src/features/form/stories/*.stories.ts`.

## Mental model

The system has four layers:

1. **Shape graph**: `FormBuilder` creates a graph of nodes: `form`,
   `container`, `field`, and `view`.
2. **Runtime state**: the builder owns `state`, `uiState`, and `rawOverrides`.
3. **Controllers**: every field has a controller that creates defaults,
   compiles query contributions, and handles persistence.
4. **Renderers**: Vue components render the graph and receive implicit runtime
   props such as `modelValue`, `htmlId`, `disabled`, `children`, and `hideTitle`.

The main public entry point is `src/features/form/index.ts`, which re-exports
builders, controllers, fields, views, state helpers, persistence helpers, and UI
components.

## Important files

- `model/builder/form-shape-builder.ts`
  Defines `FormBuilder`, node construction, renderable node conversion,
  compile/submit/reset, form lookup, and listener management.
- `model/types/form-shape.ts`
  Defines node types and the implicit props expected by field/container
  components.
- `model/types/form-controllers.ts`
  Defines `FieldController`, `FormRuntimeContext`, persistence value types, and
  `createFieldController`.
- `model/state.ts`
  Creates default state and the mutable runtime state object.
- `model/compile/index.ts`
  Walks a form node tree and asks fields for query contributions.
- `model/compile/query-artifact.ts`
  Defines the query IR and emits BlackLab `patt`, `filter`, and `searchfield`.
- `model/persistence.ts`
  Encodes compiled form state to scoped URL params and restores scoped/canonical
  URL state.
- `ui/FormSystem.vue`
  Provides the builder runtime, renders the graph, displays raw override
  banners, and emits submit/reset.
- `ui/ContainerRenderer.vue`
  Default renderer for forms and containers. Handles list and tab
  presentations, form submit/reset buttons, and parent-form injection.
- `ui/ContainerRendererFilters.vue`
  Filter-oriented container renderer that counts active summaries in tabs.
- `fields/*`
  Vue components and small field-state helpers.
- `model/controllers/*`
  Built-in field controllers.
- `views/*`
  Read-only runtime views such as headings, summaries, and totals.

## Graph shape

Build forms with `new FormBuilder(context)` and the builder methods:

```ts
const builder = new FormBuilder({ corpus, translate });

builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' }).addChildren(
  builder.newField('search.simple.word', annotationTextController, TextField, {
    annotationId: 'word',
    displayName: 'Word',
  }),
  builder.newView('search.simple.summary', SummaryView, { title: 'Summary' }),
);
```

Node ids are stable runtime keys. Fields store state under `state[field.id]`;
containers/forms store active child ids under `uiState[container.id]`.

`FormBuilder` deduplicates nodes by object identity and id. Reusing the same
field node in multiple forms intentionally shares the same field state. Creating
a different node with an existing id throws.

The first container-like node created becomes the root. If a container/form gets
its first child, that child is activated as the default active child. Tests in
`form-model.test.ts` cover shared nodes and nested default tab activation.

## Node types

- `form`
  A submit boundary and specialized container. Forms render as `<form>` with
  submit/reset actions in the default renderer. A form may carry a
  `resultPreset`.
- `container`
  Groups children and controls presentation. Supported internal variants include
  `list`, `tabs`, and `small-tabs`.
- `field`
  Connects a controller to a Vue component. The controller owns state, query
  behavior, URL codec behavior, and which BlackLab params the field affects.
- `view`
  Renders derived/runtime information and does not contribute query state.

Containers can set `combine` to:

- `and` or `or` to combine child query fragments as boolean clauses.
- `sequence` to preserve child pattern order as a token sequence.

Forms do not have `combine`; their children are combined with the default
behavior. A child container/form can define `activeQueryContribution`, which is
included only when that child is active in its parent. This is used for
semantic tabs, for example a tab that implicitly adds a filter.

## Runtime state

`NewFormState` has three top-level objects:

```ts
type NewFormState = {
  state: Record<string, unknown>;
  uiState: Record<string, string | null>;
  rawOverrides: BlackLabParameters;
};
```

- `state` contains controller state by field id.
- `uiState` contains active child ids by container/form id.
- `rawOverrides` contains restored canonical BlackLab params that cannot be
  represented exactly by the current scoped form state.

Use `createDefaultFormState(root, context)` to build initial state for a graph.
Use `builder.state.replaceState(newState)` to atomically swap state; it clones
the input so later mutations to the replacement object do not leak into the
runtime.

Field components receive a normal Vue `v-model` contract through generated
props:

- `modelValue`
- `onUpdate:modelValue`
- `htmlId`
- `disabled`
- node config props such as `title`, `displayName`, `options`, etc.

The `disabled` prop is computed from `controller.affectsBlackLabParameters`.
When a raw override exists for one of those params, the field is locked until the
override is cleared.

## Rendering and injection

`FormSystem` is the host component:

```vue
<FormSystem :definition="builder" @submit="..." @reset="..." />
```

It provides the `FormBuilder` through `provideFormSystemRuntime`. Child code can
call `useFormSystemRuntime()` to compile forms or inspect state.

`ContainerRenderer` provides the active parent form id with `provideParentForm`
when it renders a `form` node. Views can call `useParentForm()` to know which
form they belong to. `SummaryView` and `TotalsView` use this pattern.

The renderer path is:

1. `FormSystem` calls `builder.renderableGraph()`.
2. `FormBuilder.renderableNode()` converts graph nodes into `{ is, props }`
   render descriptors.
3. Container components receive rendered child descriptors in `children`.
4. Field components receive v-model and implicit runtime props.

## Controllers

A field controller is the behavioral half of a field:

```ts
type FieldController<Kind, State, Extra> = {
  kind: Kind;
  createDefaultState(config, runtime): State;
  getQueryContribution(config, runtime, state): QueryFragment;
  getPersistKey(config, runtime): string;
  restore(payload, config, runtime): State | { state: State; warnings?: string[]; errors?: string[] };
  encode(state, config, runtime): string | string[] | null | undefined;
  affectsBlackLabParameters: BlackLabParameter[] | ((config, runtime) => BlackLabParameter[]);
};
```

When adding a controller, keep these contracts aligned:

- `createDefaultState` must return the exact state shape expected by the Vue
  component.
- `getQueryContribution` should return `queryFragment()` for empty/no-op state.
- `getPersistKey` must be short, stable, and unique within an active form.
  `form` and `tab` are reserved.
- `encode` should return `null`, `undefined`, or `''` for default/no-op state so
  empty params are omitted.
- `restore` should be lenient with historical values and return warnings for
  recoverable incompatibilities.
- `affectsBlackLabParameters` drives raw-override locking, so keep it accurate.

Prefer `createFieldController(...)` for new controllers. It marks the controller
raw for Vue reactivity.

## Built-in controllers and components

Annotation/query controllers:

- `annotationTextController` + `TextField`
  Tokenizes annotation input and emits CQL token predicates.
- `annotationSelectController` + `SelectField`
  Emits an OR predicate over selected annotation values.
- `annotationPosController` + `AnnotationPosField`
  Builds part-of-speech annotation queries.
- `expertQueryController` + `RawCqlField`
  Passes raw CQL through to `patt`.
- `queryBuilderController` + `QueryBuilderField`
  Converts structured CQL builder data to the query IR.
- `parallelController` + `ParallelField`
  Wraps a child field controller for parallel corpus source/target searches.
- `withinController` + `WithinField`
  Adds `within` wrappers around the emitted pattern.

Metadata filter controllers:

- `filterTextController` / `filterAutocompleteController` + `TextField`
- `filterCheckboxController` + `CheckboxField`
- `filterRadioController` + `RadioField`
- `filterSelectController` + `SelectField`
- `filterDateController` + `DateField`
- `filterRangeController` + `RangeField`
- `filterRangeMultipleFieldsController` + `RangeField`

Storybook catalog examples live in `stories/Fields.stories.ts`,
`stories/FormSystem.stories.ts`, and `stories/Views.stories.ts`.

## Query compilation

Controllers do not return raw BlackLab parameters directly. They return a
`QueryFragment`, which contains a `QueryIR` plus optional summaries.

The IR can represent:

- CQL pattern nodes: raw CQL, token predicates, any-token, repeat, XML tags,
  sequences, boolean `and`/`or`, and parallel relations.
- Lucene filter nodes: raw, term, range, boolean `and`/`or`.
- Wrappers, currently including `within`.
- `searchfield`.
- Summary entries for UI views.

`buildQueryIR(formNode, state, context)` walks fields and containers.
`combineQueryFragments` combines non-empty child fragments. `compileQueryIR`
simplifies the IR and emits:

```ts
{
  patt: string | null;
  filter: string | null;
  searchfield: string | null;
}
```

Important simplification behavior:

- `and`/`or` over text fields is folded per token when possible.
  For example `word=a b` AND `lemma=c d e` becomes:
  `[word="a" & lemma="c"] [word="b" & lemma="d"] [lemma="e"]`.
- `sequence` preserves child order as separate CQL tokens.
- Empty fragments are dropped.
- Raw CQL/filter strings are trimmed.
- Searchfield-only fragments are preserved.
- Nested parallel contributions inside a `parallelController` child are ignored
  with a warning.

See `form-query.test.ts` and `form-model.test.ts` for expected output strings.

## Persistence and restore

Form-owned URL state is scoped under the `f.` prefix.

Common encoded keys:

- `f.form`: active form id.
- `f.<fieldKey>`: controller-encoded field state.
- `f.tab`: query-affecting tab selections, encoded as `containerId:childId`.

`compileFormState(formNode, state, context)` returns compiled BlackLab params,
`formId`, `encoded`, and `summaries`. It also applies `rawOverrides` over the
compiled params.

`restoreScopedFormState(builder, query, canonical)` restores state from scoped
params plus optional canonical BlackLab params:

1. Read only `f.*` keys; unscoped unknown keys are ignored.
2. Select the requested `f.form` if available, otherwise use the first form.
3. Restore known field keys through each controller.
4. Restore valid `f.tab` selections.
5. Report dangling/malformed scoped keys in `issues`.
6. If no usable scoped state exists but canonical `patt` exists, fall back to
   the first expert/raw CQL form.
7. Compare compiled output to canonical `patt`, `filter`, and `searchfield`.
   Differences become `rawOverrides`.

Raw overrides are a compatibility mechanism for old URLs or URLs that contain
BlackLab params the current form cannot reproduce. `FormSystem` displays them,
`compileFormState` applies them, and affected fields are disabled until the user
clears the override.

Persistence keys must be unique within the active form. Duplicate keys or
reserved keys throw during encode. Tests in `form-persistence.test.ts` cover
restore warnings, canonical fallback, raw overrides, tab restore, and duplicate
key failures.

## Summaries and views

Controllers can attach summary entries to their `QueryFragment`. A summary entry
usually has:

```ts
{
  id: string;
  label: string;
  value: string;
  group?: string;
}
```

`SummaryView` compiles the parent form and renders active summaries.
`ContainerRendererFilters` compiles child nodes to count active summaries in tab
badges. `TotalsView` uses the parent form/runtime and submitted state to display
filtered/unfiltered totals.

If a field should appear in summaries, add the summary in the controller rather
than in the component. Components should stay focused on editing state.

## Common extension tasks

### Add a new field type

1. Define the state and UI config type near the field component or controller.
2. Create a Vue field component that accepts `ImplicitFieldComponentProps<State>`
   plus config props and emits `update:modelValue`.
3. Create a controller with `createDefaultState`, query contribution, persistence
   key, `encode`, `restore`, and `affectsBlackLabParameters`.
4. Export the component/controller from the local `index.ts` files.
5. Add focused tests for default state, query output, persistence, and host
   rendering. Use `test/form/helpers.ts` for simple fixtures.
6. Add or update a Storybook story if the field has visual states worth
   inspecting.

### Add a new form composition

1. Build it with `FormBuilder` from existing controllers and renderers.
2. Use stable ids. Prefer namespaced ids such as `search.simple.word`.
3. Decide which containers need `variant: 'tabs'` or `variant: 'small-tabs'`.
4. Set `combine` only on containers that intentionally combine child query
   fragments differently.
5. Use `createDefaultFormState` for initial values, then
   `builder.state.replaceState` if you need seeded state.

### Debug wrong query output

1. Compile the active form with `builder.compile(formId)`.
2. If needed, inspect `buildQueryIR(formNode, builder.state.getRawState(),
   builder.context)` before emission.
3. Check whether a `rawOverrides` entry is replacing `patt`, `filter`, or
   `searchfield`.
4. Check container `combine` mode and active tab state in `uiState`.
5. Look at the controller's `getQueryContribution`; UI components should not
   compile query strings.

## Testing map

- `test/form/form-model.test.ts`
  Builder graph behavior, default state, active branch initialization, and query
  composition modes.
- `test/form/form-query.test.ts`
  Query IR simplification and emitted BlackLab parameters.
- `test/form/form-persistence.test.ts`
  Scoped URL encoding/restoring, raw override behavior, duplicate/reserved
  persistence keys, and controller codec compatibility.
- `test/form/form-runtime.test.ts`
  Submit snapshots, state replacement, and tab state updates.
- `test/form/form-system.test.ts`
  Mounted integration behavior, parent-form projections, shared fields, and
  filter summary badges.
- `test/form/form-hosts.test.ts`
  Built-in field/view host behavior and summary expectations.
- `test/form/search-data-dependencies.test.ts`
  How real search data/config dependencies feed form construction.

For a broad sanity check after form changes, run the frontend form tests:

```sh
npm test -- --run test/form
```

Run from `src/frontend` if your shell is at the repo root.

## Agent cautions

- Do not bypass controllers to build query strings in Vue components.
- Do not change persistence keys casually; they are URL compatibility contracts.
- Keep restore paths lenient and report recoverable problems as `issues` or
  warnings rather than throwing where possible.
- Keep `affectsBlackLabParameters` accurate or raw override locking will be
  wrong.
- Reused node objects intentionally share state. If you want independent state,
  create distinct node ids.
- Container `combine` changes can alter emitted CQL in subtle token-folding
  ways; update query tests when changing it.
- If changing query emission, add exact string tests. BlackLab syntax escaping
  and precedence are easy to regress.
