import { resolvePersistenceSchema, type PersistenceSchema } from '@/features/form/model/persistence/schema';
import type { FormOverrides, NewFormState } from '@/features/form/model/state';
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

function compileCollected(node: FormBoundaryNode, collected: Pick<ReturnType<typeof collectFormValues>, 'emissions' | 'issues'>) {
	const target = node.target;
	const accepted = filterTargetEmissions(collected.emissions, target.acceptedOutputs, collected.issues);
	return target.compile(accepted as never, collected.issues);
}

export function compileFormNode(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext, schema: PersistenceSchema = resolvePersistenceSchema(node, context)): CompiledFormResult {
	const collected = collectFormValues(node, state, context, schema);
	const { persistence, resultPreset, summaries } = collected.channels;

	return {
		formId: node.id,
		params: compileCollected(node, collected),
		encoded: persistence!.encoded,
		issues: collected.issues,
		summaries: summaries!,
		...(node.target.targetView ? { targetView: node.target.targetView } : {}),
		...(resultPreset!.value !== undefined ? { resultPreset: resultPreset!.value } : {}),
	};
}

/** Compile the live-summary projection without resolving persistence or result-preset channels. */
export function compileFormSummary(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext): CompiledFormSummary {
	const collected = collectFormSummaryValues(node, state, context);
	return { params: compileCollected(node, collected), summaries: collected.summaries };
}

export function applyRawOverrides<Result extends Pick<CompiledFormResult, 'params'>>(result: Result, rawOverrides: Readonly<FormOverrides>, acceptedOutputs: readonly FormOutputName[]): Result {
	return {
		...result,
		params: {
			...result.params,
			...Object.fromEntries(Object.entries(rawOverrides).filter(([parameter]) => acceptedOutputs.includes(parameter as FormOutputName))),
		},
	} as Result;
}
