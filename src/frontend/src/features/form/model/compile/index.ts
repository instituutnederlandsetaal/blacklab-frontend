import { combineQueryFragments, queryFragment } from '@/features/form/model/compile/query-artifact';
import { isContainerNode } from '@/features/form/model/form-utils';
import type { FormStateInput } from '@/features/form/model/state';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { QueryFragment } from '@/features/form/model/types/form-query';
import type { FormContainerLikeNode, FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';

export function buildQueryIR(node: FormNode, formState: FormStateInput, context: FormRuntimeContext): QueryFragment {
	if (isContainerNode(node)) return getQueryContributionFromContainer(node, formState, context);
	if (node.kind === 'field') return getFieldQueryContribution(node, context, formState.state[node.id]);
	return queryFragment();
}

function getQueryContributionFromContainer(node: FormContainerLikeNode, formState: FormStateInput, context: FormRuntimeContext): QueryFragment {
	const childContributions = node.children.reduce<QueryFragment[]>((acc, child) => {
		if (child.kind === 'field') acc.push(getFieldQueryContribution(child, context, formState.state[child.id]));
		else if (isContainerNode(child)) {
			acc.push(getQueryContributionFromContainer(child, formState, context));
			if (child.activeQueryContribution && formState.uiState[node.id] === child.id) {
				acc.push(typeof child.activeQueryContribution === 'function' ? child.activeQueryContribution(child) : child.activeQueryContribution);
			}
		}
		return acc;
	}, [] as QueryFragment[]);

	const combineMode = node.kind === 'container' ? node.combine : undefined;
	return combineQueryFragments(combineMode, ...childContributions);
}

export function getFieldQueryContribution(node: FormFieldNode, context: FormRuntimeContext, state: unknown): QueryFragment {
	const contribution = node.controller.getQueryContribution(node, context, state);
	const affectedParameters = node.controller.affectsBlackLabParameters;
	const summaryType = typeof affectedParameters === 'function' ? affectedParameters(node, context) : affectedParameters;

	return {
		...contribution,
		summaries: contribution.summaries.map(summary => {
			const typedSummary = {
				...summary,
				summaryType: summary.summaryType === undefined ? [...summaryType] : [...summary.summaryType],
			};
			if (typedSummary.group === undefined) delete typedSummary.group;
			return typedSummary;
		}),
	};
}
