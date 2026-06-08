import { combineQueryFragments, queryFragment } from '@/features/form/model/compile/query-artifact';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { QueryFragment } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode, FormContainerLikeNode, FormFieldNode } from '@/features/form/model/types/form-shape';
import type { FormState } from '@/features/form/model/types/form-state';

export function buildQueryIR(form: FormBoundaryNode, formState: FormState, context: FormRuntimeContext): QueryFragment {
	return getQueryContributionFromContainer(form, formState, context);
}

function getQueryContributionFromContainer(node: FormContainerLikeNode, formState: FormState, context: FormRuntimeContext): QueryFragment {
	const childContributions = node.children.reduce<QueryFragment[]>((acc, child) => {
		if (child.kind === 'field') acc.push(getQueryContributionFromField(child, context, formState));
		else if (child.kind === 'container' || child.kind === 'form') {
			acc.push(getQueryContributionFromContainer(child, formState, context));
			if (child.activeQueryContribution && formState.uiState.activeContainers[node.id] === child.id) {
				acc.push(typeof child.activeQueryContribution === 'function' ? child.activeQueryContribution(child) : child.activeQueryContribution);
			}
		}
		return acc;
	}, [] as QueryFragment[]);

	const combineMode = node.kind === 'container' ? node.combine : undefined;
	return combineQueryFragments(combineMode, ...childContributions);
}

function getQueryContributionFromField(node: FormFieldNode, context: FormRuntimeContext, formState: FormState): QueryFragment {
	return node.controller.getQueryContribution?.(node, context, formState.controllerState[node.id]) ?? queryFragment();
}
