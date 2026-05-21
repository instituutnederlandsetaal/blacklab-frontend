import { artifactFromFilter, rawFilter, termFilter, withSummary } from '@/features/form/model/compile/query-artifact';
import {
    getValueFunctionsByKey,
    isFilterActive,
    isFilterValueFunctionKey,
    type FilterAutocompleteMetadata,
    type FilterAutocompleteValue,
    type FilterCheckboxMetadata,
    type FilterCheckboxValue,
    type FilterDateMetadata,
    type FilterDateValue,
    type FilterRadioMetadata,
    type FilterRadioValue,
    type FilterRangeMetadata,
    type FilterRangeMultipleFieldsMetadata,
    type FilterRangeMultipleFieldsValue,
    type FilterRangeValue,
    type FilterTextMetadata,
    type FilterTextValue,
    type FilterValueFunctionKey,
} from '@/features/form/model/filter-value-functions';
import { createFieldController, type FieldController, type FieldControllerComponent } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry } from '@/features/form/model/types/form-query';
import type { FieldControllerConfig } from '@/features/form/model/types/form-shape';

import type { CheckboxFieldUiConfig } from '@/features/form/fields/generic/checkbox-field';
import type { DateFieldUiConfig } from '@/features/form/fields/generic/date-field';
import type { RangeFieldUiConfig } from '@/features/form/fields/generic/range-field';
import type { RangeMultipleFieldsFieldUiConfig } from '@/features/form/fields/generic/range-multiple-fields-field';
import type { RadioFieldUiConfig } from '@/features/form/fields/generic/radio-field';
import type { SelectFieldState, SelectFieldUiConfig } from '@/features/form/fields/generic/select-field';
import type { TextFieldUiConfig } from '@/features/form/fields/generic/text-field';

import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import DateField from '@/features/form/fields/generic/DateField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import RangeField from '@/features/form/fields/generic/RangeField.vue';
import RangeMultipleFieldsField from '@/features/form/fields/generic/RangeMultipleFieldsField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';

import { findOption, optionLabel } from '@/shared/utils/options';

export type MetadataFilterControllerConfig<MetadataType = unknown> = FieldControllerConfig & {
	id: string;
	componentName?: string;
	behaviourName?: string;
	groupId?: string;
	metadata?: MetadataType;
};

export type MetadataFilterUiConfig = {
	displayName: string;
	description?: string;
	textDirection?: 'ltr' | 'rtl';
};

export type MetadataFilterFieldConfig<MetadataType = unknown> = MetadataFilterControllerConfig<MetadataType> & MetadataFilterUiConfig;

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
	| MetadataFilterFieldConfig
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

function getValueFunctionsForConfig(config: Pick<MetadataFilterFieldConfig, 'behaviourName'>, fallback: FilterValueFunctionKey) {
	return config.behaviourName && isFilterValueFunctionKey(config.behaviourName) ? getValueFunctionsByKey(config.behaviourName) : getValueFunctionsByKey(fallback);
}

function createMetadataFilterController<Kind extends string, State, Metadata, UiConfig extends object, Config extends MetadataFilterFieldConfig<any> & UiConfig>(
	kind: Kind,
	component: FieldControllerComponent<State, UiConfig>,
	behaviorKey: FilterValueFunctionKey,
	getBehaviorMetadata: (config: Config) => Metadata | undefined = config => config.metadata as Metadata | undefined,
): FieldController<Kind, State, Config, UiConfig> {
	return createFieldController<Kind, State, UiConfig, Config>({
		kind,
		component,
		createDefaultState(node) {
			return getValueFunctionsForConfig(node.config, behaviorKey).createDefaultValue(node.config) as State;
		},
		buildQuery({ node, state }) {
			const valueFunctions = getValueFunctionsForConfig(node.config, behaviorKey);
			const metadata = getBehaviorMetadata(node.config);
			const lucene = valueFunctions.luceneQuery(node.config.id, metadata, state);
			const summary = getFilterSummaryEntry(node.id, node.config, metadata, state, behaviorKey);
			return withSummary(artifactFromFilter(rawFilter(lucene)), summary);
		},
	});
}

function summarizeSelectField(config: MetadataFilterSelectFieldConfig, values: string[]): string | null {
	const labels = values.map(value => optionLabel(findOption(config.options, value) ?? value));
	return labels.length >= 2 ? labels.map(value => `"${value}"`).join(', ') : labels[0] || null;
}

export const filterAutocompleteController = createMetadataFilterController<'metadata-filter-autocomplete', FilterAutocompleteValue, FilterAutocompleteMetadata, TextFieldUiConfig, MetadataFilterAutocompleteFieldConfig>(
	'metadata-filter-autocomplete',
	TextField,
	'filter-autocomplete',
);

export const filterCheckboxController = createMetadataFilterController<'metadata-filter-checkbox', FilterCheckboxValue, FilterCheckboxMetadata, CheckboxFieldUiConfig, MetadataFilterCheckboxFieldConfig>(
	'metadata-filter-checkbox',
	CheckboxField,
	'filter-checkbox',
	config => config.options,
);

export const filterDateController = createMetadataFilterController<'metadata-filter-date', FilterDateValue, FilterDateMetadata, DateFieldUiConfig, MetadataFilterDateFieldConfig>(
	'metadata-filter-date',
	DateField,
	'filter-date',
	config =>
		'fromField' in config
			? {
				from_field: config.fromField,
				to_field: config.toField,
				range: config.range,
				min: config.min,
				max: config.max,
				mode: config.mode,
			}
			: {
				field: config.field,
				range: config.range,
				min: config.min,
				max: config.max,
			},
);

export const filterRadioController = createMetadataFilterController<'metadata-filter-radio', FilterRadioValue, FilterRadioMetadata, RadioFieldUiConfig, MetadataFilterRadioFieldConfig>(
	'metadata-filter-radio',
	RadioField,
	'filter-radio',
	config => config.options,
);

export const filterRangeController = createMetadataFilterController<
	'metadata-filter-range',
	FilterRangeValue,
	FilterRangeMetadata,
	RangeFieldUiConfig,
	MetadataFilterRangeFieldConfig
>('metadata-filter-range', RangeField, 'filter-range');

export const filterRangeMultipleFieldsController = createMetadataFilterController<
	'metadata-filter-range-multiple-fields',
	FilterRangeMultipleFieldsValue,
	FilterRangeMultipleFieldsMetadata,
	RangeMultipleFieldsFieldUiConfig,
	MetadataFilterRangeMultipleFieldsFieldConfig
>(
	'metadata-filter-range-multiple-fields',
	RangeMultipleFieldsField,
	'filter-range-multiple-fields',
	config => ({
		low: config.lowField,
		high: config.highField,
		mode: config.mode,
	}),
);

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

export const filterTextController = createMetadataFilterController<'metadata-filter-text', FilterTextValue, FilterTextMetadata, TextFieldUiConfig, MetadataFilterTextFieldConfig>(
	'metadata-filter-text',
	TextField,
	'filter-text',
);

const metadataFilterControllersByComponentName = {
	'filter-autocomplete': filterAutocompleteController,
	'filter-checkbox': filterCheckboxController,
	'filter-date': filterDateController,
	'filter-radio': filterRadioController,
	'filter-range': filterRangeController,
	'filter-range-multiple-fields': filterRangeMultipleFieldsController,
	'filter-select': filterSelectController,
	'filter-text': filterTextController,
} as const;

type MetadataFilterControllersByComponentName = typeof metadataFilterControllersByComponentName;

export function resolveMetadataFilterController(componentName?: string): MetadataFilterController {
	return (componentName && metadataFilterControllersByComponentName[componentName as keyof MetadataFilterControllersByComponentName]) || filterTextController;
}

function getFilterSummaryLabel(definition: MetadataFilterFieldConfig): string {
	return definition.displayName;
}

function getFilterSummaryEntry(nodeId: string, definition: MetadataFilterFieldConfig, metadata: unknown, state: unknown, fallback: FilterValueFunctionKey): SummaryEntry | null {
	if (!isFilterActive(definition, state)) return null;
	const value = getValueFunctionsForConfig(definition, fallback).luceneQuerySummary(definition.id, metadata, state);
	return value ? { id: nodeId, label: getFilterSummaryLabel(definition), value, group: definition.groupId } : null;
}
