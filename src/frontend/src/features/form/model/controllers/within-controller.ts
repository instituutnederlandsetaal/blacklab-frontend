import { markRaw } from 'vue';

import { createQueryArtifact, createQueryContribution, withSummary, withWrapper } from '@/features/form/model/compile/query-artifact';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types/form-shape';

import type { Option } from '@/shared/utils/options';

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
	getQueryContribution(config, runtime, state) {
		const artifact = createQueryArtifact();
		if (!state.element) return createQueryContribution();
		const option = config.options.find((option: WithinFieldOption) => option.value === state.element);
		return withSummary(
			withWrapper(artifact, {
				type: 'within',
				element: state.element,
				attributes: state.attributes,
			}),
			{
				id: config.id,
				label: runtime.translate?.$t(`search.extended.within`) ?? 'Within',
				value: option ? (runtime.translate?.$tSpanDisplayName(option) ?? option.label ?? option.value) : state.element,
			},
		);
	},

	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
});
export default withinController;
