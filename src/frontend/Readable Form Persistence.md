# Scoped Form Persistence

## Summary

Use readable, scoped form URL parameters plus canonical BlackLab query parameters. The form decoder consumes only `f.*`; the app keeps ownership of all other URL state.

Example:

```text
?patt=...&filter=...&searchfield=contents&f.v=1&f.form=extended&f.word=water&f.author=Austen&f.tab=filters:newspapers
```

## URL Contract

- Keep canonical BlackLab parameters unscoped: `patt`, `filter`, and `searchfield`.
- Scope all form-owned state under `f.`:
  - `f.v` for codec version;
  - `f.form` for active form alias;
  - `f.<fieldKey>` for encoded controller state;
  - `f.tab` for query-affecting active container selections.
- The form decoder ignores every query parameter outside `f.*`; the search-page adapter passes canonical BlackLab params separately.
- Controllers still use short stable keys, but only inside the `f.` namespace.

## Controller Codec

- Each persistable controller encodes non-default state into one readable value by default.
- Compound state is encoded inside that value, for example ranges, case sensitivity, POS selections, within attributes, or parallel settings.
- Multi-param output remains possible for unusually complex controllers, but is not the default.
- Controllers may emit restore warnings for dropped or adjusted values, but warnings are informational rather than the primary restore-success mechanism.

## Restore Validation

- Restore rich form state from `f.*`.
- Compile the restored form once.
- Compare compiled output with canonical URL values:
  - restored `cql` versus `patt`;
  - restored `filter` versus `filter`;
  - restored `searchField` versus `searchfield`.
- If a compiled value differs from the canonical value, activate a raw override for that BlackLab parameter.
- Controller warnings are surfaced as context for the user or logs, but the canonical comparison decides whether restoration succeeded.

## Raw Overrides

- Add normally hidden override controls for `patt`, `filter`, and `searchfield`.
- When active, an override contributes the canonical saved value and appears read-only with an explicit clear button.
- While an override is active, disable controls that could affect that same BlackLab parameter.
- Prefer deriving affected parameters from actual query contributions, but allow controllers and query-affecting containers to declare parameter hints for empty or special controls.
- For raw `patt`, populate and open an expert CQL field if available; otherwise use the generic override control.

## Containers

- Allow active containers to contribute fixed query fragments and summaries.
- Persist query-affecting container selections as scoped form params, for example `f.tab=filters:newspapers`.
- Infer ordinary visual tabs from restored populated fields; store exact ordinary tab state only in future in-app history snapshots.

## Search Adapter

- Update `SearchForm.vue` to read:
  - canonical `patt`, `filter`, `searchfield`;
  - scoped `f.*` form params.
- On submit, write canonical BlackLab params plus scoped form params, preserving unrelated app URL state.
- Remove the temporary `blfFormState`, `blfFormVersion`, `blfFormFilter`, and `blfFormField` JSON-blob contract.

## Test Plan

- Test `f.*` ownership: form decode must ignore unscoped unknown params.
- Test controller round trips with one compact value per field.
- Test canonical comparison restore success and raw override activation.
- Test controller warnings that do not cause fallback when compiled output still matches.
- Test locked controls, explicit override clearing, query-affecting tabs, implicit container filters, and old raw URLs with only canonical params.
