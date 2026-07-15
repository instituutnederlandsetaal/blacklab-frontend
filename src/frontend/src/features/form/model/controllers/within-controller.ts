import type { WithinFieldDefinition } from '@/features/form/fields/within-field';
import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { decodePersistRecord, encodePersistObject } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';

import { findOption } from '@/shared/utils/options';

export const withinController = defineFieldController<'within', WithinFieldDefinition>({
	kind: 'within',
	createDefaultState: () => ({ element: null, attributes: {} }),
	getPersistKey: () => 'within',
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		return encodePersistObject({
			element: state.element,
			...Object.fromEntries(Object.entries(state.attributes ?? {}).map(([key, value]) => [`attr.${key}`, value])),
		});
	},
	restore(payload) {
		const restored = decodePersistRecord(payload, ['element'], 'within field', { allowUnknownKeys: key => key === 'element' || key.startsWith('attr.') });
		return {
			element: restored.element || null,
			attributes: Object.fromEntries(
				Object.entries(restored)
					.filter(([key]) => key.startsWith('attr.'))
					.map(([key, value]) => [key.slice(5), value]),
			),
		};
	},
	getQueryContribution(config, runtime, state) {
		if (!state.element) return queryFragment();
		const option = findOption(config.options, state.element) ?? { value: state.element };
		return queryFragment([{ type: 'within', element: state.element, attributes: state.attributes }], {
			id: config.id,
			label: runtime.translate.$t(`search.extended.within`),
			value: runtime.translate.$tSpanDisplayName(option),
		});
	},
});
