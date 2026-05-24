import { markRaw, type Component } from 'vue';

import type { QueryContribution } from '@/features/form/model/types/form-query';
import type { FormFieldNode, FormViewNode } from '@/features/form/model/types/form-shape';

import type { Translate } from '@/shared/i18n';

export type FormRuntimeCorpus = {
	indexId?: string;
	textDirection?: 'ltr' | 'rtl';
};

export type FormRuntimeContext = {
	corpus?: FormRuntimeCorpus;
	translate?: Translate;
};

export type FieldNodeConfig<Config extends object = object> = Config;

export type FieldRendererProps<ModelValue = any, Config = unknown> = {
	config: Config;
	htmlId: string;
	modelValue: ModelValue;
};

export type FieldComponent<ModelValue, Config extends object = any> = Component<FieldRendererProps<ModelValue, Config>>;
export type FieldControllerComponent<ModelValue, Config extends object = any> = FieldComponent<ModelValue, Config>;

export type FieldControllerGetQueryContributionInputs<State, Config extends object = object> = {
	node: FormFieldNode<Config, State>;
	state: State;
	// formState: FormState; // shouldn't be required?
	runtime: FormRuntimeContext;
};

/**
 * Unbound controller, i.e. one per field/widget type, not per instance.
 * Contains the logic to create the default state for a field, and to derive its query contribution from the state.
 */
export type FieldController<Kind extends string = string, State = any, Config extends object = object> = {
	// Unique key for this controller, used in the form shape definition to bind it to a node/field.
	kind: Kind;
	createDefaultState: (node: FormFieldNode<Config, State>, runtime: FormRuntimeContext) => State;
	getQueryContribution?: (input: FieldControllerGetQueryContributionInputs<State, Config>) => QueryContribution;
	restore?: (payload: unknown, node: FormFieldNode<Config, State>, runtime: FormRuntimeContext) => State;
	encode?: (state: State, node: FormFieldNode<Config, State>, runtime: FormRuntimeContext) => unknown;
	validate?: (node: FormFieldNode<Config, State>, runtime: FormRuntimeContext) => string[];

	/** Required for form versioning - return something that uniquely identifies the configuration of this controller,
	 * so that when restoring from history we can check if the controller has changed in a non-compatible way. */
	toJSON(): any;
};

export type CreateFieldControllerInput<Kind extends string, State, Config extends object> = Omit<
	FieldController<Kind, State, Config>,
	'toJSON'
> & {
	version?: number;
	configVersion?: number;
	toJSON?: () => any;
};

export function createFieldController<Kind extends string, State, Config extends object>(definition: CreateFieldControllerInput<Kind, State, Config>): FieldController<Kind, State, Config> {
	const { configVersion = 1, toJSON, version = 1, ...controller } = definition;
	return markRaw({
		...controller,
		toJSON() {
			return toJSON?.() ?? { kind: controller.kind, version, configVersion };
		},
	});
}

export type ViewDefinition<Kind extends string = string, Config = unknown> = {
	// Unique key for this view, used in the form shape definition to bind it to a node/view.
	kind: Kind;
	// Vue component for this view
	component: Component<{ node: FormViewNode<Config> }>;
};
