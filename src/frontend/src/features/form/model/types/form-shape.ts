import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { ContainerPresentation, FieldPresentation, FormNodeKind, FormValue, QueryCombineMode } from '@/features/form/model/types/form-primitives';
import type { QueryIR } from '@/features/form/model/types/form-query-ir';
import type { AnyVueComponent } from '@/types/helpers';

export type { FieldPresentation, FormNodeKind, FormValue, QueryCombineMode } from '@/features/form/model/types/form-primitives';

/** The base for all form nodes */
export type BaseNode = {
	readonly id: string;
	title?: FormValue<string>;
	class?: string;
};
// Container
// ==========================================================================================================================

export type BaseContainerNode = BaseNode & {
	readonly kind: 'container';
	/** Defaults to list if unset */
	variant?: ContainerPresentation | ContainerPresentation[];
	/** Ordered graph edges; mutate through the builder's parent editor methods. */
	readonly children: readonly AnyRealFormNode[];
	/** Defaults to 'and' if unset */
	combine?: QueryCombineMode;
	/**
	 * Optional query contributions keyed by direct child ID and applied while that
	 * child is selected. This provisions semantic tabs such as "newspapers"
	 * adding an implicit filter without attaching parent-specific behavior to the
	 * child node itself.
	 */
	readonly activeChildQueryContributions?: Readonly<Record<string, QueryIR>>;
};
export type RealContainerNode<Extra, C extends AnyVueComponent> = BaseContainerNode & Extra & { readonly component: C };

// Form boundary - specialization of container
// ==========================================================================================================================

export type BaseFormNode = Omit<BaseContainerNode, 'kind' | 'combine'> & {
	readonly kind: 'form';
};
export type RealFormNode<Extra, C extends AnyVueComponent> = BaseFormNode & Extra & { readonly component: C };

export type ImplicitContainerComponentProps = BaseNode & {
	kind: BaseContainerNode['kind'] | BaseFormNode['kind'];
	variant?: BaseContainerNode['variant'];
	children: Array<{ is: AnyVueComponent; props: any }>;
	hideTitle?: boolean;
};

// Field
// ==========================================================================================================================

export type BaseFieldNode = BaseNode & {
	readonly kind: 'field';
	/** Defaults to default if unset */
	variant?: FieldPresentation | FieldPresentation[];
};
export type RealFieldNode<Extra, C extends AnyVueComponent> = BaseFieldNode &
	Extra & {
		readonly controller: FieldController<string, unknown, object>;
		readonly component: C;
	};

// View
// ==========================================================================================================================

export type BaseViewNode = BaseNode & {
	readonly kind: 'view';
};
export type RealViewNode<Extra, C extends AnyVueComponent> = BaseViewNode & Extra & { readonly component: C };

export type AnyBaseFormNode = BaseContainerNode | BaseFormNode | BaseFieldNode | BaseViewNode;
export type AnyRealFormNode = RealContainerNode<unknown, any> | RealFormNode<unknown, any> | RealFieldNode<unknown, any> | RealViewNode<unknown, any>;
export type ContainerNode = RealContainerNode<unknown, any>;
export type FormBoundaryNode = RealFormNode<unknown, any>;
export type FormContainerLikeNode = ContainerNode | FormBoundaryNode;

export type FormFieldNode = RealFieldNode<unknown, any>;
export type FormViewNode = RealViewNode<unknown, any>;
export type FormNode = FormContainerLikeNode | FormFieldNode | FormViewNode;

export type NodeKindMap = {
	container: ContainerNode;
	form: FormBoundaryNode;
	field: FormFieldNode;
	view: FormViewNode;
};
export type NodeKind = FormNodeKind;
