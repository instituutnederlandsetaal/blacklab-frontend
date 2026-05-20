# Roadmap And Gaps

This file records the current gaps found after the refactor under `features/form`. It is intentionally focused on what remains before integration, not on the already-retired `stateKey`/draft-state design.

## Current status

Implemented now:

- node graph with `container`, `form`, `field`, and `view`
- class-based `FormBuilder`
- builtin controller/view registries
- mutable runtime `FormState`
- submit/persist snapshots copied from live state
- query artifact compiler for CQL/filter/searchField
- metadata filter fields through the preserved filter value functions
- specialized grouped filter container renderer
- colocated Storybook review pages

Not implemented yet:

- app/search-page integration
- submitted-query store outside the form runtime
- URL/history roundtrip
- generated public customization declarations
- corpus-driven default form construction
- tests for the form slice

## Gaps identified in the current implementation

### State ownership and sharing

- State is keyed by node ID. This is simple, but duplicate IDs in manual definitions silently share state.
- `FormBuilder` prevents duplicate IDs, so builder-authored sharing currently requires reusing the same node object.
- There is no explicit validation that fields only appear under a form boundary.
- `activeFormNode` is initialized from the first discovered form and is not restored from `uiState.activeContainers`.
- `reset()` resets the whole runtime, not just the active form.

Recommended next work:

- add invariant validation in `FormBuilder.build()` or a dedicated validator
- decide whether duplicate ID sharing should be allowed in manual definitions or rejected
- derive active form from active container state when initializing from persisted state
- decide whether form-scoped reset is required

### Query artifact and projections

- The compiler exposes only full `cql`, full `filter`, and `searchField` projections.
- There is no `filter-only`, `pattern-only`, or subtree preview API.
- `summary` view currently reads one flat summary list and raw full projections.
- `totals` view uses placeholder estimates instead of the real totals loaders.
- `parallel` currently contributes `searchField` and summaries, but not target query structure.
- Span filters and span wrappers are not first-class artifact nodes.

Recommended next work:

- add projection/source selection to summary and totals views
- introduce summary categories or scopes such as `pattern`, `filter`, `span`, and `submission`
- complete parallel query semantics
- model span filters explicitly in the artifact instead of relying on raw strings

### Persistence and restore

- `encodeSubmittedForm()` serializes the copied `FormState` as JSON in a string field.
- Controller `encode()` and `restore()` hooks exist in the type but are not wired into persistence.
- Result presets and summaries are not encoded.
- Schema-version mismatches are not handled beyond carrying `schemaVersion`/`v`.
- Raw CQL/Lucene fallback restore is not implemented.

Recommended next work:

- decide the canonical persisted snapshot shape before URL wiring
- use controller encode/restore hooks or remove them until needed
- keep raw fallback fields in URL/history even when opaque state exists
- add compatibility behavior for stale schema versions

### Builder and external API

- `FormBuilder` is useful for internal composition, but it exposes controller objects and Vue-aware implementation details.
- The public callback API is not designed yet.
- There is no generated declaration entrypoint for custom scripts.
- The builder currently uses broad `any` at several generic boundaries to keep concrete controllers composable.

Recommended next work:

- keep `FormBuilder` internal until a public API is deliberately designed
- design a corpus-aware callback API that composes builtin kinds without exposing raw component refs
- add a declaration-only build once the public API is stable enough
- tighten builder typings after the concrete API shape settles

### Rendering and UI

- `ContainerRenderer` assumes tab children are containers or forms; field/view tab children do not become active.
- `ContainerRendererFilters` active badges rely on summary `group` matching direct child container IDs.
- Field and view variants are not consistently implemented.
- i18n is mostly TODO in form labels, action labels, summaries, and totals.

Recommended next work:

- decide whether tabbed containers may contain fields/views directly
- formalize summary group IDs for filter badges
- replace TODO text with i18n hooks before app integration
- either implement or remove unused `variant` surfaces

### Built-in controller coverage

- Annotation, metadata filter, within, parallel, and raw CQL exist.
- Advanced query builder is not ported.
- Explore modes are not represented.
- Metadata filter behavior is preserved, but custom span filters need a new artifact model.
- Controller validation is not surfaced in the UI or builder output.

Recommended next work:

- port the advanced query builder as a builtin controller
- add explore controllers only after result presets have a stable submitted-state home
- wire controller validation into build/runtime diagnostics

## Logic and usage mistakes fixed in this pass

- Public barrel exports pointed at removed registry/state modules.
- `model/types` lacked an index export while the public barrel exported it.
- Container combine was read from `node.combine` instead of `node.config.combine`.
- Custom container components were defined in the node type but ignored by `NodeRenderer`.
- The old stories imported removed `DraftFormState`/`stateKey` APIs.
- `MetadataFilterField` made `state` optional from Vue's point of view.
- `WithinField` required an unused top-level `config` prop that `FieldHost` never passed.
- `AnnotationField` still rendered a debug `<pre>` for the node object.
- Generic node unions were too narrow for concrete controller/view config types.
- Graph traversal used stack order that could reverse discovered form order.

## Recommended next implementation phases

### Phase 1: add tests around the isolated slice

Cover:

- `createFormState()` default state
- node traversal order and DAG reuse
- container `config.combine`
- metadata filter Lucene output and summaries
- submit/persist copied state
- encode/decode roundtrip

### Phase 2: enrich projections and summaries

Deliver:

- projection selection for `summary` and `totals`
- category/scoped summary entries
- filter-only and pattern-only compile helpers
- real totals integration surface

### Phase 3: formalize persistence

Deliver:

- canonical submitted snapshot type for search
- controller encode/restore use or removal
- schema compatibility behavior
- raw fallback restore story

### Phase 4: complete controller coverage

Deliver:

- advanced query builder controller
- complete parallel query behavior
- first-class span filters/wrappers
- explore/result-preset controllers

### Phase 5: design the public API

Deliver:

- callback collection and rebuild flow
- corpus-aware builtin-kind builders
- generated declaration entrypoint
- app wiring limited to loading external scripts and handing callbacks to the search feature

### Phase 6: integrate into search

Deliver:

- search-owned form factory
- submitted-query store
- result preset bridge
- URL/history sync
- result/totals loaders driven by submitted snapshots

## Open questions

1. Should manually authored duplicate node IDs be rejected, warned, or treated as intentional shared state?
2. Should the builder support explicit aliases for state sharing, or is node object reuse enough?
3. Should `submit()` return the combined persistable/submittable snapshot long-term, or should persistence be a separate caller decision?
4. What is the minimum projection API needed by real filter summaries and totals?
5. How much of `FormBuilder` should become public, and how much should be hidden behind a smaller callback API?
