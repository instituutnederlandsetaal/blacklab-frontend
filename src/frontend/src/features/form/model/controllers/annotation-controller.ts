import { createDefaultSelectFieldState, type SelectFieldState, type SelectFieldUiConfig } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldState, type TextFieldUiConfig } from '@/features/form/fields/generic/text-field';
import { tokenPattern, withSummary, artifactFromPattern } from '@/features/form/model/compile/query-artifact';
import type { SummaryEntry } from '@/features/form/model/types';
import { createFieldController } from '@/features/form/model/types/form-controllers';

import { findOptions, optionValues } from '@/shared/utils/options';
import { escapeRegex } from '@/shared/utils/string-utils';

import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';

export type AnnotationControllerConfig = {
	annotationId: string;
	annotatedFieldId?: string;
};

export const annotationTextController = createFieldController<'annotation-text', TextFieldState, AnnotationControllerConfig, TextFieldUiConfig>({
	kind: 'annotation-text',
	component: TextField,
	createDefaultState: createDefaultTextFieldState,
	buildQuery({ node, state }) {
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

export const annotationSelectController = createFieldController<'annotation-select', SelectFieldState, AnnotationControllerConfig, SelectFieldUiConfig>({
	kind: 'annotation-select',
	component: SelectField,
	createDefaultState: createDefaultSelectFieldState,
	buildQuery({ node, state }) {
		if (!state.length) return artifactFromPattern(null);
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
