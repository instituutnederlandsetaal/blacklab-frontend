# Form Registration Knowledge Base

Snapshot date: 2026-05-20.

This folder is a long-lived working dossier for the dynamic form-registration effort in the new frontend. It is intentionally limited to the `_new` codebase for implementation work, but it references `old-frontend` where the old behavior still matters as a migration input.

Read these files in order:

1. `01-brief-and-requirements.md`
2. `02-current-new-surface.md`
3. `03-legacy-reference.md`
4. `04-implementable-architecture.md`
5. `05-roadmap-and-open-questions.md`

Short version:

- The isolated implementation now lives in `src/frontend/src/features/form` and is intentionally not wired into the search page yet.
- Forms are described as a node tree of `container`, `form`, `field`, and `view` nodes.
- `FormBuilder` and `ControllerRegistry` are the current internal composition API. The older `stateKey`/`DraftFormState` registry API has been removed.
- Runtime state is one mutable `FormState` keyed by node ID. Reusing the same node ID or the same node object means shared state.
- `FormSystemRuntime.submit()` produces a persisted/submittable snapshot containing compiled CQL, Lucene filter, search field, summaries, result preset, schema version, form id, and copied form state.
- The query artifact builder currently has full CQL/filter projections only. Separate `filter-only`, `pattern-only`, and subtree preview projections are still future work.
- Metadata filters are now regular field nodes; the grouped filter UI is a specialized container renderer.
- Storybook pages under `features/form` are the review surface for this slice.

Recommended next direction:

- Keep `features/form` isolated until the search submission/result-store boundary is ready.
- Add focused tests around node traversal, shared node state, query compilation, persistence, and filter summaries.
- Introduce a richer summary/projection interface before wiring totals and filter-only previews into the real app.
- Decide the public customization API separately from the internal `FormBuilder`; the current builder is useful but still exposes implementation details.