import { markRaw, type Component } from 'vue';

import type { CompilableQuery } from '@/features/form/model/types/form-query';
import type { FieldControllerConfig, FormFieldNode, FormViewNode } from '@/features/form/model/types/form-shape';

import type { Translate } from '@/shared/i18n/i18n';

export type FormRuntimeCorpus = {
	indexId?: string;
	textDirection?: 'ltr' | 'rtl';
};

export type FormRuntimeContext = {
	corpus?: FormRuntimeCorpus;
	translate?: Translate;
};

export type FieldRendererProps<ModelValue = any, Config = unknown> = {
	config: Config;
	htmlId: string;
	modelValue: ModelValue;
};

export type FieldControllerComponent<ModelValue, Config extends object> = Component<FieldRendererProps<ModelValue, Config>>;

export type FieldControllerBuildQueryInputs<State, Config> = {
	node: FormFieldNode<Config>;
	state: State;
	// formState: FormState; // shouldn't be required?
	runtime: FormRuntimeContext;
};

/**
 * Unbound controller, i.e. one per field/widget type, not per instance.
 * Contains the logic to create the default state for a field, and to build a query from the state of a field.
 */
export type FieldController<Kind extends string = string, State = any, ControllerConfig extends object = object, UiConfig extends object = object> = {
	// Unique key for this controller, used in the form shape definition to bind it to a node/field.
	kind: Kind;
	// Which vue component
	component: FieldControllerComponent<State, UiConfig>;
	createDefaultState: (node: FormFieldNode<ControllerConfig>, runtime: FormRuntimeContext) => State;
	buildQuery?: (input: FieldControllerBuildQueryInputs<State, ControllerConfig & UiConfig>) => CompilableQuery;
	restore?: (payload: unknown, node: FormFieldNode<ControllerConfig>, runtime: FormRuntimeContext) => State;
	encode?: (state: State, node: FormFieldNode<ControllerConfig>, runtime: FormRuntimeContext) => unknown;
	validate?: (node: FormFieldNode<ControllerConfig>, runtime: FormRuntimeContext) => string[];

	/** Required for form versioning - return something that uniquely identifies the configuration of this controller,
	 * so that when restoring from history we can check if the controller has changed in a non-compatible way. */
	toJSON(): any;
};

export type CreateFieldControllerInput<Kind extends string, State, ControllerConfig extends FieldControllerConfig, UiConfig extends object> = Omit<
	FieldController<Kind, State, ControllerConfig, UiConfig>,
	'toJSON'
> & {
	version?: number;
	configVersion?: number;
	toJSON?: () => any;
};

export function createFieldController<Kind extends string, State, ControllerConfig extends object, UiConfig extends object>(
	definition: CreateFieldControllerInput<Kind, State, ControllerConfig, UiConfig>,
): FieldController<Kind, State, ControllerConfig, UiConfig> {
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
