import { toValue } from 'vue';

import { createDefaultCheckboxFieldState, type CheckboxFieldDefinition } from '@/features/form/fields/generic/checkbox-field';
import { createDefaultDateFieldState, DateUtils, type DateFieldDefinition, type DateFieldState } from '@/features/form/fields/generic/date-field';
import { createDefaultRadioFieldState, type RadioFieldDefinition } from '@/features/form/fields/generic/radio-field';
import { createDefaultRangeFieldState, type RangeFieldDefinition } from '@/features/form/fields/generic/range-field';
import { createDefaultSelectFieldState, type SelectFieldConfig, type SelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldDefinition, type TextFieldState } from '@/features/form/fields/generic/text-field';
import { predicateValue, queryFragment, rangeFilter, termFilter, valueFilter } from '@/features/form/model/compile/query-artifact';
import { array, bool, object, scalar, stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import type { NamedFieldDefinitionProps } from '@/features/form/model/field-component-props';
import { booleanExpr, type QueryFilterNode, type SummaryEntry } from '@/features/form/model/types';
import { defineFieldController, type FieldControllerConfig, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';

import { findOption, optionLabel } from '@/shared/utils/options';
import { tokenizeString } from '@/shared/utils/string-utils';

export type MetadataFilterControllerConfig = {
	metadataFieldId: string;
};

type BiMetadataFilterControllerConfig = {
	fromField: string;
	toField: string;
};

const isBiFieldConfig = (config: MetadataFilterControllerConfig | BiMetadataFilterControllerConfig): config is BiMetadataFilterControllerConfig => 'fromField' in config && 'toField' in config;

export type MetadataFilterTextConfig = FieldControllerConfig<TextFieldDefinition, MetadataFilterControllerConfig>;
export type MetadataFilterCheckboxConfig = FieldControllerConfig<CheckboxFieldDefinition, MetadataFilterControllerConfig>;
export type MetadataFilterRadioConfig = FieldControllerConfig<RadioFieldDefinition, MetadataFilterControllerConfig>;
export type MetadataFilterDateConfig = FieldControllerConfig<DateFieldDefinition, MetadataFilterControllerConfig | BiMetadataFilterControllerConfig>;
export type MetadataFilterRangeConfig = FieldControllerConfig<RangeFieldDefinition, MetadataFilterControllerConfig | BiMetadataFilterControllerConfig>;
export type MetadataFilterSelectConfig = FieldControllerConfig<SelectFieldDefinition, MetadataFilterControllerConfig>;

export type MetadataFilterConfig =
	| MetadataFilterTextConfig
	| MetadataFilterCheckboxConfig
	| MetadataFilterRadioConfig
	| MetadataFilterDateConfig
	| MetadataFilterRangeConfig
	| MetadataFilterSelectConfig;

function createSummaryEntry(config: NamedFieldDefinitionProps, value: string | null): SummaryEntry | null {
	return value
		? {
				label: toValue(config.displayName),
				value,
				group: config.groupId,
			}
		: null;
}

function createFilterQuery(config: NamedFieldDefinitionProps, filter: QueryFilterNode | null, summary: string | null) {
	return queryFragment(filter, createSummaryEntry(config, summary));
}

function summarizeValues(values: string[]): string | null {
	return values.length >= 2 ? values.map(value => `"${value}"`).join(', ') : values[0] || null;
}

function summarizeSelectField(config: SelectFieldConfig, values: string[]): string | null {
	return summarizeValues(values.map(value => optionLabel(findOption(config.options, value) ?? value)));
}

function buildTextFilter(metadataFieldId: string, state: TextFieldState | null): QueryFilterNode | null {
	if (!state?.value.trim()) return null;
	return valueFilter(
		metadataFieldId,
		tokenizeString(state.value, true).map(term => predicateValue(term.isQuoted ? 'literal' : 'wildcard', term.value)),
	);
}

function summarizeTextField(state: TextFieldState | null): string | null {
	const split = state?.value ? tokenizeString(state.value, true) : [];
	return split.map(term => (term.isQuoted || split.length > 1 ? `"${term.value}"` : term.value)).join(', ') || null;
}

function metadataPersistKey(config: MetadataFilterControllerConfig | BiMetadataFilterControllerConfig) {
	return isBiFieldConfig(config) ? `${config.fromField}-${config.toField}` : config.metadataFieldId;
}

function dateValueToPersist(value: DateFieldState['startDate']) {
	return [value.y, value.m, value.d].filter(Boolean).join('-');
}

function persistToDateValue(value: string | undefined) {
	const [y = '', m = '', d = ''] = (value ?? '').split('-');
	return { y, m, d };
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

const radioPersistenceCodec = stringPersistenceCodec<FieldPersistenceContext<MetadataFilterRadioConfig>>().refine((value, { config }) =>
	!value || findOption(config.options, value) ? undefined : `Cannot restore values no longer present in the current options: ${value}.`,
);

const modeCodec = scalar().mapped({ strict: 's', permissive: 'p' });

const rangePersistenceCodec = object({
	low: scalar().default('').at('l'),
	high: scalar().default('').at('h'),
	mode: modeCodec.default(({ config }) => config.mode ?? 'strict').at('m'),
}).default(({ config }) => ({ low: '', high: '', mode: config.mode ?? 'strict' }));

const datePartCodec = scalar()
	.refine(value => (value.split('-').length <= 3 ? undefined : `Cannot restore date value '${value}' with more than three components.`))
	.transform<DateFieldState['startDate']>({ encode: dateValueToPersist, decode: value => persistToDateValue(value) })
	.default({ y: '', m: '', d: '' });

const datePersistenceCodec = object({
	startDate: datePartCodec.at('s'),
	endDate: datePartCodec.at('e'),
	mode: modeCodec.default(({ config }) => config.mode ?? 'strict').at('m'),
})
	.transform<DateFieldState>({
		encode: (state, { config }) => ({
			startDate: state.startDate,
			endDate: config.range ? state.endDate : { y: '', m: '', d: '' },
			mode: config.mode ?? state.mode,
		}),
		decode: (state, { config }) => ({
			startDate: state.startDate,
			endDate: config.range ? state.endDate : { y: '', m: '', d: '' },
			mode: config.mode ?? state.mode,
		}),
	})
	.default(({ config }) => ({ ...createDefaultDateFieldState(), mode: config.mode ?? 'strict' }));

export const filterTextController = defineFieldController<'metadata-filter-text', TextFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-text',
	createDefaultState: createDefaultTextFieldState,
	persistence: { key: metadataPersistKey, codec: textPersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		return createFilterQuery(config, buildTextFilter(config.metadataFieldId, state), summarizeTextField(state));
	},
});

export const filterCheckboxController = defineFieldController<'metadata-filter-checkbox', CheckboxFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-checkbox',
	createDefaultState: createDefaultCheckboxFieldState,
	persistence: { key: metadataPersistKey, codec: selectionPersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		const summary = summarizeValues(state.map(value => optionLabel(findOption(config.options, value) ?? value)));
		return createFilterQuery(config, termFilter(config.metadataFieldId, state), summary);
	},
});

export const filterDateController = defineFieldController<'metadata-filter-date', DateFieldDefinition, MetadataFilterControllerConfig | BiMetadataFilterControllerConfig>({
	kind: 'metadata-filter-date',
	createDefaultState: createDefaultDateFieldState,
	persistence: { key: metadataPersistKey, codec: datePersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		const enteredStart = DateUtils.dateValueToString(state.startDate, 'start');
		const enteredEnd = DateUtils.dateValueToString(config.range ? state.endDate : state.startDate, 'end');
		if (!enteredStart && !enteredEnd) return createFilterQuery(config, null, null);

		const start = enteredStart || DateUtils.dateValueToString({ d: '1', m: '1', y: '0' }, 'start');
		const end = enteredEnd || DateUtils.dateValueToString({ d: '31', m: '12', y: '9999' }, 'end');
		const createDateFilter = (field: string) => (start === end ? termFilter(field, [start])! : rangeFilter(field, start, end)!);
		const filter = isBiFieldConfig(config)
			? booleanExpr((config.mode ?? state.mode) === 'permissive' ? 'or' : 'and', createDateFilter(config.fromField), createDateFilter(config.toField))
			: createDateFilter(config.metadataFieldId);
		const summary =
			[enteredStart && DateUtils.dateValueToDisplayString(state.startDate), config.range && enteredEnd && DateUtils.dateValueToDisplayString(state.endDate)].filter(Boolean).join(' - ') || null;
		return createFilterQuery(config, filter, summary);
	},
});

export const filterRadioController = defineFieldController<'metadata-filter-radio', RadioFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-radio',
	createDefaultState: createDefaultRadioFieldState,
	persistence: { key: metadataPersistKey, codec: radioPersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		const summary = state ? optionLabel(findOption(config.options, state) ?? state) : null;
		return createFilterQuery(config, termFilter(config.metadataFieldId, state ? [state] : []), summary);
	},
});

export const filterRangeController = defineFieldController<'metadata-filter-range', RangeFieldDefinition, MetadataFilterControllerConfig | BiMetadataFilterControllerConfig>({
	kind: 'metadata-filter-range',
	createDefaultState: createDefaultRangeFieldState,
	persistence: { key: metadataPersistKey, codec: rangePersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		if (!state.low && !state.high) return createFilterQuery(config, null, null);

		const lowPadded = state.low ? state.low.padStart(4, '0') : '0';
		const highPadded = state.high ? state.high.padStart(4, '0') : '9999';
		const summary = `${state.low || '0'} - ${state.high || '9999'}`;

		if (isBiFieldConfig(config)) {
			const filter = booleanExpr(
				(config.mode ?? state.mode) === 'permissive' ? 'or' : 'and',
				rangeFilter(config.fromField, lowPadded, highPadded)!,
				rangeFilter(config.toField, lowPadded, highPadded)!,
			);
			return createFilterQuery(config, filter, summary);
		}

		return createFilterQuery(config, rangeFilter(config.metadataFieldId, state.low || '0', state.high || '9999'), summary);
	},
});

export const filterSelectController = defineFieldController<'metadata-filter-select', SelectFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-select',
	createDefaultState: createDefaultSelectFieldState,
	persistence: { key: metadataPersistKey, codec: selectionPersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		const selectedValues = state.filter(value => value.trim());
		const summary = summarizeSelectField(config, selectedValues);

		return queryFragment(termFilter(config.metadataFieldId, selectedValues), createSummaryEntry(config, summary));
	},
});
