import { resolvePersistenceSchema, type PersistenceSchema } from '@/features/form/model/persistence/schema';
import type { NewFormState } from '@/features/form/model/state';
import type { FormOverrides, FormParams } from '@/features/form/model/types/blacklab-params';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormEmission, FormIssue, FormOutputName } from '@/features/form/model/types/form-output';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';

import { collectFormSummaryValues, collectFormValues } from './gather';

function filterTargetEmissions<Names extends readonly FormOutputName[]>(emissions: readonly FormEmission[], acceptedOutputs: Names, issues: FormIssue[]): FormEmission<Names[number]>[] {
	const result: FormEmission<Names[number]>[] = [];
	for (const emission of emissions) {
		if (!acceptedOutputs.includes(emission.name as Names[number])) {
			issues.push({ severity: 'warning', message: `The form target does not accept output '${emission.name}'; ignoring it.` });
			continue;
		}
		result.push(emission as FormEmission<Names[number]>);
	}
	return result;
}

function selectOverrides(candidates: Readonly<FormOverrides>, params: Readonly<FormParams>): FormOverrides {
	const overrides: FormOverrides = {};
	const collocation = params.colltype === undefined ? undefined : params;
	if (candidates.patt !== undefined && candidates.patt !== params.patt) overrides.patt = candidates.patt;
	if (candidates.collpatt !== undefined && candidates.collpatt !== collocation?.collpatt) overrides.collpatt = candidates.collpatt;
	if (candidates.filter !== undefined && candidates.filter !== params.filter) overrides.filter = candidates.filter;
	if (candidates.searchfield !== undefined && candidates.searchfield !== params.searchfield) overrides.searchfield = candidates.searchfield;
	if (candidates.withspans !== undefined && candidates.withspans !== params.withspans) overrides.withspans = candidates.withspans;
	if (candidates.colltype !== undefined && candidates.colltype !== params.colltype) overrides.colltype = candidates.colltype;
	if (candidates.context !== undefined && candidates.context !== collocation?.context) overrides.context = candidates.context;
	if (candidates.within !== undefined && candidates.within !== collocation?.within) overrides.within = candidates.within;
	if (candidates.reltype !== undefined && candidates.reltype !== collocation?.reltype) overrides.reltype = candidates.reltype;
	if (candidates.annotation !== undefined && candidates.annotation !== collocation?.annotation) overrides.annotation = candidates.annotation;
	if (candidates.sensitive !== undefined && candidates.sensitive !== collocation?.sensitive) overrides.sensitive = candidates.sensitive;
	if (candidates.scorertype !== undefined && candidates.scorertype !== collocation?.scorertype) overrides.scorertype = candidates.scorertype;
	return overrides;
}

function createCompiledResult(node: FormBoundaryNode, collected: ReturnType<typeof collectFormValues>, params: FormParams, issues: FormIssue[]): CompiledFormResult {
	const { persistence, resultPreset, summaries } = collected.channels;

	return {
		formId: node.id,
		params,
		encoded: persistence!.encoded,
		issues,
		summaries: summaries!,
		...(node.target.targetView ? { targetView: node.target.targetView } : {}),
		...(resultPreset!.value !== undefined ? { resultPreset: resultPreset!.value } : {}),
	};
}

export function compileFormNode(
	node: FormBoundaryNode,
	state: NewFormState,
	context: FormRuntimeContext,
	overrides: Readonly<FormOverrides> = {},
	schema: PersistenceSchema = resolvePersistenceSchema(node, context),
): CompiledFormResult {
	const collected = collectFormValues(node, state, context, schema);
	const accepted = filterTargetEmissions(collected.emissions, node.target.acceptedOutputs, collected.issues);
	const params = node.target.compile(accepted as never, collected.issues, overrides);
	return createCompiledResult(node, collected, params, collected.issues);
}

export function compileRestoredFormNode(
	node: FormBoundaryNode,
	state: NewFormState,
	context: FormRuntimeContext,
	candidates: Readonly<FormOverrides>,
	schema: PersistenceSchema = resolvePersistenceSchema(node, context),
): { result: CompiledFormResult; overrides: FormOverrides } {
	const collected = collectFormValues(node, state, context, schema);
	const accepted = filterTargetEmissions(collected.emissions, node.target.acceptedOutputs, collected.issues);
	const baseline = node.target.compile(accepted as never, []);
	const overrides = selectOverrides(candidates, baseline);
	const issues = [...collected.issues];
	const params = node.target.compile(accepted as never, issues, overrides);
	return { result: createCompiledResult(node, collected, params, issues), overrides };
}

/** Compile the live-summary projection without resolving persistence or result-preset channels. */
export function compileFormSummary(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext, overrides: Readonly<FormOverrides> = {}): CompiledFormSummary {
	const collected = collectFormSummaryValues(node, state, context);
	const accepted = filterTargetEmissions(collected.emissions, node.target.acceptedOutputs, collected.issues);
	return { params: node.target.compile(accepted as never, collected.issues, overrides), summaries: collected.summaries };
}
