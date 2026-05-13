# Roadmap And Open Questions

This file turns the architecture proposal into an execution sequence.

This revision integrates the first review pass, front-loads persistence and query projections, and simplifies the composition model to containers, forms, fields, and views.

## Settled decisions

These points should be treated as decided unless implementation reveals a concrete blocker.

- The composition model should be a tree of `container`, `form`, `field`, and `view` nodes.
- Limited node-level presentation metadata is acceptable if it stays bounded to simple container and field or view variants.
- Shared behavior should usually happen through helper factories and explicit `stateKey` reuse, not shared presentation nodes.
- V1 supports composition of built-in controller kinds only.
- Draft state should converge to one `FormState` per form; filters are not a permanent separate store boundary.
- The submitted snapshot should be centered on `form + form state`, with compiled projections stored alongside it.
- URL-visible state must eventually reach legacy parity for visible form and result state.
- Search-form registration and public types should live under the search feature, not under a generic `_new/public` directory.
- `app` owns wiring from config scripts to feature registration, not the feature API itself.
- Compatibility with old `window.frontend.customize(...)` scripts is deferred. An adapter will eventually be created if desired.

## Recommended implementation phases

### Phase 0: define the contracts and placement

Deliverables:

- create a dedicated search-owned form-registration module under something like `_new/pages/search/config/form-registration/`
- define the composition primitives, runtime context, query artifact shape, and persistence codec interfaces
- decide the declaration-build entrypoint and script layout
- keep `app` responsible only for wiring external scripts into this feature-owned API

Acceptance criteria:

- the public API shape is defined without leaking internal store types
- query build and persistence contracts exist before controller porting begins
- the primitive invariants are explicit: forms are submit boundaries, fields require a parent form, and containers own simple list or tab rendering
- feature ownership versus app wiring is explicit in code placement

### Phase 1: bring back a submitted-query store and persistence skeleton early

Deliverables:

- introduce a submitted snapshot store for search submissions
- separate live draft editing from active results state again
- wire search submit to produce `form + form state + compiled projections`
- create thin browser-history and URL codec wiring that can already roundtrip:
  - active form
  - submitted form state
  - nested container selection state
  - placeholder result state shell

Acceptance criteria:

- editing the form no longer implicitly means changing the active query
- simple search can submit into a submitted snapshot even before full results views exist
- the submission path already feeds history and URL codecs through the same state contract

### Phase 2: pilot the tree registry with simplified composition

Deliverables:

- define `container`, `form`, `field`, and `view` nodes plus bounded presentation props such as `list`, `tabs`, and `small-tabs`
- add the `useParentForm()` runtime context and parent-form preview path
- start converging toward `forms[formId].controllerState`, using adapters only where needed for migration speed
- prove helper-factory plus `stateKey` reuse for shared logical filters or controls

Acceptance criteria:

- simple search can be rendered from the registry rather than hard-coded templates
- the registry can represent at least one nested tabbed or horizontal layout without attachment metadata
- the `stateKey` sharing model is explicit and validated

### Phase 3: port filter UI plus derived summary and totals views

Deliverables:

- port or rebuild `QueryFormFilters` in `_new`
- render fields dynamically from controller kinds and feature config
- expose query projections such as `filter-only` and subtree previews from the same build path
- add built-in view nodes for filter summary and subcorpus totals
- keep `filterValueFunctions.ts` as the logic layer where applicable

Acceptance criteria:

- built-in metadata filters render from definitions
- custom span filters and custom tabs still work
- filter summaries and subcorpus totals compose through the same form-preview pipeline, not bespoke globals

### Phase 4: port the remaining query modes and wrapper semantics

Deliverables:

- extended mode
- advanced query-builder mode
- expert mode
- within and parallel controls as shared logical sections
- wrapper-aware query artifact logic for `within`, span filters, and raw subtree escape hatches

Acceptance criteria:

- these modes are registered, not hard-coded
- shared logical sections reuse the same underlying draft state where appropriate through explicit `stateKey` or helper-factory conventions
- wrapper behavior does not require brittle string post-processing as the primary implementation strategy

### Phase 5: restore explore modes as result-presets plus query builders

Deliverables:

- corpora
- n-grams
- frequency

Acceptance criteria:

- each explore mode can submit a raw query plus a result preset
- hits versus docs default selection is derived from submitted mode behavior, not scattered UI conditions

### Phase 6: widen URL and history fidelity toward legacy parity

Deliverables:

- persist submitted form snapshots in history and local history
- widen URL codec coverage to include visible result state such as grouping, display mode, and pagination
- refine the URL schema toward a reasonably legible representation where possible
- keep raw fallback fields in place for universal recovery

Acceptance criteria:

- no critical-path backend request is needed just to reopen a compatible saved state
- incompatible saved opaque state still restores a usable expert/raw experience
- visible state roundtrips in a way that can eventually match legacy shared URLs

## Immediate best next step

If implementation starts now, the best first code slice is:

- define the submitted snapshot and persistence codec contracts
- reintroduce a submitted-query store in `_new`
- keep using the existing pattern and filter serialization utilities while the new query artifact builder is introduced
- pilot a tiny tree registry that renders `search/simple` and already roundtrips its state through history and URL codecs

Reason:

- it exercises the draft-versus-submitted split
- it brings persistence pressure onto the system before the controller catalog gets large
- it proves the registry boundary without forcing the full old feature set back at once
- it keeps the first migration slice small and testable

## Major risks

### Risk: shared state without shared presentation nodes drifts

If repeated containers are duplicated per form while state is shared by `stateKey`, the UI trees can drift apart accidentally.

Mitigation:

- use helper factories for repeated structures such as metadata filters or parallel controls
- validate `stateKey` collisions and expected sharing during registry build
- add targeted tests for forms that intentionally share state namespaces

### Risk: presentation props start creeping into a layout DSL

The simplified model only works if node-level presentation stays small and boring.

Mitigation:

- whitelist the presentation vocabulary explicitly
- keep final CSS and component choice inside internal renderers
- reject arbitrary regions, custom component refs, and free-form DOM config in v1

### Risk: query artifact grows too narrow or too magical

If the artifact is too narrow, future widgets will not fit. If it is too magical, simple controllers become hard to write.

Mitigation:

- use a minimal internal AST with helper APIs for common cases
- let parent containers own combine semantics
- allow advanced controllers to emit raw subtrees only at explicit boundaries

### Risk: public API leaks internal implementation details

If the public registration API exposes store shapes or Vue components, it will be hard to evolve.

Mitigation:

- expose stable builders and public types only
- keep renderers and store adapters internal

### Risk: registry rebuilds against async corpus changes

Registrations are corpus-dependent, and external scripts may register before or after corpus load.

Mitigation:

- make registration callback collection independent from corpus data
- rebuild and validate the registry against the current corpus snapshot

### Risk: URL payload size

Opaque widget state can become too large for URLs.

Mitigation:

- keep full opaque state in browser history and saved query history
- share one codec schema across history and URL
- keep visible-state parity goals explicit so URL tradeoffs happen intentionally
- only place compact opaque payload in URL opportunistically where needed
- always include raw `patt` and `filter` fallback

### Risk: over-generalizing before the first slice works

It is easy to design a framework instead of landing behavior.

Mitigation:

- phase the work around real built-in modes
- treat custom controller registration as a later capability, not a phase-1 requirement

## Open questions still worth deciding before implementation goes wide

1. Should result presets live inside the same submitted snapshot object as raw query state, or in a sibling result-intent object?
2. Which node-level presentation props should be mandatory versus optional in v1?
3. Which URL parameters should stay legible first, and which controller payloads can remain opaque initially?

## Conclusions to treat as settled unless new evidence appears

- A submitted-query snapshot store is required.
- A persistence codec must be part of the first implementation slices.
- The future restore path should be opaque-state-first and raw-fallback-second.
- `filterValueFunctions.ts` is a keeper.
- Layout must stay inside internal renderers, but a bounded set of `container` presentation variants is acceptable.
- Prefer sharing `stateKey`s over sharing presentation nodes.
- Filters should converge into the unified controller-state model.
- Built-in non-field nodes such as summary and totals panels are required.
- V1 should expose built-in controller kinds only.
- The public extension API needs generated declaration files.
