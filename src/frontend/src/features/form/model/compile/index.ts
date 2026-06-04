import { combineQueryContributions, createQueryContribution } from '@/features/form/model/compile/query-artifact';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompilableQuery, QueryContribution, SummaryEntry } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode, FormContainerLikeNode, FormFieldNode } from '@/features/form/model/types/form-shape';
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

function getQueryContributionFromContainer(node: FormContainerLikeNode, formState: FormState, context: FormRuntimeContext): QueryContribution {
	const childContributions = node.children.reduce<QueryContribution[]>((acc, child) => {
		if (child.kind === 'field') acc.push(getQueryContributionFromField(child, context, formState));
		else if (child.kind === 'container' || child.kind === 'form') {
			acc.push(getQueryContributionFromContainer(child, formState, context));
			if (child.activeQueryContribution && formState.uiState.activeContainers[node.id] === child.id) {
				acc.push(typeof child.activeQueryContribution === 'function' ? child.activeQueryContribution(child) : child.activeQueryContribution);
			}
		}
		return acc;
	}, [] as QueryContribution[]);

	const combineMode = node.kind === 'container' ? node.combine : undefined;
	return combineQueryContributions(combineMode, ...childContributions);
}

function getQueryContributionFromField(node: FormFieldNode, context: FormRuntimeContext, formState: FormState): QueryContribution {
	return node.controller.getQueryContribution?.(node, context, formState.controllerState[node.id]) ?? createQueryContribution();
}
