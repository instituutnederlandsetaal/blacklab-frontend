import { toValue } from 'vue';

import { createDefaultSelectFieldState, type SelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldDefinition } from '@/features/form/fields/generic/text-field';
import { queryFragment, queryIR, token, tokenPredicate, tokenSequence } from '@/features/form/model/compile/query-artifact';
import { array, bool, object, scalar } from '@/features/form/model/controllers/persistence-codec';
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

const annotationTextCodec = object({
	value: scalar().default('').atRoot(),
	caseSensitive: bool().default(false).at('c'),
})
	.default({ value: '', caseSensitive: false })
	.omitWhen(state => !state.value.trim() && !state.caseSensitive);

const annotationSelectionCodec = array(scalar()).default([]).refine((values, { config }) => {
	const unknown = values.filter(value => !findOptions(config.options, [value]).length);
	return unknown.length ? `Cannot restore values no longer present in the current options: ${unknown.join(', ')}.` : undefined;
});

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
	persistence: { key: config => config.annotationId, codec: annotationTextCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state) {
		if (!state.value.trim()) return queryFragment();

		const r: QueryFragment = {
			query: queryIR({
				pattern: tokenSequence(tokenizeString(state.value, true).map(term => token(tokenPredicate('wildcard', config.annotationId, term.value, state.caseSensitive)))),
			}),
			summaries: state.value
				? [
						{
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
	persistence: { key: config => config.annotationId, codec: annotationSelectionCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state) {
		if (!state.length) return queryFragment();
		return queryFragment(token(booleanExpr('or', ...state.map(v => tokenPredicate('equals', config.annotationId, v)))), {
			label: toValue(config.displayName),
			value: optionValues(findOptions(config.options, state)).join(', '),
		});
	},
});
