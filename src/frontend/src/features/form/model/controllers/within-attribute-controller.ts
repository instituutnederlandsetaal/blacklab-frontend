import { toValue } from 'vue';

import { createDefaultRangeFieldState, type RangeFieldDefinition, type RangeFieldState } from '@/features/form/fields/generic/range-field';
import { createDefaultSelectFieldState, type SelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldDefinition, type TextFieldState } from '@/features/form/fields/generic/text-field';
import { array, bool, object, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig } from '@/features/form/model/types/form-controllers';
import { queryFragment, summary, within, withinAttribute, withinAttributeRange } from '@/features/form/model/types/form-query-ir';

import { findOption } from '@/shared/utils/options';
import { tokenizedStringValues } from '@/shared/utils/string-utils';

/** Configuration shared by controls that constrain an attribute of a CQL within clause. */
export type WithinAttributeControllerConfig = {
	elementName: string;
	attributeName: string;
};

export type WithinAttributeTextConfig = FieldControllerConfig<TextFieldDefinition, WithinAttributeControllerConfig>;
export type WithinAttributeSelectConfig = FieldControllerConfig<SelectFieldDefinition, WithinAttributeControllerConfig>;
export type WithinAttributeRangeConfig = FieldControllerConfig<RangeFieldDefinition, WithinAttributeControllerConfig>;

const textPersistenceCodec = object({
	value: scalar().default('').atRoot(),
	caseSensitive: bool().default(false).at('c'),
})
	.default({ value: '', caseSensitive: false })
	.omitWhen(state => !state.value.trim() && !state.caseSensitive);

const selectionPersistenceCodec = array(scalar())
	.default([])
	.refine((values, { config }) => {
		const unknown = values.filter(value => !findOption(config.options, value));
		return unknown.length ? `Cannot restore values no longer present in the current options: ${unknown.join(', ')}.` : undefined;
	});

const modeCodec = scalar().mapped({ strict: 's', permissive: 'p' });

const rangePersistenceCodec = object({
	low: scalar().default('').at('l'),
	high: scalar().default('').at('h'),
	mode: modeCodec.default(({ config }) => config.mode ?? 'strict').at('m'),
}).default(({ config }) => ({ low: '', high: '', mode: config.mode ?? 'strict' }));

function withinAttributePersistKey(config: WithinAttributeControllerConfig) {
	return `within:${config.elementName}:${config.attributeName}`;
}

export const withinAttributeTextController = defineFieldController<'within-attribute-text', TextFieldDefinition, WithinAttributeControllerConfig>({
	kind: 'within-attribute-text',
	createDefaultState: createDefaultTextFieldState,
	persistence: { key: withinAttributePersistKey, codec: textPersistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state: TextFieldState) {
		const value = tokenizedStringValues(state.value, true);
		if (!value.length) return null;
		return queryFragment({
			wrappers: within(config.elementName, withinAttribute(config.attributeName, 'wildcard', value)),
			resultPreset: { withSpans: true },
			summaries: summary(toValue(config.displayName), value, ['filter'], config.groupId),
		});
	},
});

export const withinAttributeSelectController = defineFieldController<'within-attribute-select', SelectFieldDefinition, WithinAttributeControllerConfig>({
	kind: 'within-attribute-select',
	createDefaultState: createDefaultSelectFieldState,
	persistence: { key: withinAttributePersistKey, codec: selectionPersistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state) {
		const value = state.filter(value => value.trim());
		if (!value.length) return null;
		return queryFragment({
			wrappers: within(config.elementName, withinAttribute(config.attributeName, 'literal', value)),
			resultPreset: { withSpans: true },
			summaries: summary(toValue(config.displayName), value, ['filter'], config.groupId, config.options),
		});
	},
});

export const withinAttributeRangeController = defineFieldController<'within-attribute-range', RangeFieldDefinition, WithinAttributeControllerConfig>({
	kind: 'within-attribute-range',
	createDefaultState: createDefaultRangeFieldState,
	persistence: { key: withinAttributePersistKey, codec: rangePersistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state: RangeFieldState) {
		if (!state.low && !state.high) return null;
		return queryFragment({
			wrappers: within(config.elementName, withinAttributeRange(config.attributeName, state)),
			resultPreset: { withSpans: true },
			summaries: summary(toValue(config.displayName), state, ['filter'], config.groupId),
		});
	},
});
