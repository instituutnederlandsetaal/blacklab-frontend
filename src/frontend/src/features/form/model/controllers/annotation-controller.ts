import { toValue } from 'vue';

import { createDefaultSelectFieldState, type SelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldDefinition } from '@/features/form/fields/generic/text-field';
import { array, bool, object, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig } from '@/features/form/model/types/form-controllers';
import { annotation, sequence, summary } from '@/features/form/model/types/form-query-ir';

import { findOption } from '@/shared/utils/options';
import { tokenizeString } from '@/shared/utils/string-utils';

export type AnnotationControllerConfig = {
	annotationId: string;
	annotatedFieldId?: string;
};

export type AnnotationTextFieldConfig = FieldControllerConfig<TextFieldDefinition, AnnotationControllerConfig>;

const annotationTextCodec = object({
	value: scalar().default('').atRoot(),
	caseSensitive: bool().default(false).at('c'),
})
	.default({ value: '', caseSensitive: false })
	.omitWhen(state => !state.value.trim() && !state.caseSensitive);

const annotationSelectionCodec = array(scalar())
	.default([])
	.refine((values, { config }) => {
		const unknown = values.filter(value => !findOption(config.options, value));
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
	outputs: ['patt'],
	collect(config, _runtime, state, emit) {
		if (!state.value.trim()) return;
		const pattern = sequence(tokenizeString(state.value, true).map(term => annotation(config.annotationId, 'wildcard', term.value, state.caseSensitive ? { caseSensitive: true } : undefined)));
		if (pattern) emit('patt', pattern);
	},
	summarize(config, _runtime, state, emit) {
		if (state.value.trim()) emit({ label: toValue(config.displayName), value: state.value, group: config.groupId });
	},
});

export const annotationSelectController = defineFieldController<'annotation-select', SelectFieldDefinition, AnnotationControllerConfig>({
	kind: 'annotation-select',
	createDefaultState: createDefaultSelectFieldState,
	persistence: { key: config => config.annotationId, codec: annotationSelectionCodec },
	outputs: ['patt'],
	collect(config, _runtime, state, emit) {
		const pattern = annotation(config.annotationId, 'literal', state);
		if (pattern) emit('patt', pattern);
	},
	summarize(config, _runtime, state, emit) {
		const entry = summary(toValue(config.displayName), state, undefined, config.groupId, config.options);
		if (entry) emit(entry);
	},
});
