import { markRaw } from 'vue';

import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, encodePersistObject } from '@/features/form/model/controllers/persistence-codec';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types/form-shape';

import { findOption, type Option } from '@/shared/utils/options';

export type WithinFieldState = {
	element: string | null;
	attributes: Record<string, string>;
};

export type WithinFieldOption = Option & {
	attributes?: Option[];
};

export type WithinFieldConfig = {
	options: WithinFieldOption[];
};

export type WithFieldComponentProps = ImplicitFieldComponentProps<WithinFieldState> & WithinFieldConfig;

export const withinController: FieldController<'within', WithinFieldState, Omit<WithinFieldConfig, 'htmlId'>> = markRaw({
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
		const restored = decodePersistObject(payload);
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

	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
});
export default withinController;
