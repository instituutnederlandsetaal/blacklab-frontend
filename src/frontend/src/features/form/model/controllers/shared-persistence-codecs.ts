import { array, bool, object, scalar } from '@/features/form/model/controllers/persistence-codec';

import { findOption } from '@/shared/utils/options';

export const textPersistenceCodec = object({
	value: scalar().default('').atRoot(),
	caseSensitive: bool().default(false).at('c'),
})
	.default({ value: '', caseSensitive: false })
	.omitWhen(state => !state.value.trim() && !state.caseSensitive);

export const selectionPersistenceCodec = array(scalar())
	.default([])
	.refine((values, { config }) => {
		const unknown = values.filter(value => !findOption(config.options, value));
		return unknown.length ? `Cannot restore values no longer present in the current options: ${unknown.join(', ')}.` : undefined;
	});

export const rangeModePersistenceCodec = scalar().mapped({ strict: 's', permissive: 'p' });

export const rangePersistenceCodec = object({
	low: scalar().default('').at('l'),
	high: scalar().default('').at('h'),
	mode: rangeModePersistenceCodec.default(({ config }) => config.mode ?? 'strict').at('m'),
}).default(({ config }) => ({ low: '', high: '', mode: config.mode ?? 'strict' }));
