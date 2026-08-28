import { getAllNodes } from '@/features/form/model/form-utils';
import { resolvePersistenceSchema, type PersistenceSchema } from '@/features/form/model/persistence/schema';
import type { FormOverrides, NewFormState } from '@/features/form/model/state';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { isFormOutputName, isValidEmission, type FormEmission, type FormIssue, type FormOutputName, type RawEmission } from '@/features/form/model/types/form-output';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';

import { collectFormSummaryValues, collectFormValues } from './gather';

function reportAcceptanceIssue(issues: FormIssue[], code: 'malformed-output' | 'unsupported-output', output: string, message: string, nodeId?: string): void {
	issues.push({ stage: 'accept', code, output, message, ...(nodeId === undefined ? {} : { nodeId }) });
}

export function diagnoseTargetOutputs(form: FormBoundaryNode, acceptedOutputs: readonly FormOutputName[], issues: FormIssue[]): void {
	const accepted = new Set(acceptedOutputs);
	for (const field of getAllNodes(form, 'field')) {
		for (const output of new Set(field.controller.outputs)) {
			if (accepted.has(output)) continue;
			reportAcceptanceIssue(issues, 'unsupported-output', output, `Controller for '${field.id}' declares output '${output}', which the form target does not accept.`, field.id);
		}
	}
}

export function acceptTargetEmissions<Names extends readonly FormOutputName[]>(emissions: readonly RawEmission[], acceptedOutputs: Names, issues: FormIssue[]): FormEmission<Names[number]>[] {
	const valid: FormEmission[] = [];
	for (const emission of emissions) {
		if (!isFormOutputName(emission.name)) continue;
		if (!acceptedOutputs.includes(emission.name)) valid.push(emission as FormEmission);
		else if (emission.value !== undefined && isValidEmission(emission)) valid.push(emission);
		else if (emission.value !== undefined) reportAcceptanceIssue(issues, 'malformed-output', emission.name, `Ignoring malformed output '${emission.name}'.`);
	}
	return filterTargetEmissions(valid, acceptedOutputs, issues);
}

function filterTargetEmissions<Names extends readonly FormOutputName[]>(emissions: readonly FormEmission[], acceptedOutputs: Names, issues: FormIssue[]): FormEmission<Names[number]>[] {
	const accepted = new Set<FormOutputName>(acceptedOutputs);
	const result: FormEmission<Names[number]>[] = [];
	for (const emission of emissions) {
		if (!accepted.has(emission.name)) {
			reportAcceptanceIssue(issues, 'unsupported-output', emission.name, `The form target does not accept output '${emission.name}'.`);
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
	const accepted = filterTargetEmissions(collected.emissions, target.acceptedOutputs, issues);
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
		summaries: collected.summaries,
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
