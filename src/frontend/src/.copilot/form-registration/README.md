# Form Registration Knowledge Base

Snapshot date: 2026-05-13.

This folder is a long-lived working dossier for the dynamic form-registration effort in the new frontend. It is intentionally limited to the `_new` codebase for implementation work, but it references `old-frontend` where the old behavior still matters as a migration input.

Read these files in order:

1. `01-brief-and-requirements.md`
2. `02-current-new-surface.md`
3. `03-legacy-reference.md`
4. `04-implementable-architecture.md`
5. `05-roadmap-and-open-questions.md`

Short version:

- The new search page already has useful state and serialization building blocks, but only the simple search UI is actually wired.
- The filter subsystem is the clearest prototype for a future registration system: it already separates logical definition, rendering key, and serialization behavior.
- The old app solved submission/history/results by keeping a submitted-query snapshot separate from the live form state. That idea should return.
- The old URL hydrate path tried to decompile raw CQL/Lucene back into widgets. That should not return as the primary restore strategy.
- The new external API should be callback-based, corpus-aware, and backed by generated declaration files instead of mutable global store access.

Recommended north star:

- Compose forms as a tree of `container`, `form`, `field`, and `view` nodes.
- Keep layout decisions inside internal Vue renderers, with only a tiny bounded set of node-level presentation props.
- Share state through explicit `stateKey` reuse and helper factories, not shared presentation nodes.
- Persist both raw BlackLab query strings and opaque widget state.
- Use raw strings only as universal fallback, not as the primary source of truth for UI restore.
- Start by defining the submitted snapshot and persistence codec contract, then pilot the registry while reusing existing pattern and filter utilities as migration inputs.