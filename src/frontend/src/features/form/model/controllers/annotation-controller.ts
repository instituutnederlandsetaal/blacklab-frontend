import { toValue } from 'vue';

import { createDefaultSelectFieldState, type SelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldDefinition } from '@/features/form/fields/generic/text-field';
import { queryFragment, queryIR, token, tokenPredicate, tokenSequence } from '@/features/form/model/compile/query-artifact';
import { decodePersistSelection, joinPersistValues, singleEncodedValue, splitPersistValue, unknownOptionWarnings } from '@/features/form/model/controllers/persistence-codec';
import { booleanExpr, type QueryFragment } from '@/features/form/model/types';
import { defineFieldController, type FieldControllerConfig } from '@/features/form/model/types/form-controllers';

import { findOptions, optionValues } from '@/shared/utils/options';
import { tokenizeString } from '@/shared/utils/string-utils';

export type AnnotationControllerConfig = {
	annotationId: string;
	annotatedFieldId?: string;
};

export type AnnotationTextFieldConfig = FieldControllerConfig<TextFieldDefinition, AnnotationControllerConfig>;
export type AnnotationSelectFieldConfig = FieldControllerConfig<SelectFieldDefinition, AnnotationControllerConfig>;

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
export const annotationTextController = defineFieldController<'annotation-text', TextFieldDefinition, AnnotationControllerConfig>({
	kind: 'annotation-text',
	createDefaultState: createDefaultTextFieldState,
	getPersistKey: config => config.annotationId,
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		const value = state.value.trim();
		if (!value) return null;
		return state.caseSensitive ? `${joinPersistValues([value], ';')};c=1` : value;
	},
	restore(payload) {
		const parts = splitPersistValue(singleEncodedValue(payload, 'annotation text'), ';');
		return {
			value: parts[0] ?? '',
			caseSensitive: parts.includes('c=1'),
		};
	},
	getQueryContribution(config, _runtime, state) {
		if (!state.value.trim()) return queryFragment();

		const r: QueryFragment = {
			query: queryIR({
				pattern: tokenSequence(tokenizeString(state.value, true).map(term => token(tokenPredicate('wildcard', config.annotationId, term.value, state.caseSensitive)))),
			}),
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

export const annotationSelectController = defineFieldController<'annotation-select', SelectFieldDefinition, AnnotationControllerConfig>({
	kind: 'annotation-select',
	createDefaultState: createDefaultSelectFieldState,
	getPersistKey: config => config.annotationId,
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		return state.length ? joinPersistValues(state) : null;
	},
	restore(payload, config) {
		const values = decodePersistSelection(payload);
		return {
			state: values,
			warnings: unknownOptionWarnings(values, config.options),
		};
	},
	getQueryContribution(config, _runtime, state) {
		if (!state.length) return queryFragment();
		return queryFragment(token(booleanExpr('or', ...state.map(v => tokenPredicate('equals', config.annotationId, v)))), {
			id: config.annotationId,
			label: toValue(config.displayName),
			value: optionValues(findOptions(config.options, state)).join(', '),
		});
	},
});
