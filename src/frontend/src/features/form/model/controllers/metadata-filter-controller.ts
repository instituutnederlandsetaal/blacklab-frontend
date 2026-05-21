import { artifactFromFilter, rawFilter, termFilter, withSummary } from '@/features/form/model/compile/query-artifact';
import { createFieldController, type FieldController, type FieldControllerComponent } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry } from '@/features/form/model/types/form-query';
import type { FieldControllerConfig } from '@/features/form/model/types/form-shape';

import type { CheckboxFieldUiConfig } from '@/features/form/fields/generic/checkbox-field';
import { DateUtils, type DateFieldState, type DateFieldUiConfig } from '@/features/form/fields/generic/date-field';
import type { RangeFieldState, RangeFieldUiConfig } from '@/features/form/fields/generic/range-field';
import type { RangeMultipleFieldsFieldState, RangeMultipleFieldsFieldUiConfig } from '@/features/form/fields/generic/range-multiple-fields-field';
import type { RadioFieldUiConfig } from '@/features/form/fields/generic/radio-field';
import type { SelectFieldState, SelectFieldUiConfig } from '@/features/form/fields/generic/select-field';
import type { TextFieldState, TextFieldUiConfig } from '@/features/form/fields/generic/text-field';

import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import DateField from '@/features/form/fields/generic/DateField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import RangeField from '@/features/form/fields/generic/RangeField.vue';
import RangeMultipleFieldsField from '@/features/form/fields/generic/RangeMultipleFieldsField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';

import { findOption, optionLabel } from '@/shared/utils/options';
import { escapeLucene, splitIntoTerms } from '@/shared/utils/string-utils';

export type MetadataFilterControllerConfig = FieldControllerConfig & {
	id: string;
	groupId?: string;
};

export type MetadataFilterUiConfig = {
	displayName: string;
	description?: string;
	textDirection?: 'ltr' | 'rtl';
};

export type MetadataFilterFieldConfig = MetadataFilterControllerConfig & MetadataFilterUiConfig;

export type MetadataFilterTextFieldConfig = MetadataFilterFieldConfig & Pick<TextFieldUiConfig, 'placeholder'>;

export type MetadataFilterAutocompleteFieldConfig = MetadataFilterFieldConfig & Pick<TextFieldUiConfig, 'autocomplete' | 'placeholder'>;

export type MetadataFilterCheckboxFieldConfig = MetadataFilterFieldConfig & Pick<CheckboxFieldUiConfig, 'options'>;

export type MetadataFilterRadioFieldConfig = MetadataFilterFieldConfig & Pick<RadioFieldUiConfig, 'options'>;

export type MetadataFilterDateFieldConfig = MetadataFilterFieldConfig & Omit<DateFieldUiConfig, 'displayName' | 'description'> & ({ field: string } | { fromField: string; toField: string });

export type MetadataFilterRangeFieldConfig = MetadataFilterFieldConfig & Omit<RangeFieldUiConfig, 'displayName' | 'description'>;

export type MetadataFilterRangeMultipleFieldsFieldConfig = MetadataFilterFieldConfig &
	Omit<RangeMultipleFieldsFieldUiConfig, 'displayName' | 'description'> & {
		lowField: string;
		highField: string;
	};

export type MetadataFilterConfig =
	| MetadataFilterTextFieldConfig
	| MetadataFilterAutocompleteFieldConfig
	| MetadataFilterCheckboxFieldConfig
	| MetadataFilterRadioFieldConfig
	| MetadataFilterDateFieldConfig
	| MetadataFilterRangeFieldConfig
	| MetadataFilterRangeMultipleFieldsFieldConfig
	| MetadataFilterSelectFieldConfig;

export type MetadataFilterSelectFieldConfig = MetadataFilterControllerConfig & Omit<SelectFieldUiConfig, 'caseSensitive' | 'caseSensitiveLabel'> & {
	multiple: true;
};

export type MetadataFilterSelectFieldState = SelectFieldState;

export type MetadataFilterController = FieldController<string, any, any, any>;

type CheckboxFilterState = Record<string, boolean>;
type RadioFilterState = string;
type DateFilterMetadata =
	| {
			field: string;
			range: boolean;
			min?: string | Date | DateFieldState['startDate'];
			max?: string | Date | DateFieldState['startDate'];
	  }
	| {
			from_field: string;
			to_field: string;
			range: boolean;
			min?: string | Date | DateFieldState['startDate'];
			max?: string | Date | DateFieldState['startDate'];
			mode?: DateFieldState['mode'];
	  };

function createSummaryEntry(nodeId: string, config: MetadataFilterFieldConfig, value: string | null): SummaryEntry | null {
	return value
		? {
			id: nodeId,
			label: config.displayName,
			value,
			group: config.groupId,
		}
		: null;
}

function createRawFilterQuery(nodeId: string, config: MetadataFilterFieldConfig, lucene: string | null, summary: string | null) {
	return withSummary(artifactFromFilter(rawFilter(lucene)), createSummaryEntry(nodeId, config, summary));
}

function summarizeValues(values: string[]): string | null {
	return values.length >= 2 ? values.map(value => `"${value}"`).join(', ') : values[0] || null;
}

function buildTextLucene(id: string, state: TextFieldState | null): string | null {
	if (!state?.value.trim()) return null;
	return `${id}:(${splitIntoTerms(state.value, true)
		.map(term => escapeLucene(term.value, !term.isQuoted))
		.join(' ')})`;
}

function summarizeText(state: TextFieldState | null): string | null {
	const split = state?.value ? splitIntoTerms(state.value, true) : [];
	return split.map(term => (term.isQuoted || split.length > 1 ? `"${term.value}"` : term.value)).join(', ') || null;
}

function summarizeSelectField(config: MetadataFilterSelectFieldConfig, values: string[]): string | null {
	const labels = values.map(value => optionLabel(findOption(config.options, value) ?? value));
	return summarizeValues(labels);
}

export const filterAutocompleteController = createFieldController<
	'metadata-filter-autocomplete',
	TextFieldState,
	TextFieldUiConfig,
	MetadataFilterAutocompleteFieldConfig
>({
	kind: 'metadata-filter-autocomplete',
	component: TextField as FieldControllerComponent<TextFieldState, TextFieldUiConfig>,
	createDefaultState: () => ({
		value: '',
		caseSensitive: false,
	}),
	buildQuery({ node, state }) {
		const lucene = buildTextLucene(node.config.id, state);
		return createRawFilterQuery(node.id, node.config, lucene, summarizeText(state));
	},
});

export const filterCheckboxController = createFieldController<
	'metadata-filter-checkbox',
	CheckboxFilterState,
	CheckboxFieldUiConfig,
	MetadataFilterCheckboxFieldConfig
>({
	kind: 'metadata-filter-checkbox',
	component: CheckboxField,
	createDefaultState: () => ({}),
	buildQuery({ node, state }) {
		const selectedValues = Object.entries(state || {})
			.filter(([, isSelected]) => isSelected)
			.map(([value]) => value);
		const lucene = selectedValues.length ? `${node.config.id}:(${selectedValues.map(value => escapeLucene(value, false)).join(' ')})` : null;
		const summary = summarizeValues(selectedValues.map(value => node.config.options.find(option => option.value === value)?.label || value));
		return createRawFilterQuery(node.id, node.config, lucene, summary);
	},
});

export const filterDateController = createFieldController<'metadata-filter-date', DateFieldState, DateFieldUiConfig, MetadataFilterDateFieldConfig>({
	kind: 'metadata-filter-date',
	component: DateField,
	createDefaultState: () => ({
		startDate: { y: '', m: '', d: '' },
		endDate: { y: '', m: '', d: '' },
		mode: 'strict',
	}),
	buildQuery({ node, state }) {
		const metadata: DateFilterMetadata =
			'fromField' in node.config
				? {
					from_field: node.config.fromField,
					to_field: node.config.toField,
					range: node.config.range,
					min: node.config.min,
					max: node.config.max,
					mode: node.config.mode,
				}
				: {
					field: node.config.field,
					range: node.config.range,
					min: node.config.min,
					max: node.config.max,
				};
		const start = DateUtils.dateValueToLucene(state.startDate, 'start');
		const end = DateUtils.dateValueToLucene(metadata.range ? state.endDate : state.startDate, 'end');
		const lucene =
			start || end
				? (() => {
					const range = `[${start || '00000101'} TO ${end || '99991231'}]`;
					if ('from_field' in metadata) {
						const op = (metadata.mode ?? state.mode) === 'permissive' ? 'OR' : 'AND';
						return `(${metadata.from_field}:${range} ${op} ${metadata.to_field}:${range})`;
					}
					return `${metadata.field}:${range}`;
				})()
				: null;
		const summary =
			lucene != null
				? [
						start && DateUtils.luceneToDisplayString(start),
						DateUtils.dateValueToLucene(state.endDate, 'end') && DateUtils.luceneToDisplayString(DateUtils.dateValueToLucene(state.endDate, 'end')),
				  ]
						.filter(Boolean)
						.join(' - ') || null
				: null;
		return createRawFilterQuery(node.id, node.config, lucene, summary);
	},
});

export const filterRadioController = createFieldController<'metadata-filter-radio', RadioFilterState, RadioFieldUiConfig, MetadataFilterRadioFieldConfig>({
	kind: 'metadata-filter-radio',
	component: RadioField,
	createDefaultState: () => '',
	buildQuery({ node, state }) {
		const lucene = state ? `${node.config.id}:(${escapeLucene(state, false)})` : null;
		const summary = state ? optionLabel(findOption(node.config.options, state) ?? state) : null;
		return createRawFilterQuery(node.id, node.config, lucene, summary);
	},
});

export const filterRangeController = createFieldController<'metadata-filter-range', RangeFieldState, RangeFieldUiConfig, MetadataFilterRangeFieldConfig>({
	kind: 'metadata-filter-range',
	component: RangeField,
	createDefaultState: () => ({
		low: '',
		high: '',
	}),
	buildQuery({ node, state }) {
		const lucene = state.low || state.high ? `${node.config.id}:[${state.low || '0'} TO ${state.high || '9999'}]` : null;
		const summary = state.low || state.high ? `${state.low || '0'} - ${state.high || '9999'}` : null;
		return createRawFilterQuery(node.id, node.config, lucene, summary);
	},
});

export const filterRangeMultipleFieldsController = createFieldController<
	'metadata-filter-range-multiple-fields',
	RangeMultipleFieldsFieldState,
	RangeMultipleFieldsFieldUiConfig,
	MetadataFilterRangeMultipleFieldsFieldConfig
>({
	kind: 'metadata-filter-range-multiple-fields',
	component: RangeMultipleFieldsField,
	createDefaultState: () => ({
		low: '',
		high: '',
		mode: 'strict',
	}),
	buildQuery({ node, state }) {
		const lucene =
			state.low || state.high
				? (() => {
					const lowPadded = state.low ? state.low.padStart(4, '0') : '0';
					const highPadded = state.high ? state.high.padStart(4, '0') : '9999';
					const op = (node.config.mode ?? state.mode) === 'permissive' ? 'OR' : 'AND';
					return `(${node.config.lowField}:[${lowPadded} TO ${highPadded}] ${op} ${node.config.highField}:[${lowPadded} TO ${highPadded}])`;
				})()
				: null;
		const summary = state.low || state.high ? `${state.low || '0'} - ${state.high || '9999'}` : null;
		return createRawFilterQuery(node.id, node.config, lucene, summary);
	},
});

export const filterSelectController = createFieldController<'metadata-filter-select', MetadataFilterSelectFieldState, SelectFieldUiConfig, MetadataFilterSelectFieldConfig>({
	kind: 'metadata-filter-select',
	component: SelectField,
	createDefaultState: (): MetadataFilterSelectFieldState => ({
		selectedValues: [],
		caseSensitive: false,
	}),
	buildQuery({ node, state }) {
		const selectedValues = state.selectedValues.filter(value => value.trim());
		const summary = summarizeSelectField(node.config, selectedValues);
		return withSummary(
			artifactFromFilter(termFilter(node.config.id, selectedValues)),
			summary
				? {
					id: node.id,
					label: node.config.displayName,
					value: summary,
					group: node.config.groupId,
				}
				: null,
		);
	},
});

export const filterTextController = createFieldController<'metadata-filter-text', TextFieldState, TextFieldUiConfig, MetadataFilterTextFieldConfig>({
	kind: 'metadata-filter-text',
	component: TextField as FieldControllerComponent<TextFieldState, TextFieldUiConfig>,
	createDefaultState: () => ({
		value: '',
		caseSensitive: false,
	}),
	buildQuery({ node, state }) {
		const lucene = buildTextLucene(node.config.id, state);
		return createRawFilterQuery(node.id, node.config, lucene, summarizeText(state));
	},
});
