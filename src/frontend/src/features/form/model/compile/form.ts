import { getAllNodes } from '@/features/form/model/form-utils';
import { resolvePersistenceSchema, type PersistenceSchema } from '@/features/form/model/persistence/schema';
import type { FormOverrides, NewFormState } from '@/features/form/model/state';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { isFormOutputName, isValidEmission, type FormEmission, type FormIssue, type FormOutputName, type RawEmission } from '@/features/form/model/types/form-output';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';

import { collectFormSummaryValues, collectFormValues } from './gather';

export function diagnoseTargetOutputs(form: FormBoundaryNode, acceptedOutputs: readonly FormOutputName[], issues: FormIssue[]): void {
	const accepted = new Set(acceptedOutputs);
	for (const field of getAllNodes(form, 'field')) {
		for (const output of new Set(field.controller.outputs)) {
			if (accepted.has(output)) continue;
			issues.push({
				stage: 'accept',
				code: 'unsupported-output',
				nodeId: field.id,
				output,
				message: `Controller for '${field.id}' declares output '${output}', which the form target does not accept.`,
			});
		}
	}
}

export function acceptTargetEmissions<Names extends readonly FormOutputName[]>(emissions: readonly RawEmission[], acceptedOutputs: Names, issues: FormIssue[]): FormEmission<Names[number]>[] {
	const accepted = new Set<FormOutputName>(acceptedOutputs);
	const result: FormEmission<Names[number]>[] = [];
	for (const emission of emissions) {
		if (!isFormOutputName(emission.name)) continue;
		if (!accepted.has(emission.name)) {
			issues.push({
				stage: 'accept',
				code: 'unsupported-output',
				output: emission.name,
				message: `The form target does not accept output '${emission.name}'.`,
			});
			continue;
		}
		if (emission.value === undefined) continue;
		if (!isValidEmission(emission)) {
			issues.push({
				stage: 'accept',
				code: 'malformed-output',
				output: emission.name,
				message: `Ignoring malformed output '${emission.name}'.`,
			});
			continue;
		}
		result.push(emission as FormEmission<Names[number]>);
	}
	return result;
}

function compileCollected(node: FormBoundaryNode, state: NewFormState, collected: ReturnType<typeof collectFormSummaryValues>) {
	if (node.kind !== 'form') throw new Error(`Cannot compile non-form node '${node.id}'.`);
	const target = node.target;
	const issues: FormIssue[] = [...((state as NewFormState & { issues?: readonly FormIssue[] }).issues ?? []), ...collected.issues];
	diagnoseTargetOutputs(node, target.acceptedOutputs, issues);
	const accepted = acceptTargetEmissions(collected.emissions, target.acceptedOutputs, issues);
	return { params: target.compile(accepted as never, issues), issues };
}

export function compileFormNode(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext, schema: PersistenceSchema = resolvePersistenceSchema(node, context)): CompiledFormResult {
	const collected = collectFormValues(node, state, context, schema);
	const { params, issues } = compileCollected(node, state, collected);

	return {
		formId: node.id,
		params,
		encoded: collected.encoded,
		issues,
		summaries: collected.summaries.map(summary => ({ ...summary, summaryType: summary.summaryType ? [...summary.summaryType] : undefined })),
		...(node.target.targetView ? { targetView: node.target.targetView } : {}),
		...(collected.resultPreset !== undefined ? { resultPreset: collected.resultPreset } : {}),
	};
}

/** Compile the live-summary projection without resolving persistence or result-preset channels. */
export function compileFormSummary(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext): CompiledFormSummary {
	const collected = collectFormSummaryValues(node, state, context);
	return { params: compileCollected(node, state, collected).params, summaries: collected.summaries };
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
