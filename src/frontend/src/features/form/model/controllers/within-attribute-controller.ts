import { toValue } from 'vue';

import { createDefaultRangeFieldState, type RangeFieldDefinition, type RangeFieldState } from '@/features/form/fields/generic/range-field';
import { createDefaultSelectFieldState, type SelectFieldConfig, type SelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldDefinition, type TextFieldState } from '@/features/form/fields/generic/text-field';
import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { array, bool, object, scalar } from '@/features/form/model/controllers/persistence-codec';
import type { NamedFieldDefinitionProps } from '@/features/form/model/field-component-props';
import { defineFieldController, type FieldControllerConfig } from '@/features/form/model/types/form-controllers';
import type { QueryWithinAttribute, SummaryEntry } from '@/features/form/model/types/form-query';

import { findOption, optionLabel } from '@/shared/utils/options';

/** Configuration shared by controls that constrain an attribute of a CQL within clause. */
export type WithinAttributeControllerConfig = {
	elementName: string;
	attributeName: string;
};

export type WithinAttributeTextConfig = FieldControllerConfig<TextFieldDefinition, WithinAttributeControllerConfig>;
export type WithinAttributeSelectConfig = FieldControllerConfig<SelectFieldDefinition, WithinAttributeControllerConfig>;
export type WithinAttributeRangeConfig = FieldControllerConfig<RangeFieldDefinition, WithinAttributeControllerConfig>;

function createSummaryEntry(config: NamedFieldDefinitionProps, value: string | null): SummaryEntry | null {
	return value
		? {
				label: toValue(config.displayName),
				value,
				group: config.groupId,
				// Span constraints are part of patt, but are shown alongside document filters.
				summaryType: ['filter'],
			}
		: null;
}

function createWithinAttributeQuery(config: WithinAttributeControllerConfig & NamedFieldDefinitionProps, value: QueryWithinAttribute | null, summary: string | null) {
	return queryFragment(
		value === null
			? null
			: {
					wrappers: [{ type: 'within', element: config.elementName, attributes: { [config.attributeName]: value } }],
					resultPreset: { withSpans: true },
				},
		createSummaryEntry(config, summary),
	);
}

function summarizeValues(values: string[]): string | null {
	return values.length >= 2 ? values.map(value => `"${value}"`).join(', ') : values[0] || null;
}

function summarizeSelectField(config: SelectFieldConfig, values: string[]): string | null {
	return summarizeValues(values.map(value => optionLabel(findOption(config.options, value) ?? value)));
}

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
		const value = state.value.trim();
		// Attribute text controls use wildcard semantics, like their select counterparts.
		return createWithinAttributeQuery(config, value ? [value] : null, value || null);
	},
});

export const withinAttributeSelectController = defineFieldController<'within-attribute-select', SelectFieldDefinition, WithinAttributeControllerConfig>({
	kind: 'within-attribute-select',
	createDefaultState: createDefaultSelectFieldState,
	persistence: { key: withinAttributePersistKey, codec: selectionPersistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state) {
		const values = state.filter(value => value.trim());
		return createWithinAttributeQuery(config, values.length ? values : null, summarizeSelectField(config, values));
	},
});

export const withinAttributeRangeController = defineFieldController<'within-attribute-range', RangeFieldDefinition, WithinAttributeControllerConfig>({
	kind: 'within-attribute-range',
	createDefaultState: createDefaultRangeFieldState,
	persistence: { key: withinAttributePersistKey, codec: rangePersistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state: RangeFieldState) {
		const active = state.low || state.high;
		return createWithinAttributeQuery(
			config,
			active ? { low: state.low || undefined, high: state.high || undefined } : null,
			active ? `${state.low || '0'}-${state.high || '9999'}` : null,
		);
	},
});
