import { combineQueryContributions, createQueryContribution } from '@/features/form/model/compile/query-artifact';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompilableQuery, QueryContribution, SummaryEntry } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode, FormContainerNode, FormFieldNode } from '@/features/form/model/types/form-shape';
import type { FormState } from '@/features/form/model/types/form-state';

export function buildFormQuery(form: FormBoundaryNode, formState: FormState, context: FormRuntimeContext): CompilableQuery {
	return getFormQueryContribution(form, formState, context).query;
}

export function summarizeForm(form: FormBoundaryNode, formState: FormState, context: FormRuntimeContext): SummaryEntry[] {
	return getFormQueryContribution(form, formState, context).summaries;
}

export function getFormQueryContribution(form: FormBoundaryNode, formState: FormState, context: FormRuntimeContext): QueryContribution {
	return getQueryContributionFromContainer(form, formState, context);
}

function getQueryContributionFromContainer(node: FormContainerNode | FormBoundaryNode, formState: FormState, context: FormRuntimeContext): QueryContribution {
	const childContributions = node.children.reduce<QueryContribution[]>((acc, child) => {
		if (child.kind === 'field') acc.push(getQueryContributionFromField(child, context, formState));
		else if (child.kind === 'container') acc.push(getQueryContributionFromContainer(child, formState, context));
		return acc;
	}, [] as QueryContribution[]);

	return combineQueryContributions(childContributions, node.kind === 'container' ? node.config?.combine : 'allOf');
}

function getQueryContributionFromField(node: FormFieldNode, context: FormRuntimeContext, formState: FormState): QueryContribution {
	return (
		node.controller.getQueryContribution?.({
			node,
			state: formState.controllerState[node.id],
			runtime: context,
		}) ?? createQueryContribution()
	);
}
