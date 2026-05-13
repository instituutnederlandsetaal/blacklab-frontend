# Brief And Requirements

This file captures the product and technical constraints described for the form-registration effort.

## Domain glossary

- Document: a Lucene document.
- MetadataField: a document-level field on a Lucene document.
- Token: a token inside a Lucene document.
- Annotation: a property of a token, such as `word`, `lemma`, or `pos`.
- AnnotatedField: a group of annotations. Usually there is one default field, typically `contents`.
- ParallelField: a versioned annotated field such as `contents__en` or `contents__nl`; BlackLab treats these as versions of the same document.

Important implications:

- Metadata is singleton at the document level.
- Annotation identities are effectively `annotatedField + annotationId`, even if the backend lets the default field prefix be omitted.
- Parallel searching needs an explicit source field and zero or more target fields.

## Search page model

The search page has two major regions:

- the form
- the results

The form has two top-level modes:

- `query`
- `explore`

Both eventually produce:

- a Lucene filter
- a CQL query

The results used to expose two result families:

- `hits`
- `docs`

Shared result concerns:

- grouping
- windowing
- sampling
- drilling into groups
- sorting

## Query form requirements

Historic query subforms:

- `simple`
- `extended`
- `advanced`
- `expert`

Historic explore subforms:

- `corpora`
- `n-grams`
- `frequency`

Behavioral requirements that must survive the redesign:

- Multiple subforms may share the same underlying filter state.
- Some form pieces must be reusable across otherwise unrelated modes.
- Widgets may be nested arbitrarily deep inside logical groups.
- The internal model should describe logical grouping and contribution to query generation, not DOM structure.
- UI components should be free to render a group as tabs, stacks, headings, or some other local pattern.
- The system must support parallel corpora.
- The system must eventually support result presets produced by explore forms.

## Explicit design goals

- Limit implementation work to `_new`.
- Old code can be referenced, but should not be ported blindly.
- Avoid turning configuration into a baroque component or DOM DSL.
- Keep layout-related concerns out of the logical form model as much as possible.
- Allow a very small set of node-level presentation properties if that avoids a heavier attachment model.
- Keep the new app modular so feature config does not leak across boundaries.
- Make external customizations possible without depending on fragile initialization order.
- Ship usable TypeScript definitions for the external registration API.

## URL and history requirements

The old app stored serialized CQL and Lucene in the URL, then tried to reconstruct widget state from those strings. That caused major complexity and brittle fallback behavior.

Required new direction:

- Persist raw serialized query strings so restore is always possible.
- Persist opaque per-form or per-widget state directly as first-class state, instead of reverse-engineering from raw query strings.
- Fall back to expert or string-literal restore when opaque state is missing or outdated.
- Avoid backend-dependent parse work in the critical initial URL hydrate path whenever possible.

## Customization requirements

Historic customization was push-based and order-sensitive. The new SPA loads data asynchronously, so external scripts cannot rely on old timing guarantees.

Required new direction:

- registration must work from external scripts
- registration should be callback-based or otherwise timing-safe
- future API should be stable and typed
- feature-level config should be gathered into a higher-level bundle instead of leaking through one giant mutable store

## Anti-goals

These are the things the new design should avoid:

- using raw CQL/Lucene as the primary source of UI truth
- exposing internal Vue components or DOM layout directly to external scripts
- depending on `window.vuexModules`-style internal store mutation as the public extension API
- recreating the old URL parse/decompile path as the main restore strategy

## Additional requirements from feedback

These requirements were added or clarified during the first review pass.

- The system must be able to render non-field built-in UI nodes such as filter summaries, totals panels, headings, and toolbars.
- The final draft-state model should be unified across all controllers. A controller may emit Lucene, CQL, both, or neither. `filter` versus `pattern` is not a state-layer boundary.
- The submission pipeline must be able to expose at least `filter-only`, `pattern-only`, and full-query projections so derived UI such as totals and summaries can reuse the same build path.
- Widgets and derived view nodes need read-only access to top-level form state and query previews through a stable runtime context.
- Forms and containers need stable i18n keys. Reused behavior should prefer local tree paths plus explicit `titleKey` overrides instead of attachment-level label logic.
- URL-visible state must eventually reach feature parity with the legacy visible state: active form path, controller state, and visible result configuration.
- URL state may be partially opaque, but a reasonably legible scheme is preferred over compressed blobs where practical.
- Implementation should live under the search feature, such as `_new/pages/search/config/...`; `app` should only contain wiring from config scripts into feature registration.
- V1 should support composition of built-in controller kinds only. User-defined controller kinds are a later phase.