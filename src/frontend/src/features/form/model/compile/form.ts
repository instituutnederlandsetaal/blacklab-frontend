import type { NewFormState } from '@/features/form/model/form-state';
import type { PersistenceSchema } from '@/features/form/model/persistence/schema';
import type { FormOverrides } from '@/features/form/model/types/blacklab-params';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormEmission, FormIssue, FormOutputName } from '@/features/form/model/types/form-output';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';

import { collectFormSummaryValues, collectFormValues, type FormFieldVisitor } from './gather';

function filterTargetEmissions(emissions: readonly FormEmission[], acceptedOutputs: readonly FormOutputName[], issues: FormIssue[]): FormEmission[] {
	return emissions.filter(emission => {
		if (acceptedOutputs.includes(emission.name)) return true;
		issues.push({ severity: 'warning', message: `The form target does not accept output '${emission.name}'; ignoring it.` });
		return false;
	});
}

export function compileFormWithOverrides(
	node: FormBoundaryNode,
	state: NewFormState,
	context: FormRuntimeContext,
	overrides: Readonly<FormOverrides>,
	mode: 'submit' | 'restore',
	schema?: PersistenceSchema,
) {
	const { emissions, ...collected } = collectFormValues(node, state, context, schema);
	const accepted = filterTargetEmissions(emissions, node.target.acceptedOutputs, collected.issues);
	if (mode === 'restore') {
		const baseline: FormOverrides = node.target.compile(accepted, []);
		overrides = Object.fromEntries(Object.entries(overrides).filter(([key, value]) => value !== baseline[key as keyof FormOverrides]));
	}
	const result: CompiledFormResult = {
		...collected,
		formId: node.id,
		params: node.target.compile(accepted, collected.issues, overrides),
		...(node.target.targetView ? { targetView: node.target.targetView } : {}),
	};
	return { result, overrides };
}

export function compileFormNode(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext, overrides: Readonly<FormOverrides> = {}, schema?: PersistenceSchema): CompiledFormResult {
	return compileFormWithOverrides(node, state, context, overrides, 'submit', schema).result;
}

/** Compile the live-summary projection without resolving persistence or result-preset channels. */
export function compileFormSummary(
	node: FormBoundaryNode,
	state: NewFormState,
	context: FormRuntimeContext,
	overrides: Readonly<FormOverrides> = {},
	fieldVisitor?: FormFieldVisitor,
): CompiledFormSummary {
	const collected = collectFormSummaryValues(node, state, context, fieldVisitor);
	const accepted = filterTargetEmissions(collected.emissions, node.target.acceptedOutputs, collected.issues);
	return { params: node.target.compile(accepted, collected.issues, overrides), summaries: collected.summaries };
}
