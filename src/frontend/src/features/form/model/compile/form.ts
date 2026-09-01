import { resolvePersistenceSchema, type PersistenceSchema } from '@/features/form/model/persistence/schema';
import type { NewFormState } from '@/features/form/model/state';
import type { FormOverrides, FormParams } from '@/features/form/model/types/blacklab-params';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormEmission, FormIssue, FormOutputName } from '@/features/form/model/types/form-output';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';

import { collectFormSummaryValues, collectFormValues } from './gather';

/** Copy one typed override while preserving the correlation between its key and value. */
function copyOverride<Key extends keyof FormOverrides>(target: FormOverrides, source: Readonly<FormOverrides>, key: Key): void {
	target[key] = source[key];
}

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
	const baseline: Readonly<Partial<FormOverrides>> = params;
	for (const key of Object.keys(candidates) as (keyof FormOverrides)[]) {
		if (candidates[key] !== baseline[key]) copyOverride(overrides, candidates, key);
	}
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
