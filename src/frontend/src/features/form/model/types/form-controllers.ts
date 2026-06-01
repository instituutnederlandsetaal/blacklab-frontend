import { markRaw } from 'vue';

import type { QueryContribution } from '@/features/form/model/types/form-query';
import type { BaseFieldNode } from '@/features/form/model/types/form-shape';

import type { Translate } from '@/shared/i18n';

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

// export type FieldComponent<ModelValue, Config extends object = any> = Component<FieldRendererProps<ModelValue, Config>>;
// export type ViewComponent<Config extends object = object> = Component<{ config: Config }>;

// export type FieldControllerGetQueryContributionInputs<State, Extra extends object> = {
// 	node: FormFieldNode<Extra, any>;
// 	state: State;
// 	runtime: FormRuntimeContext;
// };

// /**
//  * Unbound controller, i.e. one per field/widget type, not per instance.
//  * Contains the logic to create the default state for a field, and to derive its query contribution from the state.
//  */
// export type FieldController<Kind extends string = string, State = any, Extra extends object = object> = {
// 	// Unique key for this controller, used in the form shape definition to bind it to a node/field.
// 	kind: Kind;
// 	createDefaultState: (node: FormFieldNode<Extra, any>, runtime: FormRuntimeContext) => State;
// 	getQueryContribution?: (input: FieldControllerGetQueryContributionInputs<State, Extra>) => QueryContribution;
// 	restore?: (payload: unknown, node: FormFieldNode<Extra, any>, runtime: FormRuntimeContext) => State;
// 	encode?: (state: State, node: FormFieldNode<Extra, any>, runtime: FormRuntimeContext) => unknown;
// 	validate?: (node: FormFieldNode<Extra, any>, runtime: FormRuntimeContext) => string[];

// 	/** Required for form versioning - return something that uniquely identifies the configuration of this controller,
// 	 * so that when restoring from history we can check if the controller has changed in a non-compatible way. */
// 	toJSON(): any;
// };

export type FieldControllerProps<Extra> = BaseFieldNode & Extra;
export type FieldController<Kind extends string = string, State = any, Extra = object> = {
	/** Unique key for this controller, used to return strongly typed controllers from the registry. */
	kind: Kind;
	createDefaultState: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => State;
	getQueryContribution?: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext, state: State) => QueryContribution;
	restore?: (payload: unknown, config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => State;
	encode?: (state: State, config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => unknown;
	validate?: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => string[];

	/** Required for form versioning - return something that uniquely identifies the configuration of this controller,
	 * so that when restoring from history we can check if the controller has changed in a non-compatible way. */
	toJSON(): any;
};
export type AnyFieldController = FieldController<string, any, any>;

export type CreateFieldControllerInput<Kind extends string, State, Extra extends object> = Omit<FieldController<Kind, State, Extra>, 'toJSON'> & {
	version?: number;
	configVersion?: number;
	toJSON?: () => any;
};

export function createFieldController<Kind extends string, State, Extra extends object>(definition: CreateFieldControllerInput<Kind, State, Extra>): FieldController<Kind, State, Extra> {
	const { configVersion = 1, toJSON, version = 1, ...controller } = definition;
	return markRaw({
		...controller,
		toJSON() {
			return toJSON?.() ?? { kind: controller.kind, version, configVersion };
		},
	});
}

// export type ViewDefinition<Kind extends string = string, Config extends object = object> = {
// 	// Unique key for this view, used in the form shape definition to bind it to a node/view.
// 	kind: Kind;
// 	// Vue component for this view
// 	component: ViewComponent<Config>;
// };
