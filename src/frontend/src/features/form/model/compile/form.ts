import { resolvePersistenceSchema, type PersistenceSchema } from '@/features/form/model/persistence/schema';
import type { NewFormState } from '@/features/form/model/state';
import type { FormOverrides, FormParams } from '@/features/form/model/types/blacklab-params';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormEmission, FormIssue, FormOutputName } from '@/features/form/model/types/form-output';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';

import { collectFormSummaryValues, collectFormValues } from './gather';

function filterTargetEmissions(emissions: readonly FormEmission[], acceptedOutputs: readonly FormOutputName[], issues: FormIssue[]): FormEmission[] {
	return emissions.filter(emission => {
		if (acceptedOutputs.includes(emission.name)) return true;
		issues.push({ severity: 'warning', message: `The form target does not accept output '${emission.name}'; ignoring it.` });
		return false;
	});
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
	const params = node.target.compile(accepted, collected.issues, overrides);
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
	const baseline: FormOverrides = node.target.compile(accepted, []);
	const overrides = Object.fromEntries(Object.entries(candidates).filter(([key, value]) => value !== baseline[key as keyof FormOverrides]));
	const params = node.target.compile(accepted, collected.issues, overrides);
	return { result: createCompiledResult(node, collected, params, collected.issues), overrides };
}

/** Compile the live-summary projection without resolving persistence or result-preset channels. */
export function compileFormSummary(
	node: FormBoundaryNode,
	state: NewFormState,
	context: FormRuntimeContext,
	overrides: Readonly<FormOverrides> = {},
	fieldVisitor?: Parameters<typeof collectFormSummaryValues>[3],
): CompiledFormSummary {
	const collected = collectFormSummaryValues(node, state, context, fieldVisitor);
	const accepted = filterTargetEmissions(collected.emissions, node.target.acceptedOutputs, collected.issues);
	return { params: node.target.compile(accepted, collected.issues, overrides), summaries: collected.summaries };
}
