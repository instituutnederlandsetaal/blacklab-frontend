import { createDefaultSelectFieldState, type SelectFieldState, type SelectFieldUiConfig } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldState, type TextFieldUiConfig } from '@/features/form/fields/generic/text-field';
import { tokenPattern, withSummary, artifactFromPattern, createQueryContribution } from '@/features/form/model/compile/query-artifact';
import type { SummaryEntry } from '@/features/form/model/types';
import { createFieldController } from '@/features/form/model/types/form-controllers';

import { findOptions, optionValues } from '@/shared/utils/options';
import { escapeRegex } from '@/shared/utils/string-utils';

export type AnnotationControllerConfig = {
	annotationId: string;
	annotatedFieldId?: string;
};

export type AnnotationTextFieldConfig = AnnotationControllerConfig & TextFieldUiConfig;
export type AnnotationSelectFieldConfig = AnnotationControllerConfig & SelectFieldUiConfig;

export const annotationTextController = createFieldController<'annotation-text', TextFieldState, AnnotationTextFieldConfig>({
	kind: 'annotation-text',
	createDefaultState: createDefaultTextFieldState,
	getQueryContribution({ node, state }) {
		const clause = tokenPattern([
			{
				type: 'wildcard',
				annotationId: node.config.annotationId,
				value: state.value,
				caseSensitive: state.caseSensitive,
			},
		]);

		const summary: SummaryEntry | null = state.value
			? {
					id: node.config.annotationId,
					label: node.config.displayName,
					value: state.value,
					group: node.config.groupId,
				}
			: null;

		return withSummary(artifactFromPattern(clause), summary);
	},
});

export const annotationSelectController = createFieldController<'annotation-select', SelectFieldState, AnnotationSelectFieldConfig>({
	kind: 'annotation-select',
	createDefaultState: createDefaultSelectFieldState,
	getQueryContribution({ node, state }) {
		if (!state.length) return createQueryContribution();
		const escaped = state.map(v => escapeRegex(v)).join('|');
		return withSummary(
			artifactFromPattern(
				tokenPattern([
					{
						type: 'regex',
						annotationId: node.config.annotationId,
						value: escaped,
						caseSensitive: false,
					},
				]),
			),
			{
				id: node.config.annotationId,
				label: node.config.displayName,
				value: optionValues(findOptions(node.config.options, state)).join(', '),
			},
		);
	},
});
