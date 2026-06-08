import type { MaybeRefOrGetter } from 'vue';

import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { BooleanType, QueryFragment } from '@/features/form/model/types/form-query';
import type { AnyVueComponent } from '@/types/helpers';

/** The base for all form nodes */
export type BaseNode = {
	id: string;
	title?: MaybeRefOrGetter<string>;
	class?: string;
};
// Container
// ==========================================================================================================================

export type ContainerPresentation = 'list' | 'tabs' | 'small-tabs' | (string & {}); // open-ended but with some fixed types we support internally.
export type QueryCombineMode = BooleanType | 'sequence';

export type BaseContainerNode = BaseNode & {
	kind: 'container';
	/** Defaults to list if unset */
	variant?: ContainerPresentation | ContainerPresentation[];
	children: AnyRealFormNode[];
	/** Defaults to 'and' if unset */
	combine?: QueryCombineMode;
	/**
	 * Optional query contribution applied only while this container/form is the active child of its parent.
	 * This provisions semantic tabs such as "newspapers" adding an implicit filter.
	 */
	activeQueryContribution?: QueryFragment | ((activeNode: BaseContainerNode | BaseFormNode) => QueryFragment);
};
export type RealContainerNode<Extra, C extends AnyVueComponent> = BaseContainerNode & Extra & { component: C };

// Form boundary - specialization of container
// ==========================================================================================================================

/** When submitting a form, the form can indicate some initial result displaying settings. */
export type ResultPreset = {
	viewedResults?: string;
	groupBy?: string[];
	sort?: string | null;
	groupDisplayMode?: string | null;
};

export type BaseFormNode = Omit<BaseContainerNode, 'kind' | 'combine'> & {
	kind: 'form';
	resultPreset?: Partial<ResultPreset>;
};
export type RealFormNode<Extra, C extends AnyVueComponent> = BaseFormNode & Extra & { component: C };

export type ImplicitContainerComponentProps = BaseNode & {
	kind: BaseContainerNode['kind'] | BaseFormNode['kind'];
	variant?: BaseContainerNode['variant'];
	children: BaseContainerNode['children'];
	hideTitle?: boolean;
};

// Field
// ==========================================================================================================================

export type FieldPresentation = 'simple' | 'large' | 'default' | (string & {}); // open-ended but with some fixed types we support internally.

export type BaseFieldNode = BaseNode & {
	kind: 'field';
	/** Defaults to default if unset */
	variant?: FieldPresentation | FieldPresentation[];
};
export type RealFieldNode<Extra, C extends AnyVueComponent> = BaseFieldNode &
	Extra & {
		controller: FieldController<string, any, any>;
		component: C;
	};

export type ImplicitFieldComponentProps<State> = BaseNode & {
	htmlId: string;
	modelValue: State;
	disabled?: boolean;
	variant?: BaseFieldNode['variant'];
};
export type FormControllerProps<Extra> = BaseNode & Extra;

// View
// ==========================================================================================================================

export type BaseViewNode = BaseNode & {
	kind: 'view';
};
export type RealViewNode<Extra, C extends AnyVueComponent> = BaseViewNode & Extra & { component: C };

export type AnyBaseFormNode = BaseContainerNode | BaseFormNode | BaseFieldNode | BaseViewNode;
export type AnyRealFormNode = RealContainerNode<unknown, any> | RealFormNode<unknown, any> | RealFieldNode<unknown, any> | RealViewNode<unknown, any>;
export type ContainerNode = RealContainerNode<unknown, any>;
export type FormBoundaryNode = RealFormNode<unknown, any>;
export type FormContainerLikeNode = ContainerNode | FormBoundaryNode;

export type FormFieldNode = RealFieldNode<unknown, any>;
export type FormViewNode = RealViewNode<unknown, any>;
export type FormNode = FormContainerLikeNode | FormFieldNode | FormViewNode;
export type FormNodeBase = BaseNode;

export type NodeKindMap = {
	container: ContainerNode;
	form: FormBoundaryNode;
	field: FormFieldNode;
	view: FormViewNode;
};
export type NodeKind = keyof NodeKindMap;
export type FormNodeKind = NodeKind;
