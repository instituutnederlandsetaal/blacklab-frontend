import type { DefineFieldComponentProps, FieldComponentProps, FieldRuntimeComponentProps, ResolveFieldComponentProps } from '@/features/form/model/field-component-props';
import type { AnyFieldController, FieldController } from '@/features/form/model/types/form-controllers';
import type { BaseFieldNode, RealFieldNode } from '@/features/form/model/types/form-shape';
import type { AnyVueComponent, ConstrainComponentToProvidedProps, DistributiveOmit, NoExtraProperties, PublicPropsOf } from '@/types/helpers';

type ForbiddenFieldConfigKeys = 'id' | 'kind' | 'component' | 'controller' | keyof FieldRuntimeComponentProps<unknown>;

type ConstrainComponentFromController<Component extends AnyVueComponent, Controller> =
	Controller extends FieldController<string, infer State, infer Extra> ? ConstrainComponentToProvidedProps<Component, ResolveFieldComponentProps<FieldComponentProps<State> & Extra>> : never;

type ExtractExtraPropsFromComponent<Component extends AnyVueComponent> = Omit<PublicPropsOf<Component>, keyof FieldComponentProps<unknown> | keyof FieldRuntimeComponentProps<unknown>>;
type ExtractExtraPropsFromController<Controller> = Controller extends FieldController<string, any, infer Extra> ? Extra : never;

/** Prefer the field/controller contract, retaining only genuinely component-specific and fallback base props. */
type MergeFieldConfigProps<ControllerProps, ComponentProps> = ControllerProps extends object
	? ComponentProps extends object
		? ControllerProps & Omit<ComponentProps, keyof ControllerProps> & Omit<BaseFieldNode, keyof ControllerProps | keyof ComponentProps>
		: never
	: never;

export type FormFieldConfig<Component extends AnyVueComponent, Controller extends AnyFieldController> = DistributiveOmit<
	MergeFieldConfigProps<ExtractExtraPropsFromController<Controller>, DefineFieldComponentProps<ExtractExtraPropsFromComponent<Component>>>,
	ForbiddenFieldConfigKeys
>;

export type ConstrainedFieldComponent<Component extends AnyVueComponent, Controller extends AnyFieldController> = ConstrainComponentFromController<Component, Controller>;

export type FormFieldNodeOptions = {
	id: string;
	inheritedVariant?: BaseFieldNode['variant'];
};

export type CreatedFormField<Component extends AnyVueComponent, Config extends object> = RealFieldNode<Omit<Config, ForbiddenFieldConfigKeys>, Component>;

/**
 * Helper for constructing form nodes outside of the FormBuilder in a type-safe manner.
 * Asserts that the controller and component are compatible, and that the config object does not contain any keys that are managed by the node or form system itself.
 */
export const createFormFieldNode = <Controller extends AnyFieldController, Component extends AnyVueComponent, Config extends FormFieldConfig<Component, Controller>>(
	options: string | FormFieldNodeOptions,
	controller: Controller,
	component: ConstrainedFieldComponent<Component, Controller>,
	config: NoExtraProperties<FormFieldConfig<Component, Controller>, Config>,
): CreatedFormField<Component, Config> => {
	const { id, inheritedVariant } = typeof options === 'string' ? { id: options, inheritedVariant: undefined } : options;
	return {
		...config,
		variant: config.variant ?? inheritedVariant,
		component,
		controller,
		kind: 'field',
		id,
	} as any;
};
