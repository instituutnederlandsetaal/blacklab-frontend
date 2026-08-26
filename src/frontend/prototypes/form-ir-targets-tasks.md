# Form output flow and target compilation

> **Implementation reference:** This document is authoritative. `form-ir-targets.md` is exploratory background.

## Why this redesign exists

The earlier prototype already had a useful high-level pipeline: controllers produced `QueryIR`, the form walk combined it according to container shape, and compilation published `patt`, `filter`, and `searchfield` together with summaries and restoration state. The published form state was therefore a compiled snapshot, not a copy of the intermediate IR. This design preserves that boundary.

Collocation exposes the limitation of the fixed output shape. It needs two independently composed CQL parameters (`patt` and `collpatt`) plus collocation-specific values. Passing one raw `BLCollocationOptions` bag through `QueryIR` or `ResultPreset` would bypass semantic collection and compilation, and would prevent ordinary CQL controls from being reused to build `collpatt`. Named semantic outputs, target-owned compilation, and explicit output projection generalize the existing pipeline without turning controllers into endpoint compilers.

## Glossary

- `Form Boundary`/`Form node`: the form system is represented by a node graph (DAG) in which nodes might appear in multiple spots. Nodes have a role/type such as Field, View, Form or Container. A Form Boundary is a node of type Form. This is where graph traversal starts, and below it all reachable nodes belong to the same "form". Forms cannot be nested.
- `Parameter`: a query parameter of the correct name and type for sending to the BlackLab backend.
- `Output`: a named semantic ingest emitted by controllers or intermediate scopes. Its value can be semantic IR or a typed scalar and is not necessarily a BlackLab parameter yet; the target owns its final validation and lowering.
- `Form Target`: Every Form Boundary carries a "target", which owns the domain knowledge about the request family the form is meant for. There are multiple concrete implementations sharing an interface, not a single generic/parameterized template. The target orchestrates post-gather output-to-parameter transformation and may recommend a results view.
- `Field`: a value-providing node, combining a Vue Component with a Controller to provide the UI and business logic respectively.
- `Controller`: the implementation logic for a Field. It transforms UI model state into zero or more typed semantic emissions, serializes/deserializes its model state for persistence, and provides a human-readable summary of its contribution.

## System flow

A form submission moves through the system as follows:

1. **Walk the form.**
2. **Collect values.** Collection of values can happen at multiple intermediate places before being passed up the chain and finally terminating at the `Form Target`
3. **Accept target inputs.** After collection, the Form Boundary validates and filters its emissions against the Form Target, reporting unsupported names, dropping omissions, and retaining supported semantic emissions.
4. **Compile the target.** The target processes the values, checks invariants, performs normalizations, etc. depending on specifics/requirements. It has intimate domain knowledge. It delegates complex parameter assembly to the existing compiler subsystems. Most outputs will be usable as-is.
5. **Publish the form result.** Compilation returns `formId`, `params`, summaries, encoded/restoration state, issues, the target's optional `targetView`, and a frontend-only `ResultPreset`.
6. **Resolve the results view.** This step formally leaves the form system. The result is passed on to the results system of the application, which resolves the view, passes the parameters.
7. **Build the request.** The results system combines form-owned parameters with result-owned live state with a longer lifetime than a single query (such as sorting and optionally grouping), validates the effective set, and calls the appropriate BlackLab API method.

Value gathering is somewhat tolerant. Bad or missing contributions produce issues but do not cancel submission or break flow. The results system decides whether the effective parameter set is executable. Controllers may be added to the form from unknown external scripts, and the form graph may be (re)structured in unexpected ways, but a core invariant is that we do not re-validate what TypeScript already proves. We assume every part of the system is well-behaved within the confines of TypeScript. Issues such as typed controllers emitting values that contradict their declared TypeScript shape are therefore not in scope for validation and tolerance.

## Parts and semantics

### Controller

Controllers will be updated to have their value collection function receive an `emit` sink for values
Summarization will be separated from value collection. Controllers will be updated to add a summarize() function, receiving a sink function with signature `(summary: SummaryEntry) => void`. This setup simplifies intermediate collection scopes, as the root's summary sink can be passed down directly.
These will typically be called during form walk, but are separate methods to prevent having to return a complex compound object from a single function, and making it impossible to omit.

Controls holding a semantically "empty" value emit nothing.
A controller does not know how output values are accumulated, stringified, sent to BlackLab, or applied to result state.

Controllers declare their possible emissions for graph diagnostics and conditional suspension when form state could not be restored for a specific parameter.

### Output vocabulary

An **output** is a named semantic ingest.
A Form Target has a known set of output names and their types:

```ts
type CollocationContext = number | readonly [before: number, after: number];

// These value types are an initial best effort, they might need minor refinement during implementation.
// Keys ought to be exhaustive for now.
type FormOutputValues = {
	patt: CqlPatternNode;
	collpatt: CqlPatternNode;
	filter: LuceneNode;
	searchfield: string;
	group: readonly string[] | null;
	sort: readonly string[] | null;
	withspans: true;
	colltype: BLCollocationType;
	context: CollocationContext;
	within: string;
	reltype: string;
	annotation: string;
	sensitive: boolean;
	scorertype: BLCollocationScorer;
};

type FormOutputName = keyof FormOutputValues;
type Emit = <Name extends FormOutputName>(name: Name, value: FormOutputValues[Name]) => void;

// Mapped union allows typed handling of values based on an entry's name discriminator.
type FormEmission<Names extends FormOutputName = FormOutputName> = {
	[Name in Names]: {
		readonly name: Name;
		readonly value: FormOutputValues[Name];
	};
}[Names];

// External or untyped producers require a pre-validation shape.
type RawEmission = Readonly<{ name: string; value: unknown }>;
```

An output is not necessarily yet a BlackLab parameter. For some of the simple types this may indentally be true, but generally the outputs are an intermediate system prior to validation, and compilation.

### Params vocabulary

While Outputs are still composable and intermediate, Params are the final result of compilation, and directly represent the parameters that will be sent to BlackLab. The Form Target owns the final validation and lowering of Outputs into Params.

Keep the compiled bag flat and typed:

```ts
type SharedFormParams = Partial<{
	patt: string;
	filter: string;
	searchfield: string;
	group: string | null;
	sort: string | null;
	withspans: true;
}>;

type SearchParams = SharedFormParams & { colltype?: never };

type CollocationParams = SharedFormParams & {
	colltype: BLCollocationType;
	collpatt?: string;
	context?: number | string;
	within?: string;
	reltype?: string;
	annotation: string;
	sensitive: boolean;
	scorertype: BLCollocationScorer;
};
```

### Form walking and capture order

All collection uses the same form-walking algorithm. Starting at the submitted form, it walks every reachable descendant node, depth-first and in stored child order. Certain nodes (container/form/compound fields) form an intermediate collection scope, collecting descendant emissions into a temporary local array, before optionally processing these emissions before re-emission. Except where deliberately processed at a boundary, emissions are kept in order of emission, then in order of walk. A container node can contain a local non-controller active-child query contribution, treated as one synthetic final child after the ordinary children.

Shared nodes' values are gathered at every occurrence, at their reachable graph locations. Their summaries and serialization must be deduplicated or skipped after the first occurrence, only being present once in the final collection after form walk has completed. This need not happen at every intermediate boundary, but must hold true after collection has completed at the form boundary. The final collection is a flat array of `FormEmission<Names>` values, in order of emission and walk.

Validation and diagnostics are performed from each Form Boundary after graph assembly. Because a node can have multiple parents and can be shared by multiple forms, walking upward from a field to discover "its" form is not reliable. Using stored child order as capture order also keeps ordering structural and avoids adding independent order numbers to graph connections.

### Error semantics

A controller's typical error-reporting mechanism is simply to throw an error. All collection scopes must catch these, notch an error and continue with the next node. Malformed emissions are handled as late as possible, or at a collection scope when validity is required for immediate processing. The Form Boundary performs final structural validation and drops malformed emissions; the target performs context-dependent semantic validation and normalization. Both report issues in the compilation result without cancelling submission.

### Emission capture and issues

Emission and collection are synchronous. The Form Boundary is the outermost collection scope; after local composition it validates the final captures, filters them against the selected target, and narrows them to `FormEmission<Names>[]` for target compilation. A localized cast here is acceptable when TypeScript cannot infer runtime membership:

- `emit(name, undefined)` is ignored, but not exposed as call signature by typescript.
- `null` is not necessarily an invalid emission, depending on the output; it acts as a canary for the target to detect intentionally cleared values. Future work could add a dedicated Symbol to represent a cleared value, but for now, `null` is sufficient and is serializable.
- unknown names produce collection issues, including when their value is `undefined`;
- undeclared known names produce collection issues but are retained;
- malformed values produce issues and are dropped.
- target-unsupported effective names produce form-boundary issues, including when their value is `undefined`;
- target normalization may reject structurally typed values, such as empty strings, with target issues;
- rejected values are ignored while collection continues; and
- batches and target accumulation do not retain producer provenance.

Use one issue array on the compiled form result, with typed issue type keys. The list of issue types can be extended on an as-needed basis.

```ts
type CompilationIssueCode =
	| 'controller-error' // catch()
	| 'unknown-output' // controller emitted something we don't recognize by name at all
	| 'undeclared-output' // controller emitted something didn't say it would
	| 'unsupported-output' // name is globally known, but the current form target doesn't use it
	| 'malformed-output'
	| 'conflicting-output' // we already had a value for the output, and it can be aggregated/combined
	| 'missing-output'; // form collection didn't result in a value for this required property

type FormIssue = {
	stage: 'restore' | 'collect' | 'accept' | 'target';
	code: CompilationIssueCode | 'invalid-restored-state';
	message: string;
	key?: string;
	nodeId?: string;
	output?: string;
};
```

Tests and control flow use `stage` and `code`; `message` is diagnostic text.

### Intermediate collection scopes and value composition

Intermediate collection scopes locally collect emissions in a temporary array, using the normal form walking mechanism for processing controllers. This applies to ordinary containers, embedded fields, projectors (when implemented), and later query-placement nodes; aggregation is simple and must not rely on emulating or using a form target.

The built-in form/container scope owns only `patt`, `collpatt`, and `filter`. `and` and `or` map to the corresponding CQL/Lucene operators. `sequence` sequences CQL and treats Lucene as `and`, matching the current compiler. Unrelated emissions pass through. Summaries and `ResultPreset` contributions are combined beside the emission batch and are not transformed as outputs.

An intermediate collection scope validates only what it needs; it does not apply target requiredness, scalar repetition, conflicts, defaults, or final parameter writes. CQL/Lucene combination uses the existing IR helpers.

### Target and parameters

```ts
type FormTarget<Accepted extends readonly FormOutputName[]> = {
	readonly acceptedOutputs: Accepted;
	readonly targetView?: ViewName;
	// Future expansion for dynamic resultview dispatch, not required for initial implementation.
	readonly supportedEndpoints: readonly BlackLabEndpointName[];
	compile(emissions: readonly FormEmission<Accepted[number]>[], issues: FormIssue[]): Params; // placeholder, real implementations will be specialized and return SearchParams or CollocationParams;
};

type ViewName = 'hits' | 'docs'; // for now, will be extended in future.
type BlackLabEndpointName = 'hits' | 'docs' | 'hits-grouped' | 'docs-grouped' | 'collocations';
```

A form target is the form-node-bound compilation/verification object shown above. A small factory may end up useful to create one when defaults or required `searchfield` behaviour differ, but the form boundary stores the resulting target directly. The target does not know about controllers, visual containers, summaries, persistence, or table mode.

A target identifies a request-compilation family, not the currently visible results view. Its accepted outputs and lowering remain fixed while `targetView` is only a handoff preference; for example, ordinary search parameters can feed either hits or documents. The target therefore has no need to inspect live view state.

### Target compilation

The form target receives supported, structurally valid emissions from the Form Boundary. It intimately knows its outputs and parameter types and imperatively compiles them. Output/Parameter pairs that are to be shared between targets are extracted into helpers/compilers for reuse.

For now, a target's compile step publishes every individually lowerable parameter, even when another output is missing or a cross-output combination is invalid. Missing required values produce issues and remain omitted.
In a later implementation pass, if a Target determines the parameter set would be invalid, it may signal and abort the form submission, but this is left for later.

`compile` makes one ordered pass with an explicit switch and compile-local variables, applying repetition and conflict rules as values arrive; it then performs completion, cross-output checks, normalization, and lowering. Targets may share helpers.

The initial targets use these explicit accumulation rules:

- All named outputs/parameters, except those explicitly stated below, use the first value. A second value is ignored and a warning about the conflict is generated; it is assumed that at some point in the collection stage a collection scope will have combined multiple outputs of these types into one (typically at the root Form Node at the latest). The target does not attempt to combine multiple values.
- A `null` value is only output if no subsequent non-empty value is encountered. The null is gracefully replaced with the value, without generating a warning.
- `group`, and `sort` are the sole exceptions to the single-value rule, multiple values are instead concatenated using comma, as per BlackLab rules. A `null` Parameter must only be generated when Output values for the property are `null` or semantically equivalent to the empty string.
- String scalars are trimmed and dropped if empty. Emission of semantically empty values should ideally not happen, and controllers should strive to prevent such emissions. A semantically empty value followed by a non-empty value is replaced without warning. A semantically empty value followed by another semantically empty value is ignored without warning.

### Form compilation result

The outer result contains `formId`, compiled form-owned values under `params`, summaries, encoded state, restoration and compilation `issues`, the target's optional `targetView`, and an optional `resultPreset`. `issues` is always an array. The compiler copies `targetView` from the form-bound target so the results boundary does not need to look the form or target up again.

```ts
type ResultPreset = {
	groupDisplayMode?: 'table' | 'docs' | 'hits' | 'relative docs' | 'relative hits' | 'tokens' | null;
};
```

This is the existing results table's `groupDisplayMode`, not a second parameter bag. Move the mode union to the results model so both form and table code import it; form model code must not import from `pages/`. Grouping, sorting, span requirements, collocation settings, and every other BlackLab-facing value are ordinary outputs. Multiple table-mode contributions use the same first-valid-wins rule as scalar outputs.

Runtime submission, restoration, and canonical restored-state comparison call the same collect-and-compile operation. Encoded state, summaries, and issues do not participate in compiled-parameter equality. The published result remains a compiled snapshot; intermediate emissions and semantic IR do not need to enter application result state.

### Ownership boundaries

| Concern                                                      | Owner                                  |
| ------------------------------------------------------------ | -------------------------------------- |
| Semantic output values and CQL/Lucene trees                  | Form output/IR model                   |
| Producing values from field state                            | Field controllers                      |
| Child order, active children, walking, and local composition | Form walker and intermediate scopes    |
| Selecting a target and accepting its declared outputs        | Form Boundary                          |
| Relocating query contributions                               | Query slots and builder-owned bindings |
| Reprojecting one completed output into another               | Output projectors                      |
| Validating cross-output semantics and lowering parameters    | Form Target compiler                   |
| Summaries, encoded state, and restoration bookkeeping        | Form collection and persistence        |
| Live grouping/sorting and active result-view state           | Results system                         |
| Calling BlackLab endpoints                                   | API request boundary                   |

The form builder may describe targets, bindings, and query-only subgraphs, but it does not perform endpoint compilation. Rendering, form walking, target compilation, result-state handling, and API dispatch remain separate graph consumers or system boundaries.

### Handoff to results

#### This is future work.

For now, the form target will carry the preferred view, but it will not be wired up.
A temporary handoff adapter (until result views are refactored/generalized) will inspect whether 'patt' is present, and activate 'hits' or 'docs' accordingly. The handoff will also make the compiled parameters available in the `query-state` in a way that is compatible with the current results system, so that the results system will require minimal adaptation at this time.

There are multiple ways for results to be displayed. Currently only 'hits' and 'docs'.
A FormTarget can optionally prefer a certain resultsview.
Handoff will:

- use the preferred view if it exists and accepts at least one of the Form Target's declared endpoint names (as declared by the FormTarget)
- otherwise use the current view if it exists and accepts at least one of the Form Target's declared endpoint names.
- find the first view that satisfies the condition otherwise

Views will need to be extended with a list of endpoints whose results they can interpret
Form Targets will likewise specify one or more endpoints from this list.

Inside the results system, certain parameters may be treated specifically.
For example, `group` and `sort` are only used conditionally:

- omitted/empty/undefined: keep the current live value;
- `null`: clear the current live value; and
- anything else: update the live value.

### Restoration

URL/history restoration restores the recorded active view, `group`, `sort`, and `groupDisplayMode` separately from scoped form values. Both may coexist in serialized state; restored live state is authoritative, and restoration does not apply `ResultPreset`. The restored compiled form params become the current comparison value, so the next equal submission does not overwrite restored live grouping or sorting.

## Core invariants

- Output names and semantic values are paired by `FormOutputValues`; ordinary TypeScript code does not pass `unknown` output values around.
- Outputs describe semantic value families, not generic accumulation behavior.
- Scope combiners operate on semantic IR; real compilers own stringification.
- `patt` and `collpatt` share reusable parts (compilation/combinatory IR) while remaining distinct outputs.
- Every intermediate query node consumes and produces the same emission-batch shape.
- Every target defines accumulation and parameter semantics per accepted output.
- Unknown, undeclared, unsupported, malformed, conflicting, missing, and cross-output-invalid values become structured issues.
- Rejected contributions never replace already-retained values.
- Compilation remains synchronous, compile-local, and tolerant.
- Submission proceeds with every compilable parameter, including a partial or empty bag.
- Equality of normalized compiled parameter bags, rather than form or graph identity, determines repeated-submission handoff.
- Runtime submission and restoration share the same collection and compilation path.
- The form system has not shipped; replace prototype APIs directly, without compatibility aliases.

## Implementation sequence

### 0. Temporarily remove the collocation code [Completed]

- Preserve the typed parameters and api endpoints
- Preserve the controller and associated Vue Component
- Remove all collocation-related code from URL handling, persistence, results, and intermediate form-value-collection types

### 1. Establish outputs, collection, and search targets

Introduce:

- the shared semantic output vocabulary;
- the tolerant `Emit` sink and typed emission batches;
- structured compilation issues;
- standardize scoped collection;
- the target compile contract and preferred view; and
- one end-to-end collect-and-compile operation.

Expand restored raw overrides and field suspension to every parameter the form system can emit, except this externally mutable whitelist: `start`, `number`, `sort`, `group`, `groupDisplayMode`, `viewgroup`, `sample`, `samplenum`, `sampleseed`, and `context`.

Migrate all controllers and synthetic active-child contributions to emissions rather than returns. Replace the current `QueryIR` directly; do not put the new sink behind an adapter.

Add the temporary `getResultPreset()` controller pass-through described in this task and use it only for the table-mode controller. Carry its result beside emission batches and publish the first defined `groupDisplayMode` on the compiled result.

Migrate the badge-variant to use the new `summarize()` to count active fields.

Define the ordinary search target family with at least:

- `patt`;
- `filter`;
- `searchfield`;
- `group`;
- `sort`; and
- `withspans`.

For every accepted output, define conflict handling, completion checks, normalization, lowering, and parameter writing explicitly in the form target. Attach an optional preferred view at each form boundary.

Add a temporary handoff helper in between the form system output and the results system, using the query-state singleton store. It should be restructured to receive the compiled form parameters and contain compat logic so the resultsviews do not need to know about where their request parameters came from. Preserve the current withspans override logic.

For old-search compatibility, the CQL compiler must be updated to recognize `within` and `containing` nodes, and special-case them as wrappers around the complete query regardless of graph position. Multiple `within` nodes retain existing overlap compilation. Span inclusion remains the separate `withspans` output; remove the old CQL `with-spans` wrapper and preset path.

Tests must cover ordinary search/restoration, preferred-view cases, `undefined`, unknown and undeclared outputs, target mismatches, malformed values, requiredness, repeated-value policies, post-gather normalization, form walking precedence, parameter defaults/writes, partial and empty bags, unrelated valid outputs, and invalid effective result sets.

Rewrite producers and consumers before narrowing `ResultPreset`. Remove legacy preset properties, controller paths, collocation option-bag bridges, fallback readers, dual reads/writes, and aliases.

#### Explore

Migrate Explore controllers as follows:

- frequency exploration emits `patt` and `group`;
- n-gram grouping and corpus exploration emit `group`;
- query-side sorting emits `sort`;
- CQL controls requiring spans emit `withspans`; and
- the table control contributes only table mode.

Use separate targets:

- corpora: explicit `docs`;
- n-gram: explicit `hits`;
- frequency: explicit `hits`.

Explicit submissions use the common parameter-equality and one-way handoff semantics. Restoration separately restores active view, live grouping/sorting, and table mode.

#### Temporary table-mode preset handling

Add a temporary pass-through method to relevant controller (`resultGroupDisplayModeController`):

```ts
getResultPreset?(
  config: FieldControllerProps<Extra>,
  runtime: FormRuntimeContext,
  state: State,
): Readonly<Pick<ResultPreset, "groupDisplayMode">> | undefined;
```

The walker calls it beside value collection and passes a returned preset through intermediate scopes unchanged. This method is a temporary migration seam, not part of the final controller contract. Final pass-through to results occurns on form submit, via existing `view-state` mechanism.

Tests must cover resultview selection, grouping/table mode, all Explore outputs and target bindings, the table-only preset shape, changed and unchanged resubmission, one-way live edits, restored-live-state precedence, scoped/live coexistence, and URL/history snapshots.

### 1.5. Fix issues raised by review

## Findings

1. **P1 — Raw overrides can violate the selected target’s parameter contract.**  
   `compileFormNode` runs target acceptance/compilation, then writes every global restorable parameter directly into the result (`src/features/form/model/persistence.ts:317-321`). Consequently, a search target can publish collocation-only parameters from `RESTORABLE_FORM_PARAMETERS` (`src/features/form/model/types/blacklab-params.ts:41-53`) without accepting or validating them. The resulting object may satisfy neither `SearchParams` nor `CollocationParams`.  
   Preserve these overrides, but only publish parameters permitted by the target—ideally through an explicit target-owned override policy.

2. **P1 — The Form Boundary invariant is not enforced.**  
   `compileFormNode` accepts any `FormNode` and silently substitutes `searchTarget` for non-form nodes (`src/features/form/model/persistence.ts:307-309`); `FormRuntime.compile` uses generic `getNode` (`src/features/form/model/form-runtime.ts:35-38`). This bypasses the target boundary. It should accept `FormBoundaryNode`, and runtime lookup should use `getForm()`.

3. **P1 — Nested forms are accepted and their inner target is ignored.**  
   Builder validation checks IDs and cycles but not nested forms (`src/features/form/model/builder/form-shape-builder.ts:186-207,230-238`). Collection then treats an inner form as an ordinary container (`src/features/form/model/compile/index.ts:193-219`), compiling all descendants with the outer target. This directly contradicts “Forms cannot be nested.”

4. **P2 — Declared outputs are not used for graph diagnostics.**  
   Controller `outputs` are used for suspension and to detect emissions that were not declared (`src/features/form/model/compile/index.ts:57-61`), but there is no post-assembly check against each reachable form target. A controller declaring only unsupported outputs remains silent until it actually emits one. This misses the task’s graph-diagnostics requirement and makes customization mistakes state-dependent.

5. **P2 — Invalid effective hits sets are not covered through the real target.**  
   `hitsSearchTarget` does not require `patt` (`src/features/form/model/targets.ts:121-123`), although the API and results view reject hits without one (`src/shared/api/blacklabApi.ts:367-369`, `src/pages/search/results/ResultsView.vue:477-479`). Requiredness tests only exercise ad-hoc targets; there is no end-to-end invalid-effective-set test for `hitsSearchTarget`.

## Taste pass

The delegated reviewer agreed with findings 1–2 and raised these placement/naming concerns:

- Walking, scoped composition, acceptance, and badge counting live in the implementation-heavy `model/compile/index.ts`, while end-to-end compilation lives in `model/persistence.ts`. Prefer something like:
  - `model/collect.ts` or `model/collection/form-collector.ts`
  - `model/compile/compile-form.ts`
  - persistence limited to encoding/restoration.
- `result-preset-controller.ts` is now misleading: `resultGroupByController` and `resultSortController` emit normal semantic outputs, not presets (`src/features/form/model/controllers/result-preset-controller.ts:13-28`). Split or rename it.

The semantic vocabulary, target compiler, Explore target bindings, CQL wrapper handling, and handoff direction otherwise look coherent.

## Validation

- `npm run lint` — passed
- Full unit suite — **46 files, 667 tests passed**
- Working tree clean; `git diff --check` passed

No files were changed.

### 2. Route descendants through form walking

Apply the common form-walking contract to compound and embedded fields. A compound field combines only the output names it supports according to its container mode and passes unrelated emissions through. Configured active-child contributions use the same producer contract.

Embedded-field controllers use the same mechanism:

- token sequence captures bounded token CQL outputs and emits one sequence;
- parallel captures child patterns and emits completed `patt` and `searchfield` values;
- unexpected child outputs produce issues;
- child summaries remain separate.

Replace the temporary `getResultPreset()` method with the final typed frontend-result contribution sink in the common collection contract. Migrate the table-mode controller to that sink, preserve first-defined `groupDisplayMode` handling and unchanged scope pass-through, then remove the temporary method and its walker branch. Frontend-result contributions remain separate from semantic emissions and do not count for `hasEmissions`.

Add `hasEmissions(field, state, context)` by walking the field with the normal collection operation and checking for at least one non-`undefined` semantic value. It discards the collected values and issues after inspection; there is no separate probe implementation. Summaries and `ResultPreset` alone do not count, and tab badges call it at most once per field.

Tests must cover nested capture, batch/target-compilation separation, `and`/`or`/`sequence`, form walking order, CQL/Lucene composition, pass-through and conflicts, active-child producers, sequence/parallel fields, complete-query wrappers, multiple-`within` overlap, unexpected embedded outputs, badge collection, and one collected summary batch per source field.

### 3. Add output projection

Add a unary projector, initially supporting `patt -> collpatt`. A finalized projector has exactly one child; the builder rejects zero or multiple children.

During form walking, it scope-combines the descendant source output under the destination name and passes unrelated emissions through unchanged. Projection changes output identity only; it does not change field state or visual placement. Express allowed mappings as a typed union so TypeScript accepts only value-compatible pairs. The runtime `invalid-projection` issue is a defensive check for untyped customization input.

This lets ordinary token, expert-CQL, boolean, sequence, `within`, and `containing` controls construct either output without target-specific controller logic.

Tests must cover nested projection, parent composition of projected values, pass-through, incompatible mappings, and a collocation form using ordinary CQL controllers beneath a projector.

### 4. Collocation

Define a collocation target with independently specified accumulation and lowering for:

- `patt`, `collpatt`, `filter`, and `searchfield`;
- `colltype`, `context`, `within`, and `reltype`;
- `annotation`, `sensitive`, and `scorertype`; and
- `group` and `sort`.

The target applies defaults, validates cross-output combinations, delegates CQL/Lucene compilation, lowers scalars, and returns every compilable parameter.
It uses the existing UI defaults: `colltype: 'proximity'`, proximity `context: 5`, the form-bound main annotation, `sensitive: false`, and `scorertype: 'coll-dice'`.
It requires a non-empty compiled `patt`. For proximity, `reltype` is invalid; for relation types, `context` and endpoint `within` are invalid. These combinations produce issues without deleting otherwise lowerable values.

The collocation controller parses its current string-based UI state and emits semantic values directly. It emits the applicable `context` or `reltype`, grouping for the collocation table, and `groupDisplayMode: 'table'` through `ResultPreset`. Invalid context text produces an issue rather than entering its emission batch. Its target explicitly selects `hits`; `searchfield` remains optional for the current collocation form, which has no source-field selector. Results-side validation recognizes the target's always-present `colltype` parameter and selects the collocation operation.

Keep the two meanings of `within` distinct. CQL `within` and `containing` nodes inside `patt` or `collpatt` wrap the complete CQL query for that output and may represent CQL element attributes. The collocation endpoint's separate `within` output is only valid for proximity collocations, constrains the complete keyword/collocate match to one element, and is a plain element name with no CQL attributes. Projectors and targets must not silently reinterpret one meaning as the other: users may intentionally constrain only `patt` or only `collpatt`.

### 5. Add query portals and slots

Add query placement only after targets, scoped composition, projection, and collocation work without it.

Usually the visual container graph and the desired query tree are similar enough for the normal form walk to serve both. Query slots are the narrow exception mechanism: they preserve the visual form graph as the default and describe only the contributions whose semantic placement differs.

A **query slot** relocates an existing field, container, projector, or query-only subgraph for collection:

- rendering still follows visual edges;
- form walking follows the slot edge;
- the source's ordinary query occurrence is suppressed;
- the complete multi-output emission batch moves unchanged; and
- slots do not compose or transform outputs.

A slot stores a direct builder-owned reference to its source. Bindings are form-relative because only slots reachable from the submitted form affect that form; do not put a moved marker on the source node. Initial rules:

- one source per slot;
- one effective destination per source in a form;
- move, not copy;
- reject visual/query cycles and a source with ambiguous ordinary occurrences in that form; and
- do not fall back to the visual occurrence when an effective destination exists but is inactive for that collection.

Here, an effective destination is a slot reachable by form walking after runtime branch selection. Presentation-only tabs do not deactivate child query contributions. A slot that belongs only to another form is not an effective destination in the submitted form and does not suppress the submitted form's visual occurrence.

Containers reachable only through slot edges may provide query-only `and`, `or`, or `sequence` composition. They replace the need for a special transparent-scope node. For example, controls can remain visually flat while slots construct a different query tree:

```text
visual layout       effective query
├── x               OR container
├── y               ├── SEQUENCE container
└── z               │   ├── slot → x
                    │   └── slot → y
                    └── slot → z
```

This constructs `([lemma="x"] [lemma="y"]) | [lemma="z"]` directly. It is safer than post-hoc moves in an already aggregated AST, which would require unstable paths and extra rules about insertion order and whether modifiers move with a selected node.

Query-only containers, projectors, and slots are stateless. In the initial implementation, every stateful field must remain visually reachable so rendering, default-state creation, and persistence have one simple source of truth. A slot does not clone field state, persistence, or summaries; those remain owned by the source and are observed according to the normal collection and deduplication rules.

Rendering follows only visual child edges; form walking and target diagnostics follow the effective query graph. `replaceNode` preserves incoming visual and slot edges, `removeNode` removes both kinds of incoming edge, and pruning uses the union of visual and query reachability. Source state is read at its effective query occurrence.

Tests must cover relocation, query-only composition, form-relative shared sources, inactive destinations, duplicate/ambiguous bindings, replacement/removal/pruning, and visual/query cycles.
