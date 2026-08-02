import type { BaseFieldNode, FormValue } from '@/features/form/model/types/form-shape';

const renderedValuePropNames = [
	'title',
	'displayName',
	'description',
	'placeholder',
	'lowPlaceholder',
	'highPlaceholder',
	'lengthDisplayName',
	'selectorDisplayName',
	'selectorPlaceholder',
] as const;
export type FieldFormValueProp = (typeof renderedValuePropNames)[number];
type RenderedValueProp = FieldFormValueProp;
const renderedValueProps = new Set<RenderedValueProp>(renderedValuePropNames);

type ResolveFormValue<T> = NonNullable<T> extends FormValue<infer Value> ? Value | Extract<T, null | undefined> : T;

/** @internal Convert definition/controller props to the contract presented to a component. */
export type ResolveFieldComponentProps<Props> = {
	[Key in keyof Props]: Key extends RenderedValueProp ? ResolveFormValue<Props[Key]> : Props[Key];
};

/** @internal Convert a component's resolved value props back to definition-time lazy values. */
export type DefineFieldComponentProps<Props> = {
	[Key in keyof Props]: Key extends RenderedValueProp ? FormValue<Props[Key]> : Props[Key];
};

/** Common configurable values stored on every field node. */
export type FieldDefinitionProps = {
	title?: FormValue<string>;
	class?: string;
	variant?: BaseFieldNode['variant'];
	/** Optional summary grouping. */
	groupId?: string;
	displayName?: FormValue<string>;
	description?: FormValue<string | undefined>;
	textDirection?: 'ltr' | 'rtl';
	showLabel?: boolean;
};

/** Common props as seen by a mounted field component. Lazy definition values are resolved. Mapped from DefinitionProps + state + things computed based on form state. */
export type FieldComponentProps<State> = {
	id: string;
	title?: string;
	class?: string;
	htmlId: string;
	modelValue: State;
	disabled?: boolean;
	variant?: BaseFieldNode['variant'];
	groupId?: string;
	/** Optional because not every specialized field renders a configurable label. */
	displayName?: string;
	description?: string;
	textDirection?: 'ltr' | 'rtl';
	showLabel?: boolean;
};

/** Public component props/listeners supplied by the form runtime rather than field node config. */
export type FieldRuntimeComponentProps<State> = Omit<FieldComponentProps<State>, keyof FieldDefinitionProps> & {
	'onUpdate:modelValue': (value: State) => void;
};

type RequiredProps<Props, Keys extends keyof Props> = Omit<Props, Keys> & Required<Pick<Props, Keys>>;
export type FieldBaseProp = Extract<keyof FieldDefinitionProps, keyof FieldComponentProps<any>>;
export type RequiredFieldDefinitionProps<Keys extends FieldBaseProp> = RequiredProps<FieldDefinitionProps, Keys>;
export type RequiredFieldComponentProps<State, Keys extends FieldBaseProp> = RequiredProps<FieldComponentProps<State>, Keys>;

/** Base definition props for fields which require a visible display name. */
export type NamedFieldDefinitionProps = RequiredFieldDefinitionProps<'displayName'>;
/** Base component props for fields which require a visible display name. */
export type NamedFieldComponentProps<State> = FieldComponentProps<State> & { displayName: string };

type DefineSelectedFormValues<Props, FormValueKeys extends keyof Props> = {
	[Key in keyof Props]: Key extends FormValueKeys ? FormValue<Props[Key]> : Props[Key];
};

/**
 * The complete prop contract for a field kind.
 *
 * `ExtraProps` describes values after resolution, exactly as the Vue component
 * receives them. `FormValueKeys` selects the extra values which may also be
 * supplied as lazy resolvers on a form node. `RequiredBasePropKeys` promotes
 * optional common props to required props without redeclaring them as extras.
 *
 * Use the named members (or the extraction aliases below) everywhere else so
 * state, controller config, node config, and component props cannot drift.
 */
export type FieldDefinition<
	State,
	ExtraProps extends object = object,
	FormValueKeys extends Extract<keyof ExtraProps, FieldFormValueProp> = never,
	RequiredBasePropKeys extends FieldBaseProp = never,
> = {
	state: State;
	baseProps: RequiredFieldComponentProps<State, RequiredBasePropKeys>;
	extraProps: ExtraProps;
	nodeProps: RequiredFieldDefinitionProps<RequiredBasePropKeys> & DefineSelectedFormValues<ExtraProps, FormValueKeys>;
	componentProps: RequiredFieldComponentProps<State, RequiredBasePropKeys> & ExtraProps;
};

/** A field contract whose common `displayName` prop is required. */
export type NamedFieldDefinition<State, ExtraProps extends object = object, FormValueKeys extends Extract<keyof ExtraProps, FieldFormValueProp> = never> = FieldDefinition<
	State,
	ExtraProps,
	FormValueKeys,
	'displayName'
>;

export type AnyFieldDefinition = {
	state: any;
	baseProps: FieldComponentProps<any>;
	extraProps: object;
	nodeProps: object;
	componentProps: object;
};
export type FieldState<Definition extends AnyFieldDefinition> = Definition['state'];
export type FieldBaseProps<Definition extends AnyFieldDefinition> = Definition['baseProps'];
export type FieldExtraProps<Definition extends AnyFieldDefinition> = Definition['extraProps'];
export type FieldNodeProps<Definition extends AnyFieldDefinition> = Definition['nodeProps'];
export type ResolvedFieldProps<Definition extends AnyFieldDefinition> = Definition['componentProps'];

export type RenderedNodeProps<Source extends object, OmittedKey extends PropertyKey = never> = ResolveFieldComponentProps<Omit<Source, Extract<OmittedKey, keyof Source>>>;

/** @internal Copy node properties while exposing lazy UI values as live accessor properties. */
export function createRenderedNodeProps<Source extends object, const OmittedKeys extends readonly string[]>(source: Source, omittedKeys: OmittedKeys): RenderedNodeProps<Source, OmittedKeys[number]>;
export function createRenderedNodeProps(source: object, omittedKeys: readonly string[]): Record<string, unknown> {
	const props: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source)) {
		if (omittedKeys.includes(key)) continue;
		if (renderedValueProps.has(key as RenderedValueProp)) {
			Object.defineProperty(props, key, {
				enumerable: true,
				get: () => {
					const currentValue = (source as Record<string, unknown>)[key];
					return typeof currentValue === 'function' ? currentValue() : currentValue;
				},
			});
		} else {
			props[key] = value;
		}
	}
	return props;
}
