import { toValue } from 'vue';

import { createDefaultCheckboxFieldState, type CheckboxFieldDefinition } from '@/features/form/fields/generic/checkbox-field';
import { createDefaultDateFieldState, DateUtils, type DateFieldDefinition, type DateFieldState } from '@/features/form/fields/generic/date-field';
import { createDefaultRadioFieldState, type RadioFieldDefinition } from '@/features/form/fields/generic/radio-field';
import { createDefaultRangeFieldState, type RangeFieldDefinition } from '@/features/form/fields/generic/range-field';
import { createDefaultSelectFieldState, type SelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { createDefaultTextFieldState, type TextFieldDefinition } from '@/features/form/fields/generic/text-field';
import { object, scalar, stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { rangeModePersistenceCodec, rangePersistenceCodec, selectionPersistenceCodec, textPersistenceCodec } from '@/features/form/model/controllers/shared-persistence-codecs';
import { booleanNode, filter, filterRange, summary, type LuceneNode } from '@/features/form/model/types';
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

const radioPersistenceCodec = stringPersistenceCodec<FieldPersistenceContext<MetadataFilterRadioConfig>>().refine((value, { config }) =>
	!value || findOption(config.options, value) ? undefined : `Cannot restore values no longer present in the current options: ${value}.`,
);

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
	mode: rangeModePersistenceCodec.default(({ config }) => config.mode ?? 'strict').at('m'),
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
	outputs: ['filter'],
	collect(config, _runtime, state, emit) {
		const node = booleanNode(
			'or',
			tokenizeString(state.value, true).map(term => filter(config.metadataFieldId, term.isQuoted ? 'literal' : 'wildcard', term.value)!),
		) as LuceneNode | null;
		if (node) emit('filter', node);
	},
	summarize(config, _runtime, state, emit) {
		const entry = summary(
			toValue(config.displayName),
			tokenizeString(state.value, true).map(term => term.value),
			undefined,
			config.groupId,
		);
		if (entry) emit(entry);
	},
});

export const filterCheckboxController = defineFieldController<'metadata-filter-checkbox', CheckboxFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-checkbox',
	createDefaultState: createDefaultCheckboxFieldState,
	persistence: { key: metadataPersistKey, codec: selectionPersistenceCodec },
	outputs: ['filter'],
	collect(config, _runtime, state, emit) {
		const node = filter(config.metadataFieldId, 'literal', state);
		if (node) emit('filter', node);
	},
	summarize(config, _runtime, state, emit) {
		const entry = summary(toValue(config.displayName), state, undefined, config.groupId, config.options);
		if (entry) emit(entry);
	},
});

export const filterDateController = defineFieldController<'metadata-filter-date', DateFieldDefinition, MetadataFilterControllerConfig | BiMetadataFilterControllerConfig>({
	kind: 'metadata-filter-date',
	createDefaultState: createDefaultDateFieldState,
	persistence: { key: metadataPersistKey, codec: datePersistenceCodec },
	outputs: ['filter'],
	collect(config, _runtime, state, emit) {
		const enteredStart = DateUtils.dateValueToString(state.startDate, 'start');
		const enteredEnd = DateUtils.dateValueToString(config.range ? state.endDate : state.startDate, 'end');
		if (!enteredStart && !enteredEnd) return;

		const start = enteredStart || DateUtils.dateValueToString({ d: '1', m: '1', y: '0' }, 'start');
		const end = enteredEnd || DateUtils.dateValueToString({ d: '31', m: '12', y: '9999' }, 'end');
		const filterNode = isBiFieldConfig(config)
			? booleanNode((config.mode ?? state.mode) === 'permissive' ? 'or' : 'and', [
					(start === end ? filter(config.fromField, 'literal', start) : filterRange(config.fromField, start, end))!,
					(start === end ? filter(config.toField, 'literal', start) : filterRange(config.toField, start, end))!,
				])
			: start === end
				? filter(config.metadataFieldId, 'literal', start)
				: filterRange(config.metadataFieldId, start, end);
		if (filterNode) emit('filter', filterNode);
	},
	summarize(config, _runtime, state, emit) {
		const enteredStart = DateUtils.dateValueToString(state.startDate, 'start');
		const enteredEnd = DateUtils.dateValueToString(config.range ? state.endDate : state.startDate, 'end');
		const value = [enteredStart && DateUtils.dateValueToDisplayString(state.startDate), config.range && enteredEnd && DateUtils.dateValueToDisplayString(state.endDate)].filter(Boolean).join(' - ');
		if (value) emit({ label: toValue(config.displayName), value, group: config.groupId });
	},
});

export const filterRadioController = defineFieldController<'metadata-filter-radio', RadioFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-radio',
	createDefaultState: createDefaultRadioFieldState,
	persistence: { key: metadataPersistKey, codec: radioPersistenceCodec },
	outputs: ['filter'],
	collect(config, _runtime, state, emit) {
		const node = filter(config.metadataFieldId, 'literal', state);
		if (node) emit('filter', node);
	},
	summarize(config, _runtime, state, emit) {
		const entry = summary(toValue(config.displayName), state, undefined, config.groupId, config.options);
		if (entry) emit(entry);
	},
});

function normalizeRangeBound(value: string, fallback: string) {
	const trimmed = value.trim();
	return trimmed && /^\d+$/.test(trimmed) ? trimmed.padStart(4, '0') : trimmed || fallback;
}

export const filterRangeController = defineFieldController<'metadata-filter-range', RangeFieldDefinition, MetadataFilterControllerConfig | BiMetadataFilterControllerConfig>({
	kind: 'metadata-filter-range',
	createDefaultState: createDefaultRangeFieldState,
	persistence: { key: metadataPersistKey, codec: rangePersistenceCodec },
	outputs: ['filter'],
	collect(config, _runtime, state, emit) {
		if (!state.low.trim() && !state.high.trim()) return;
		const bounds = [normalizeRangeBound(state.low, '0'), normalizeRangeBound(state.high, '9999')] as const;
		const fields = isBiFieldConfig(config) ? [config.fromField, config.toField] : [config.metadataFieldId];
		const node = booleanNode(
			(config.mode ?? state.mode) === 'permissive' ? 'or' : 'and',
			fields.map(field => filterRange(field, ...bounds)!),
		);
		if (node) emit('filter', node);
	},
	summarize(config, _runtime, state, emit) {
		if (!state.low && !state.high) return;
		emit({ label: toValue(config.displayName), value: `${state.low || '0'} - ${state.high || '9999'}`, group: config.groupId });
	},
});

export const filterSelectController = defineFieldController<'metadata-filter-select', SelectFieldDefinition, MetadataFilterControllerConfig>({
	kind: 'metadata-filter-select',
	createDefaultState: createDefaultSelectFieldState,
	persistence: { key: metadataPersistKey, codec: selectionPersistenceCodec },
	outputs: ['filter'],
	collect(config, _runtime, state, emit) {
		const node = filter(
			config.metadataFieldId,
			'literal',
			state.filter(value => value.trim()),
		);
		if (node) emit('filter', node);
	},
	summarize(config, _runtime, state, emit) {
		const values = state.filter(value => value.trim());
		const entry = summary(toValue(config.displayName), values, undefined, config.groupId, config.options);
		if (entry) emit(entry);
	},
});
