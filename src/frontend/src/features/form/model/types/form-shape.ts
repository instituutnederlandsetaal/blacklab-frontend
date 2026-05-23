/**
 * Contains the core types for the UI state in the form system.
 * I.e. the node graph that defines the order of the containers and fields that are shown in the form,
 * and their mapping to internal state and controllers.
 */

import type { Component } from 'vue';

import type { FieldComponent, FieldController, FieldNodeConfig, ViewDefinition } from '@/features/form/model/types/form-controllers';

export type FormNodeKind = 'container' | 'form' | 'field' | 'view';
export type ContainerPresentation = 'list' | 'tabs' | 'small-tabs' | (string & {});
export type QueryCombineMode = 'allOf' | 'anyOf' | 'sequence';

export type UiConfig<Variant extends string = string> = {
	/** UI hint for this node, e.g. "tabs" or "large" */
	variant?: Variant;
};

/** The base for all form nodes */
export type FormNodeBase = {
	id: string;
	title?: string;
	titleKey?: string;
	class?: string;
};

export type ContainerNodeConfig = UiConfig<ContainerPresentation> & {
	/** How child fields should be combined in the query */
	combine?: QueryCombineMode;
};

/**
 * A container contains any number of child forms, containers, or search fields/widgets.
 * A limitation is that a container can only contain fields if the container has a form somewhere in its ancestry.
 */
export type FormContainerNode<Config extends ContainerNodeConfig = ContainerNodeConfig> = FormNodeBase & {
	kind: 'container';
	/** If not set, uses the default container renderer. */
	component?: Component<{ node: FormContainerNode<Config>; hideTitle?: boolean }>;
	config?: Config;
	children: FormNode[];
};

/** When submitting a form, the form can indicate some initial result displaying settings. */
export type ResultPreset = {
	viewedResults?: string;
	groupBy?: string[];
	sort?: string | null;
	groupDisplayMode?: string | null;
};

/**
 * The form boundary. Forms cannot contain other forms.
 * This is what will provide the eventual query, by grouping all descendant fields and combining them.
 * It *does not* have to be the root of the form tree, and it *does not* mean all child nodes are local to this form.
 * Forms can share fields and containers with other forms.
 * It's designed this way to fascilitate sharing of filters across our forms.
 * It enables the addition of fields in its descendant containers, and defines the scope for field controllers and views.
 */
export type FormBoundaryNode = FormNodeBase & {
	kind: 'form';
	children: FormChildNode[];
	resultPreset?: Partial<ResultPreset>;
};

/**
 * A field represents a widget that the user can interact with to define part of their search query.
 * It is associated with a controller that defines how the field's state is built, encoded, and validated,
 * while the node itself carries the concrete component used to render that field.
 */
export type FormFieldNode<Config extends object = object, State = any> = FormNodeBase & {
	kind: 'field';
	/** The backing controller for this field. Used to manage the state and conversion from/to query. */
	controller: FieldController<string, State, Config>;
	/** The concrete Vue component used to render this field instance. */
	component: FieldComponent<State>;
	/** Configuration for this specific instance of the field */
	config: FieldNodeConfig<Config>;
};

/**
 * A view represents a widget that doesn't directly contribute to the search query, and isn't serialized/persisted.
 * It can be used to output things relevant to the query, or for general markup like headings and descriptions.
 * We use them to display summaries, and totals.
 * Like fields, views are also configurable and can have different variants.
 * It is associated with a viewKind that defines how the view is rendered and behaves.
 */
export type FormViewNode<Config = unknown> = FormNodeBase & {
	kind: 'view';
	view: ViewDefinition<string, Config>;
	config: Config;
	variant?: string; // e.g. 'large', 'small', etc. should make this explicit?
};

export type FormChildNode = FormContainerNode<any> | FormFieldNode<any, any> | FormViewNode<any>;
export type FormNode = FormContainerNode<any> | FormFieldNode<any, any> | FormViewNode<any> | FormBoundaryNode;

export type NodeKindMap = {
	container: FormContainerNode<any>;
	form: FormBoundaryNode;
	field: FormFieldNode<any, any>;
	view: FormViewNode<any>;
};
export type NodeKind = keyof NodeKindMap;
