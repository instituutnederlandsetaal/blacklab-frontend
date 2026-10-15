import type { DefineFieldComponentProps, FieldComponentProps, FieldRuntimeComponentProps, ResolveFieldComponentProps } from '@/features/form/model/field-component-props';
import { searchTarget } from '@/features/form/model/targets';
import type { AnyFieldController, FieldController } from '@/features/form/model/types/form-controllers';
import type {
	AnyRealFormNode,
	BaseContainerNode,
	BaseFieldNode,
	BaseFormNode,
	BaseViewNode,
	ImplicitContainerComponentProps,
	RealContainerNode,
	RealFieldNode,
	RealFormNode,
	RealViewNode,
} from '@/features/form/model/types/form-shape';
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

export type CreatedFormField<Component extends AnyVueComponent, Config extends object> = RealFieldNode<Omit<Config, ForbiddenFieldConfigKeys>, Component>;

/**
 * Helper for constructing form nodes outside of the FormBuilder in a type-safe manner.
 * Asserts that the controller and component are compatible, and that the config object does not contain any keys that are managed by the node or form system itself.
 */
export const createFormFieldNode = <Controller extends AnyFieldController, Component extends AnyVueComponent, Config extends FormFieldConfig<Component, Controller>>(
	id: string,
	controller: Controller,
	component: ConstrainedFieldComponent<Component, Controller>,
	config: NoExtraProperties<FormFieldConfig<Component, Controller>, Config>,
): CreatedFormField<Component, Config> => {
	return {
		...config,
		component: component as Component,
		controller,
		kind: 'field',
		id,
	};
};

type ForbiddenNodeConfigKeys = ForbiddenFieldConfigKeys | 'children' | 'activeChildOutputProducers';

export type ContainerNodeConfig<C extends AnyVueComponent> = Omit<Omit<PublicPropsOf<C>, keyof ImplicitContainerComponentProps> & BaseContainerNode, ForbiddenNodeConfigKeys>;
export type FormNodeConfig<C extends AnyVueComponent> = Omit<Omit<PublicPropsOf<C>, keyof ImplicitContainerComponentProps> & BaseFormNode, ForbiddenNodeConfigKeys | 'target'> & {
	target?: BaseFormNode['target'];
};
type ViewNodeConfig<C extends AnyVueComponent> = Omit<Omit<PublicPropsOf<C>, keyof BaseViewNode> & BaseViewNode, ForbiddenNodeConfigKeys>;

/** Construct a detached container; insertion or replacement validates and registers its subtree. */
export const createFormContainerNode = <C extends AnyVueComponent, Config extends ContainerNodeConfig<C>>(
	id: string,
	component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & Config>,
	config: NoExtraProperties<ContainerNodeConfig<C>, Config>,
	children: readonly AnyRealFormNode[] = [],
): RealContainerNode<Config, C> => ({ ...config, kind: 'container', id, children: [...children], component: component as C });

/** Construct a detached form with the ordinary search target unless a target is supplied. */
export const createFormNode = <C extends AnyVueComponent, Config extends FormNodeConfig<C>>(
	id: string,
	component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & Config>,
	config: NoExtraProperties<FormNodeConfig<C>, Config>,
	children: readonly AnyRealFormNode[] = [],
): RealFormNode<Config, C> => ({ ...config, target: config.target ?? searchTarget, kind: 'form', id, children: [...children], component: component as C });

/** Construct a detached display-only node. */
export const createFormViewNode = <C extends AnyVueComponent, Config extends ViewNodeConfig<C>>(
	id: string,
	component: ConstrainComponentToProvidedProps<C, FieldComponentProps<never> & Config>,
	config: NoExtraProperties<ViewNodeConfig<C>, Config>,
): RealViewNode<Config, C> => ({ ...config, component: component as C, id, kind: 'view' });
