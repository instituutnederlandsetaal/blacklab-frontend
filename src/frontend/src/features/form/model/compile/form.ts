import { resolvePersistenceSchema, type PersistenceSchema } from '@/features/form/model/persistence/schema';
import type { FormOverrides, NewFormState } from '@/features/form/model/state';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormEmission, FormIssue, FormOutputName } from '@/features/form/model/types/form-output';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';

import { collectFormSummaryValues, collectFormValues } from './gather';

function filterTargetEmissions<Names extends readonly FormOutputName[]>(emissions: readonly FormEmission[], acceptedOutputs: Names, issues: FormIssue[]): FormEmission<Names[number]>[] {
	const accepted = new Set<FormOutputName>(acceptedOutputs);
	const result: FormEmission<Names[number]>[] = [];
	for (const emission of emissions) {
		if (!accepted.has(emission.name)) {
			issues.push({ severity: 'warning', message: `The form target does not accept output '${emission.name}'; ignoring it.` });
			continue;
		}
		result.push(emission as FormEmission<Names[number]>);
	}
	return result;
}

function compileCollected(node: FormBoundaryNode, collected: ReturnType<typeof collectFormSummaryValues>) {
	if (node.kind !== 'form') throw new Error(`Cannot compile non-form node '${node.id}'.`);
	const target = node.target;
	const issues = collected.issues;
	const accepted = filterTargetEmissions(collected.emissions, target.acceptedOutputs, issues);
	return { params: target.compile(accepted as never, issues), issues };
}

export function compileFormNode(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext, schema: PersistenceSchema = resolvePersistenceSchema(node, context)): CompiledFormResult {
	const collected = collectFormValues(node, state, context, schema);
	const { params, issues } = compileCollected(node, collected);

	return {
		formId: node.id,
		params,
		encoded: collected.encoded,
		issues,
		summaries: collected.summaries,
		...(node.target.targetView ? { targetView: node.target.targetView } : {}),
		...(collected.resultPreset !== undefined ? { resultPreset: collected.resultPreset } : {}),
	};
}

/** Compile the live-summary projection without resolving persistence or result-preset channels. */
export function compileFormSummary(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext): CompiledFormSummary {
	const collected = collectFormSummaryValues(node, state, context);
	return { params: compileCollected(node, collected).params, summaries: collected.summaries };
}

export function applyRawOverrides<Result extends Pick<CompiledFormResult, 'params'>>(result: Result, rawOverrides: Readonly<FormOverrides>, acceptedOutputs: readonly FormOutputName[]): Result {
	const accepted = new Set<FormOutputName>(acceptedOutputs);
	return {
		...result,
		params: {
			...result.params,
			...Object.fromEntries(Object.entries(rawOverrides).filter(([parameter]) => accepted.has(parameter as FormOutputName))),
		},
	} as Result;
}
