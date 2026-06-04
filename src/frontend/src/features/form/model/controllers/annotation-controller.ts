import { toValue } from 'vue';

import { createDefaultSelectFieldState, type SelectFieldState, type SelectFieldUiConfig } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldState, type TextFieldUiConfig } from '@/features/form/fields/generic/text-field';
import { createQueryContribution } from '@/features/form/model/compile/query-artifact';
import { firstEncodedValue, joinPersistValues, splitPersistValue } from '@/features/form/model/controllers/persistence-codec';
import type { QueryContribution, QueryPatternNode } from '@/features/form/model/types';
import { createFieldController } from '@/features/form/model/types/form-controllers';

import { findOptions, optionValues } from '@/shared/utils/options';
import { tokenizeString } from '@/shared/utils/string-utils';

export type AnnotationControllerConfig = {
	annotationId: string;
	annotatedFieldId?: string;
};

export type AnnotationTextFieldConfig = AnnotationControllerConfig & TextFieldUiConfig;
export type AnnotationSelectFieldConfig = AnnotationControllerConfig & SelectFieldUiConfig;

/**
 * Controller that tokenizes the input string.
 * Quotes suppress tokenization within them.
 * Resultant tokens are eventually interpreted as wildcard values,
 * though wildcard substitution and special character escaping doesn't happen until query compilation.
 *
 * Examples:
 * "this is" a?|example sentence* => ["this is", "a?|example", "sentence*"]
 *
 */
export const annotationTextController = createFieldController<'annotation-text', TextFieldState, AnnotationTextFieldConfig>({
	kind: 'annotation-text',
	createDefaultState: createDefaultTextFieldState,
	getPersistKey: config => config.annotationId,
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		const value = state.value.trim();
		if (!value && !state.caseSensitive) return null;
		return state.caseSensitive ? `${joinPersistValues([value], ';')};c=1` : value;
	},
	restore(payload) {
		const parts = splitPersistValue(firstEncodedValue(payload), ';');
		return {
			value: parts[0] ?? '',
			caseSensitive: parts.includes('c=1'),
		};
	},
	getQueryContribution(config, _runtime, state) {
		if (!state.value.trim()) return createQueryContribution();

		const r: QueryContribution = {
			query: {
				pattern: {
					type: 'sequence',
					children: tokenizeString(state.value, true).map<QueryPatternNode>(token => ({
						type: 'token',
						clauses: [
							{
								type: 'wildcard',
								annotationId: config.annotationId,
								value: token.value,
								caseSensitive: state.caseSensitive,
							},
						],
					})),
				},
				filter: null,
				searchField: null,
				wrappers: [],
			},
			summaries: state.value
				? [
						{
							id: config.annotationId,
							label: toValue(config.displayName),
							value: state.value,
							group: config.groupId,
						},
					]
				: [],
		};
		return r;
	},
});

export const annotationSelectController = createFieldController<'annotation-select', SelectFieldState, AnnotationSelectFieldConfig>({
	kind: 'annotation-select',
	createDefaultState: createDefaultSelectFieldState,
	getPersistKey: config => config.annotationId,
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		return state.length ? joinPersistValues(state) : null;
	},
	restore(payload) {
		return splitPersistValue(firstEncodedValue(payload)).filter(Boolean);
	},
	getQueryContribution(config, _runtime, state) {
		if (!state.length) return createQueryContribution();

		const r: QueryContribution = {
			query: {
				pattern: {
					type: 'token',
					clauses: state.map(value => ({
						type: 'equals',
						annotationId: config.annotationId,
						value,
					})),
				},
				filter: null,
				searchField: null,
				wrappers: [],
			},
			summaries: [
				{
					id: config.annotationId,
					label: toValue(config.displayName),
					value: optionValues(findOptions(config.options, state)).join(', '),
				},
			],
		};
		return r;
	},
});
