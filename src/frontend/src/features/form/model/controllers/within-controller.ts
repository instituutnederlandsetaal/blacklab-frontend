import type { WithinFieldDefinition, WithinFieldOption } from '@/features/form/fields/within-field';
import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { object, record, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';

import { findOption } from '@/shared/utils/options';

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
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, runtime, state) {
		if (!state.element) return queryFragment();
		const option = findOption(config.options, state.element) ?? { value: state.element };
		return queryFragment([{ type: 'within', element: state.element, attributes: state.attributes }], {
			label: runtime.translate.$t(`search.extended.within`),
			value: runtime.translate.$tSpanDisplayName(option),
		});
	},
});
