import { toValue } from 'vue';

import { createDefaultCheckboxFieldState, type CheckboxFieldDefinition } from '@/features/form/fields/generic/checkbox-field';
import { createDefaultDateFieldState, DateUtils, type DateFieldDefinition, type DateFieldState } from '@/features/form/fields/generic/date-field';
import { createDefaultRadioFieldState, type RadioFieldDefinition } from '@/features/form/fields/generic/radio-field';
import { createDefaultRangeFieldState, type RangeFieldDefinition } from '@/features/form/fields/generic/range-field';
import { createDefaultSelectFieldState, type SelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldDefinition } from '@/features/form/fields/generic/text-field';
import { array, bool, object, scalar, stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { booleanNode, filter, filterRange, queryFragment, summary, type LuceneNode } from '@/features/form/model/types';
import { defineFieldController, type FieldControllerConfig, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';

import { findOption } from '@/shared/utils/options';
import { tokenizeString } from '@/shared/utils/string-utils';

export type MetadataFilterControllerConfig = {
	metadataFieldId: string;
};

type BiMetadataFilterControllerConfig = {
	fromField: string;
	toField: string;
};

const isBiFieldConfig = (config: MetadataFilterControllerConfig | BiMetadataFilterControllerConfig): config is BiMetadataFilterControllerConfig => 'fromField' in config && 'toField' in config;

type MetadataFilterRadioConfig = FieldControllerConfig<RadioFieldDefinition, MetadataFilterControllerConfig>;
function metadataPersistKey(config: MetadataFilterControllerConfig | BiMetadataFilterControllerConfig) {
	return isBiFieldConfig(config) ? `${config.fromField}-${config.toField}` : config.metadataFieldId;
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
	.transform<DateFieldState['startDate']>({
		encode: value => [value.y, value.m, value.d].filter(Boolean).join('-'),
		decode(value) {
			const [y = '', m = '', d = ''] = (value ?? '').split('-');
			return { y, m, d };
		},
	})
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
		const terms = tokenizeString(state.value, true);
		return queryFragment<LuceneNode>(
			booleanNode(
				'or',
				terms.map(term => filter(config.metadataFieldId, term.isQuoted ? 'literal' : 'wildcard', term.value)!),
			),
			summary(
				toValue(config.displayName),
				terms.map(term => term.value),
				this.affectsBlackLabParameters,
				config.groupId,
			),
		);
	},
});

export const filterCheckboxController = defineFieldController<'metadata-filter-checkbox', CheckboxFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-checkbox',
	createDefaultState: createDefaultCheckboxFieldState,
	persistence: { key: metadataPersistKey, codec: selectionPersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		return queryFragment<LuceneNode>(filter(config.metadataFieldId, 'literal', state), summary(toValue(config.displayName), state, this.affectsBlackLabParameters, config.groupId, config.options));
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
		if (!enteredStart && !enteredEnd) return null;

		const start = enteredStart || DateUtils.dateValueToString({ d: '1', m: '1', y: '0' }, 'start');
		const end = enteredEnd || DateUtils.dateValueToString({ d: '31', m: '12', y: '9999' }, 'end');
		const filterNode = isBiFieldConfig(config)
			? booleanNode(
					(config.mode ?? state.mode) === 'permissive' ? 'or' : 'and',
					(start === end ? filter(config.fromField, 'literal', start) : filterRange(config.fromField, start, end))!,
					(start === end ? filter(config.toField, 'literal', start) : filterRange(config.toField, start, end))!,
				)
			: start === end
				? filter(config.metadataFieldId, 'literal', start)
				: filterRange(config.metadataFieldId, start, end);
		const summaryValue =
			[enteredStart && DateUtils.dateValueToDisplayString(state.startDate), config.range && enteredEnd && DateUtils.dateValueToDisplayString(state.endDate)].filter(Boolean).join(' - ') || null;
		return queryFragment<LuceneNode>(
			filterNode,
			summaryValue
				? {
						label: toValue(config.displayName),
						value: summaryValue,
						summaryType: this.affectsBlackLabParameters,
						group: config.groupId,
					}
				: null,
		);
	},
});

export const filterRadioController = defineFieldController<'metadata-filter-radio', RadioFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-radio',
	createDefaultState: createDefaultRadioFieldState,
	persistence: { key: metadataPersistKey, codec: radioPersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		if (!state) return null;
		return queryFragment<LuceneNode>(filter(config.metadataFieldId, 'literal', state), summary(toValue(config.displayName), state, this.affectsBlackLabParameters, config.groupId, config.options));
	},
});

export const filterRangeController = defineFieldController<'metadata-filter-range', RangeFieldDefinition, MetadataFilterControllerConfig | BiMetadataFilterControllerConfig>({
	kind: 'metadata-filter-range',
	createDefaultState: createDefaultRangeFieldState,
	persistence: { key: metadataPersistKey, codec: rangePersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		if (!state.low && !state.high) return null;

		const lowPadded = state.low ? state.low.padStart(4, '0') : '0';
		const highPadded = state.high ? state.high.padStart(4, '0') : '9999';
		const summaryValue = `${state.low || '0'} - ${state.high || '9999'}`;

		if (isBiFieldConfig(config)) {
			const filterNode = booleanNode(
				(config.mode ?? state.mode) === 'permissive' ? 'or' : 'and',
				filterRange(config.fromField, lowPadded, highPadded)!,
				filterRange(config.toField, lowPadded, highPadded)!,
			);
			return queryFragment<LuceneNode>(filterNode, {
				label: toValue(config.displayName),
				value: summaryValue,
				summaryType: this.affectsBlackLabParameters,
				group: config.groupId,
			});
		}

		return queryFragment<LuceneNode>(filterRange(config.metadataFieldId, state.low || '0', state.high || '9999'), {
			label: toValue(config.displayName),
			value: summaryValue,
			summaryType: this.affectsBlackLabParameters,
			group: config.groupId,
		});
	},
});

export const filterSelectController = defineFieldController<'metadata-filter-select', SelectFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-select',
	createDefaultState: createDefaultSelectFieldState,
	persistence: { key: metadataPersistKey, codec: selectionPersistenceCodec },
	affectsBlackLabParameters: ['filter'],
	getQueryContribution(config, _runtime, state) {
		const values = state.filter(value => value.trim());
		if (!values.length) return null;
		return queryFragment<LuceneNode>(filter(config.metadataFieldId, 'literal', values), summary(toValue(config.displayName), values, this.affectsBlackLabParameters, config.groupId, config.options));
	},
});
