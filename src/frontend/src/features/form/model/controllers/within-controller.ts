import { markRaw } from 'vue';

import { createQueryArtifact, createQueryContribution, withSummary, withWrapper } from '@/features/form/model/compile/query-artifact';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { FormComponentProps } from '@/features/form/model/types/form-shape';

import type { Option } from '@/shared/utils/options';

export type WithinFieldState = {
	element: string | null;
	attributes: Record<string, string>;
};

export type WithinFieldOption = Option & {
	attributes?: Option[];
};

export type WithinFieldConfig = {
	label?: string;
	options: WithinFieldOption[];
};

export type WithFieldComponentProps = FormComponentProps<WithinFieldState> & WithinFieldConfig;

export const withinController: FieldController<'within', WithinFieldState, Omit<WithinFieldConfig, 'htmlId'>> = markRaw({
	kind: 'within',
	createDefaultState: () => ({ element: null, attributes: {} }),
	getQueryContribution(config, _runtime, state) {
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
				label: config.label ?? 'Within',
				value: option?.label ?? state.element,
			},
		);
	},

	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
});
export default withinController;
