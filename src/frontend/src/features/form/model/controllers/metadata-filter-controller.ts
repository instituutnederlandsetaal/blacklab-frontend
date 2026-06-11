import { toValue } from 'vue';

import { createDefaultCheckboxFieldState, type CheckboxFieldState, type CheckboxFieldUiConfig } from '@/features/form/fields/generic/checkbox-field';
import { createDefaultDateFieldState, DateUtils, type DateFieldState, type DateFieldUiConfig } from '@/features/form/fields/generic/date-field';
import { createDefaultRadioFieldState, type RadioFieldState, type RadioFieldUiConfig } from '@/features/form/fields/generic/radio-field';
import { createDefaultRangeFieldState, type RangeFieldState, type RangeFieldUiConfig } from '@/features/form/fields/generic/range-field';
import { createDefaultSelectFieldState, type SelectFieldState, type SelectFieldUiConfig } from '@/features/form/fields/generic/select-field';
import type { GenericFieldUiConfig } from '@/features/form/fields/generic/shared-ui-config';
import { createDefaultTextFieldState, type TextFieldState, type TextFieldUiConfig } from '@/features/form/fields/generic/text-field';
import { queryFragment, queryIR, rawFilter, termFilter, withSummary } from '@/features/form/model/compile/query-artifact';
import {
	decodePersistRecord,
	decodePersistRangeMode,
	decodePersistSelection,
	decodePersistSingleSelection,
	encodePersistObject,
	joinPersistValues,
	singleEncodedValue,
	splitPersistValue,
	unknownOptionWarnings,
} from '@/features/form/model/controllers/persistence-codec';
import type { SummaryEntry } from '@/features/form/model/types';
import { createFieldController, type EncodedFieldValue } from '@/features/form/model/types/form-controllers';

import { findOption, optionLabel } from '@/shared/utils/options';
import { escapeLucene, tokenizeString } from '@/shared/utils/string-utils';

export type MetadataFilterControllerConfig = {
	metadataFieldId: string;
};

export type MetadataFilterDateControllerConfig = MetadataFilterControllerConfig | { fromField: string; toField: string };

export type MetadataFilterRangeMultipleFieldsControllerConfig = {
	lowField: string;
	highField: string;
};

export type MetadataFilterTextConfig = MetadataFilterControllerConfig & TextFieldUiConfig;
export type MetadataFilterCheckboxConfig = MetadataFilterControllerConfig & CheckboxFieldUiConfig;
export type MetadataFilterRadioConfig = MetadataFilterControllerConfig & RadioFieldUiConfig;
export type MetadataFilterDateConfig = MetadataFilterDateControllerConfig & DateFieldUiConfig;
export type MetadataFilterRangeConfig = MetadataFilterControllerConfig & RangeFieldUiConfig;
export type MetadataFilterRangeMultipleFieldsConfig = MetadataFilterRangeMultipleFieldsControllerConfig & RangeFieldUiConfig;
export type MetadataFilterSelectConfig = MetadataFilterControllerConfig & SelectFieldUiConfig;

export type MetadataFilterConfig =
	| MetadataFilterTextConfig
	| MetadataFilterCheckboxConfig
	| MetadataFilterRadioConfig
	| MetadataFilterDateConfig
	| MetadataFilterRangeConfig
	| MetadataFilterRangeMultipleFieldsConfig
	| MetadataFilterSelectConfig;

function createSummaryEntry(annotationOrFieldOrNodeId: string, config: GenericFieldUiConfig, value: string | null): SummaryEntry | null {
	return value
		? {
				id: annotationOrFieldOrNodeId,
				label: toValue(config.displayName),
				value,
				group: config.groupId,
			}
		: null;
}

function createRawFilterQuery(annotationOrFieldOrNodeId: string, config: GenericFieldUiConfig, lucene: string | null, summary: string | null) {
	return withSummary(queryIR({ filter: rawFilter(lucene) }), createSummaryEntry(annotationOrFieldOrNodeId, config, summary));
}

function summarizeValues(values: string[]): string | null {
	return values.length >= 2 ? values.map(value => `"${value}"`).join(', ') : values[0] || null;
}

function buildTextLucene(metadataFieldId: string, state: TextFieldState | null): string | null {
	if (!state?.value.trim()) return null;
	return `${metadataFieldId}:(${tokenizeString(state.value, true)
		.map(term => escapeLucene(term.value, !term.isQuoted))
		.join(' ')})`;
}

function summarizeTextField(state: TextFieldState | null): string | null {
	const split = state?.value ? tokenizeString(state.value, true) : [];
	return split.map(term => (term.isQuoted || split.length > 1 ? `"${term.value}"` : term.value)).join(', ') || null;
}

function summarizeSelectField(config: SelectFieldUiConfig, values: string[]): string | null {
	const labels = values.map(value => optionLabel(findOption(config.options, value) ?? value));
	return summarizeValues(labels);
}

function metadataPersistKey(config: MetadataFilterControllerConfig) {
	return config.metadataFieldId;
}

function metadataDatePersistKey(config: MetadataFilterDateControllerConfig) {
	return 'metadataFieldId' in config ? config.metadataFieldId : `${config.fromField}-${config.toField}`;
}

function textEncode(state: TextFieldState | null) {
	const value = state?.value.trim() ?? '';
	if (!value && !state?.caseSensitive) return null;
	return state?.caseSensitive ? `${joinPersistValues([value], ';')};c=1` : value;
}

function textRestore(payload: EncodedFieldValue): TextFieldState {
	const parts = splitPersistValue(singleEncodedValue(payload, 'text field'), ';');
	return {
		value: parts[0] ?? '',
		caseSensitive: parts.includes('c=1'),
	};
}

function rangeEncode(state: RangeFieldState | null) {
	return encodePersistObject({
		low: state?.low,
		high: state?.high,
	});
}

function rangeRestore(payload: EncodedFieldValue): RangeFieldState {
	const restored = decodePersistRecord(payload, ['low', 'high'], 'range field');
	return {
		low: restored.low ?? '',
		high: restored.high ?? '',
		mode: 'strict',
	};
}

function dateValueToPersist(value: DateFieldState['startDate']) {
	return [value.y, value.m, value.d].filter(Boolean).join('-');
}

function persistToDateValue(value: string | undefined) {
	const [y = '', m = '', d = ''] = (value ?? '').split('-');
	return { y, m, d };
}

export const filterAutocompleteController = createFieldController<'metadata-filter-autocomplete', TextFieldState, MetadataFilterTextConfig>({
	kind: 'metadata-filter-autocomplete',
	createDefaultState: createDefaultTextFieldState,
	getPersistKey: metadataPersistKey,
	affectsBlackLabParameters: ['filter'],
	encode: textEncode,
	restore: textRestore,
	getQueryContribution(config, _runtime, state) {
		const lucene = buildTextLucene(config.metadataFieldId, state);
		return createRawFilterQuery(config.id, config, lucene, summarizeTextField(state));
	},
});

export const filterCheckboxController = createFieldController<'metadata-filter-checkbox', CheckboxFieldState, MetadataFilterCheckboxConfig>({
	kind: 'metadata-filter-checkbox',
	createDefaultState: createDefaultCheckboxFieldState,
	getPersistKey: metadataPersistKey,
	affectsBlackLabParameters: ['filter'],
	encode(state) {
		const selected = Object.entries(state ?? {})
			.filter(([, isSelected]) => isSelected)
			.map(([value]) => value);
		return selected.length ? joinPersistValues(selected) : null;
	},
	restore(payload, config) {
		const values = decodePersistSelection(payload);
		return {
			state: Object.fromEntries(values.map(value => [value, true])),
			warnings: unknownOptionWarnings(values, config.options),
		};
	},
	getQueryContribution(config, _runtime, state) {
		const selectedValues = Object.entries(state || {})
			.filter(([, isSelected]) => isSelected)
			.map(([value]) => value);
		const lucene = selectedValues.length ? `${config.metadataFieldId}:(${selectedValues.map(value => escapeLucene(value, false)).join(' ')})` : null;
		const summary = summarizeValues(selectedValues.map(value => optionLabel(findOption(config.options, value) ?? value)));
		return createRawFilterQuery(config.id, config, lucene, summary);
	},
});

export const filterDateController = createFieldController<'metadata-filter-date', DateFieldState, MetadataFilterDateConfig>({
	kind: 'metadata-filter-date',
	createDefaultState: createDefaultDateFieldState,
	getPersistKey: metadataDatePersistKey,
	affectsBlackLabParameters: ['filter'],
	encode(state, config) {
		return encodePersistObject({
			start: dateValueToPersist(state.startDate),
			end: config.range ? dateValueToPersist(state.endDate) : undefined,
			mode: !config.mode && state.mode !== 'strict' ? state.mode : undefined,
		});
	},
	restore(payload, config) {
		const restored = decodePersistRecord(payload, ['start', 'end', 'mode'], 'date field');
		const restoredMode = decodePersistRangeMode(restored.mode);
		return {
			startDate: persistToDateValue(restored.start),
			endDate: config.range ? persistToDateValue(restored.end) : { y: '', m: '', d: '' },
			mode: config.mode ?? restoredMode ?? 'strict',
		};
	},
	getQueryContribution(config, _runtime, state) {
		let start = DateUtils.dateValueToLucene(state.startDate, 'start');
		let end = DateUtils.dateValueToLucene(config.range ? state.endDate : state.startDate, 'end');

		let lucene: string | null = null;
		let summary: string | null = null;
		if (start || end) {
			start ??= DateUtils.dateValueToLucene({ d: '1', m: '1', y: '0' }, 'start');
			end ??= DateUtils.dateValueToLucene({ d: '31', m: '12', y: '9999' }, 'end');

			// If both sides are equal, collapse to a single value query
			const range = start === end ? start : `[${start} TO ${end}]`;
			if ('fromField' in config) {
				const op = (config.mode ?? state.mode) === 'permissive' ? 'OR' : 'AND';
				lucene = `(${config.fromField}:${range} ${op} ${config.toField}:${range})`;
			} else {
				lucene = `${config.metadataFieldId}:${range}`;
			}
			summary = [start && DateUtils.dateValueToDisplayString(state.startDate), end && DateUtils.dateValueToDisplayString(state.endDate)].filter(Boolean).join(' - ') || null;
		}

		return createRawFilterQuery(config.id, config, lucene, summary);
	},
});

export const filterRadioController = createFieldController<'metadata-filter-radio', RadioFieldState, MetadataFilterRadioConfig>({
	kind: 'metadata-filter-radio',
	createDefaultState: createDefaultRadioFieldState,
	getPersistKey: metadataPersistKey,
	affectsBlackLabParameters: ['filter'],
	encode: state => state || null,
	restore(payload, config) {
		const value = decodePersistSingleSelection(payload);
		return {
			state: value,
			warnings: unknownOptionWarnings(value ? [value] : [], config.options),
		};
	},
	getQueryContribution(config, _runtime, state) {
		const lucene = state ? `${config.metadataFieldId}:(${escapeLucene(state, false)})` : null;
		const summary = state ? optionLabel(findOption(config.options, state) ?? state) : null;
		return createRawFilterQuery(config.id, config, lucene, summary);
	},
});

export const filterRangeController = createFieldController<'metadata-filter-range', RangeFieldState, MetadataFilterRangeConfig>({
	kind: 'metadata-filter-range',
	createDefaultState: createDefaultRangeFieldState,
	getPersistKey: metadataPersistKey,
	affectsBlackLabParameters: ['filter'],
	encode: rangeEncode,
	restore: rangeRestore,
	getQueryContribution(config, _runtime, state) {
		const lucene = state.low || state.high ? `${config.metadataFieldId}:[${state.low || '0'} TO ${state.high || '9999'}]` : null;
		const summary = state.low || state.high ? `${state.low || '0'} - ${state.high || '9999'}` : null;
		return createRawFilterQuery(config.id, config, lucene, summary);
	},
});

export const filterRangeMultipleFieldsController = createFieldController<'metadata-filter-range-multiple-fields', RangeFieldState, MetadataFilterRangeMultipleFieldsConfig>({
	kind: 'metadata-filter-range-multiple-fields',
	createDefaultState: createDefaultRangeFieldState,
	getPersistKey: config => `${config.lowField}-${config.highField}`,
	affectsBlackLabParameters: ['filter'],
	encode(state, config) {
		return encodePersistObject({
			low: state.low,
			high: state.high,
			mode: !config.mode && state.mode !== 'strict' ? state.mode : undefined,
		});
	},
	restore(payload, config) {
		const restored = decodePersistRecord(payload, ['low', 'high', 'mode'], 'multi-field range');
		const restoredMode = decodePersistRangeMode(restored.mode);
		return {
			low: restored.low ?? '',
			high: restored.high ?? '',
			mode: config.mode ?? restoredMode ?? 'strict',
		};
	},
	getQueryContribution(config, _runtime, state) {
		const lucene =
			state.low || state.high
				? (() => {
						const lowPadded = state.low ? state.low.padStart(4, '0') : '0';
						const highPadded = state.high ? state.high.padStart(4, '0') : '9999';
						const op = (config.mode ?? state.mode) === 'permissive' ? 'OR' : 'AND';
						return `(${config.lowField}:[${lowPadded} TO ${highPadded}] ${op} ${config.highField}:[${lowPadded} TO ${highPadded}])`;
					})()
				: null;
		const summary = state.low || state.high ? `${state.low || '0'} - ${state.high || '9999'}` : null;
		return createRawFilterQuery(config.id, config, lucene, summary);
	},
});

export const filterSelectController = createFieldController<'metadata-filter-select', SelectFieldState, MetadataFilterSelectConfig>({
	kind: 'metadata-filter-select',
	createDefaultState: createDefaultSelectFieldState,
	getPersistKey: metadataPersistKey,
	affectsBlackLabParameters: ['filter'],
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
		const selectedValues = state.filter(value => value.trim());
		const summary = summarizeSelectField(config, selectedValues);

		return queryFragment(
			termFilter(config.metadataFieldId, selectedValues),
			summary
				? {
						id: config.id,
						label: toValue(config.displayName),
						value: summary,
						group: config.groupId,
					}
				: null,
		);
	},
});

export const filterTextController = createFieldController<'metadata-filter-text', TextFieldState, MetadataFilterTextConfig>({
	kind: 'metadata-filter-text',
	createDefaultState: createDefaultTextFieldState,
	getPersistKey: metadataPersistKey,
	affectsBlackLabParameters: ['filter'],
	encode: textEncode,
	restore: textRestore,
	getQueryContribution(config, _runtime, state) {
		const lucene = buildTextLucene(config.metadataFieldId, state);
		return createRawFilterQuery(config.id, config, lucene, summarizeTextField(state));
	},
});
