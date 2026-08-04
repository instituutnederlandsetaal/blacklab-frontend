import { combineQueries } from '@/features/form/model/compile/query-artifact';
import { isContainerNode } from '@/features/form/model/form-utils';
import type { FormStateInput } from '@/features/form/model/state';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { queryIR, type QueryIR } from '@/features/form/model/types/form-query-ir';
import type { FormContainerLikeNode, FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';

export function buildQueryIR(node: FormNode, formState: FormStateInput, context: FormRuntimeContext): QueryIR {
	const summarizedFields = new Set<FormFieldNode>();
	if (isContainerNode(node)) return getQueryContributionFromContainer(node, formState, context, summarizedFields);
	if (node.kind === 'field') return getFieldQueryContribution(node, context, formState.state[node.id]);
	return queryIR();
}

function getQueryContributionFromContainer(node: FormContainerLikeNode, formState: FormStateInput, context: FormRuntimeContext, summarizedFields: Set<FormFieldNode>): QueryIR {
	// NOTE, we need to walk the full tree,
	// because nodes can be present in multiple places in the tree, and we need to make sure that all contributions are included in the final query.
	// Also containers specify how child nodes are combined, so we need to walk the full tree to get the correct combination of contributions.
	// The summaries however are collected only once per unique node, so we need to keep track of which nodes have already contributed summaries to avoid duplicates.
	const childContributions = node.children.reduce<QueryIR[]>((acc, child) => {
		if (child.kind === 'field') {
			const contribution = getFieldQueryContribution(child, context, formState.state[child.id]);
			if (summarizedFields.has(child)) acc.push({ ...contribution, summaries: [] });
			else {
				summarizedFields.add(child);
				acc.push(contribution);
			}
		} else if (isContainerNode(child)) {
			acc.push(getQueryContributionFromContainer(child, formState, context, summarizedFields));
		}
		return acc;
	}, [] as QueryIR[]);

	const selectedChild = node.children.find(child => child.id === formState.uiState[node.id]);
	const activeChildContribution = selectedChild ? node.activeChildQueryContributions?.[selectedChild.id] : undefined;
	if (activeChildContribution) childContributions.push(activeChildContribution);

	const combineMode = node.kind === 'container' ? node.combine : undefined;
	return combineQueries(childContributions, combineMode);
}

export function getFieldQueryContribution(node: FormFieldNode, context: FormRuntimeContext, state: unknown): QueryIR {
	const contribution = node.controller.getQueryContribution(node, context, state) ?? queryIR();
	const summaryType = node.controller.affectsBlackLabParameters;

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
