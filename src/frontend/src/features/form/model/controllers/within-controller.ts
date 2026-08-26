import type { WithinFieldDefinition, WithinFieldOption } from '@/features/form/fields/within-field';
import { object, record, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';
import { textPredicate, within } from '@/features/form/model/types/form-query-ir';

import { findOption, optionLabel } from '@/shared/utils/options';

const persistenceCodec = object({
	element: scalar()
		.transform<string | null>({ encode: value => value ?? '', decode: value => value || null })
		.default(null)
		.at('e'),
	attributes: record(scalar().default('')).default({}).at('a'),
})
	.default({ element: null, attributes: {} })
	.refine((state, { config }) => {
		const option = state.element == null ? null : config.options.find((candidate: WithinFieldOption) => candidate.value === state.element);
		if (state.element != null && !option) return `Cannot restore within element '${state.element}' because it is not available in the current form.`;
		const availableAttributes = option?.attributes ?? [];
		const unavailableAttribute = Object.keys(state.attributes).find(attribute => !findOption(availableAttributes, attribute));
		if (unavailableAttribute) return `Cannot restore within attribute '${unavailableAttribute}' because it is not available for element '${state.element ?? ''}'.`;
	});

export const withinController = defineFieldController<'within', WithinFieldDefinition>({
	kind: 'within',
	createDefaultState: () => ({ element: null, attributes: {} }),
	persistence: { key: () => 'within', codec: persistenceCodec },
	outputs: ['patt', 'withspans'],
	collect(_config, _runtime, state, emit) {
		if (!state.element) return;
		const attributes = Object.fromEntries(
			Object.entries(state.attributes)
				.filter(([, value]) => value.trim())
				.map(([name, value]) => [name, textPredicate('wildcard', value)]),
		);
		emit('patt', within(state.element, attributes));
		if (Object.keys(attributes).length) emit('withspans', true);
	},
	summarize(config, runtime, state, emit) {
		if (!state.element) return;
		const selectedOption = findOption(config.options, state.element);
		const option = typeof selectedOption === 'string' ? { value: selectedOption } : (selectedOption ?? { value: state.element });
		emit({ label: runtime.translate.$t(`search.extended.within`), value: optionLabel(option), summaryType: ['patt'] });
	},
});
