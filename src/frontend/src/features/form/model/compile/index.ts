import { combineQueries, createQueryArtifact } from '@/features/form/model/compile/query-artifact';
import { getAllFields } from '@/features/form/model/form-utils';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompilableQuery, SummaryEntry } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode, FormContainerNode, FormFieldNode } from '@/features/form/model/types/form-shape';
import type { FormState } from '@/features/form/model/types/form-state';

export function buildFormQuery(form: FormBoundaryNode, formState: FormState, context: FormRuntimeContext): CompilableQuery {
	return buildQueryFromContainer(form, formState, context);
}

export function summarizeForm(form: FormBoundaryNode, formState: FormState, context: FormRuntimeContext): SummaryEntry[] {
	return getAllFields(form).reduce<SummaryEntry[]>((acc, node) => {
		const built = node.controller.buildQuery?.({ node, state: formState.controllerState[node.id], runtime: context });
		if (built) acc.push(...built.summaries);
		return acc;
	}, []);
}

function buildQueryFromContainer(node: FormContainerNode | FormBoundaryNode, formState: FormState, context: FormRuntimeContext): CompilableQuery {
	const childClauses = node.children.reduce<CompilableQuery[]>((acc, child) => {
		if (child.kind === 'field') acc.push(buildQueryFromField(child, context, formState));
		else if (child.kind === 'container') acc.push(buildQueryFromContainer(child, formState, context));
		return acc;
	}, [] as CompilableQuery[]);

	return combineQueries(childClauses, node.kind === 'container' ? node.combine : 'allOf');
}

function buildQueryFromField(node: FormFieldNode, context: FormRuntimeContext, formState: FormState): CompilableQuery {
	return (
		node.controller.buildQuery?.({
			node,
			state: formState.controllerState[node.id],
			runtime: context,
		}) ?? createQueryArtifact()
	);
}
