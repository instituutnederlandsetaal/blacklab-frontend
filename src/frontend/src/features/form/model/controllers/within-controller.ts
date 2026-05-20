import { markRaw } from 'vue';

import { createQueryArtifact, withSummary, withWrapper } from '@/features/form/model/compile/query-artifact';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { FieldControllerConfig } from '@/features/form/model/types/form-shape';

import type { Option } from '@/shared/utils/options';

import WithinField from '@/features/form/fields/WithinField.vue';

export type WithinFieldState = {
	element: string | null;
	attributes: Record<string, string>;
};

export type WithinFieldOption = Option & {
	attributes?: Option[];
};

export type WithinFieldConfig = FieldControllerConfig & {
	label?: string;
	options: WithinFieldOption[];
};

export const withinController: FieldController<'within', WithinFieldState, WithinFieldConfig> = markRaw({
	kind: 'within',
	component: WithinField,
	createDefaultState: () => ({ element: null, attributes: {} }),
	buildQuery({ node, state }) {
		const artifact = createQueryArtifact();
		if (!state.element) return artifact;
		const option = node.config.options.find(option => option.value === state.element);
		return withSummary(
			withWrapper(artifact, {
				type: 'within',
				element: state.element,
				attributes: state.attributes,
			}),
			{
				id: node.id,
				label: node.config.label ?? 'Within',
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
