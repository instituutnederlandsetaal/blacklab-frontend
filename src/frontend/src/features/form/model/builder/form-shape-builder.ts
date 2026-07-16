import type { FieldComponentProps, FieldRuntimeComponentProps } from '@/features/form/model/field-component-props';
import { createFormFieldNode, type ConstrainedFieldComponent, type CreatedFormField, type FormFieldConfig } from '@/features/form/model/form-field-node';
import { getAllNodes, isContainerNode } from '@/features/form/model/form-utils';
import type { AnyFieldController, FormRuntimeContext } from '@/features/form/model/types';
import type {
	AnyBaseFormNode,
	AnyRealFormNode,
	BaseContainerNode,
	BaseFormNode,
	BaseViewNode,
	FormBoundaryNode,
	FormContainerLikeNode,
	FormNode,
	ImplicitContainerComponentProps,
	NodeKind,
	NodeKindMap,
	RealContainerNode,
	RealFormNode,
	RealViewNode,
} from '@/features/form/model/types/form-shape';
import type { AnyVueComponent, ConstrainComponentToProvidedProps, NoExtraProperties, PublicPropsOf } from '@/types/helpers';

// Helpers
// ==========================================================================================================================

type BuilderManagedNodeKeys = 'children' | 'kind' | 'component' | 'controller';
type ForbiddenConfigKeys = BuilderManagedNodeKeys | keyof FieldRuntimeComponentProps<unknown>;
type ImplicitContainerComponentPropKeys = keyof ImplicitContainerComponentProps;

type ExtractExtraPropsFromComponent<C extends AnyVueComponent, ImplicitKeys extends PropertyKey> = Omit<PublicPropsOf<C>, ImplicitKeys>;
type ExtractExtraPropsFromConfig<Config> = Omit<Config, ForbiddenConfigKeys>;

// Container
// ==========================================================================================================================

type NewContainerNodeFnConfig<C extends AnyVueComponent> = Omit<ExtractExtraPropsFromComponent<C, ImplicitContainerComponentPropKeys> & BaseContainerNode, ForbiddenConfigKeys>;
type NewContainerNodeFnReturn<C extends AnyVueComponent, Config extends NewContainerNodeFnConfig<C>> = AddChildNodes & RealContainerNode<ExtractExtraPropsFromConfig<Config>, C>;
type NewContainerNodeFnArgs<C extends AnyVueComponent, Config extends NewContainerNodeFnConfig<C>> = [
	id: string,
	component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & ExtractExtraPropsFromConfig<Config>>,
	config: NoExtraProperties<NewContainerNodeFnConfig<C>, Config>,
];

interface NewContainerNodeFn {
	<C extends AnyVueComponent, Config extends NewContainerNodeFnConfig<C>>(...args: NewContainerNodeFnArgs<C, Config>): NewContainerNodeFnReturn<C, Config>;
}
// new container is a terminal operation - returning the container.
interface NewContainerNode {
	newContainer: NewContainerNodeFn;
}

// Form
// ==========================================================================================================================

type NewFormNodeFnConfig<C extends AnyVueComponent> = Omit<ExtractExtraPropsFromComponent<C, ImplicitContainerComponentPropKeys> & BaseFormNode, ForbiddenConfigKeys>;
type NewFormNodeFnArgs<C extends AnyVueComponent, Config extends NewFormNodeFnConfig<C>> = [
	id: string,
	component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & ExtractExtraPropsFromConfig<Config>>,
	config: NoExtraProperties<NewFormNodeFnConfig<C>, Config>,
];

interface NewFormNodeFn {
	<C extends AnyVueComponent, Config extends NewFormNodeFnConfig<C>>(...args: NewFormNodeFnArgs<C, Config>): AddChildNodes & RealFormNode<ExtractExtraPropsFromConfig<Config>, C>;
}
// new form is a terminal operation - returning the form.
interface NewFormNode {
	newForm: NewFormNodeFn;
}

// Field
// ==========================================================================================================================

type NewFieldNodeFnReturn<C extends AnyVueComponent, Config extends FormFieldConfig<C, AnyFieldController>> = CreatedFormField<C, Config>;
type NewFieldNodeFnArgs<C extends AnyVueComponent, Controller extends AnyFieldController, Config extends FormFieldConfig<C, Controller>> = [
	id: string,
	controller: Controller,
	component: ConstrainedFieldComponent<C, Controller>,
	config: NoExtraProperties<FormFieldConfig<C, Controller>, Config>,
];
interface NewFieldNodeFn {
	<Controller extends AnyFieldController, C extends AnyVueComponent, Config extends FormFieldConfig<C, Controller>>(
		...args: NewFieldNodeFnArgs<C, Controller, Config>
	): NewFieldNodeFnReturn<C, Config>;
}

// new field is a terminal operation - returning the field.
interface NewFieldNode {
	newField: NewFieldNodeFn;
}

// View
// ==========================================================================================================================

type NewViewNodeFnConfig<C extends AnyVueComponent> = Omit<ExtractExtraPropsFromComponent<C, keyof BaseViewNode> & BaseViewNode, ForbiddenConfigKeys>;
type NewViewNodeFnReturn<C extends AnyVueComponent, Config extends NewViewNodeFnConfig<C>> = RealViewNode<ExtractExtraPropsFromConfig<Config>, C>;
type NewViewNodeFnArgs<C extends AnyVueComponent, Config extends NewViewNodeFnConfig<C>> = [
	id: string,
	component: ConstrainComponentToProvidedProps<C, FieldComponentProps<never> & ExtractExtraPropsFromConfig<Config>>,
	config: NoExtraProperties<NewViewNodeFnConfig<C>, Config>,
];

interface NewViewNodeFn {
	<C extends AnyVueComponent, Config extends NewViewNodeFnConfig<C>>(...args: NewViewNodeFnArgs<C, Config>): NewViewNodeFnReturn<C, Config>;
}
// new view is a terminal operation - returning the view.
interface NewViewNode {
	newView: NewViewNodeFn;
}

// Children
// ==========================================================================================================================

interface AddChildNodes {
	addChildren(...children: Array<AnyRealFormNode | null | undefined>): this;
}

// Builder
// ==========================================================================================================================

export type FormRegistrationCallback = (api: FormBuilder) => RealContainerNode<unknown, AnyVueComponent> | RealFormNode<unknown, AnyVueComponent> | void;

/**
 * Builds the static form graph. Runtime state and Vue rendering deliberately live
 * outside this class so a definition can be recreated, inspected, and shared
 * without becoming part of a reactive dependency graph.
 */
export class FormBuilder implements NewContainerNode, NewFormNode, NewFieldNode, NewViewNode {
	public readonly context: FormRuntimeContext;

	public constructor(context: FormRuntimeContext) {
		this.context = {
			corpus: { ...context.corpus },
			translate: context.translate,
		};
	}

	private nodeMap: Record<string, AnyBaseFormNode> = {};
	private root: BaseContainerNode | BaseFormNode | null = null;

	public getRoot(): FormContainerLikeNode {
		const containers = Object.values(this.nodeMap).filter(isContainerNode);
		const childIds = new Set(containers.flatMap(node => node.children.map(child => child.id)));
		const graphRoots = containers.filter(node => !childIds.has(node.id));
		const root = graphRoots.find(node => node === this.root) ?? graphRoots.find(node => node.kind === 'form') ?? graphRoots[0] ?? this.root;
		if (!root) throw new Error('Root node is not set');
		return root as FormContainerLikeNode;
	}

	public hasNode(id: string): boolean {
		return !!this.nodeMap[id];
	}
	public getNode(id: string): FormNode | null {
		return (this.nodeMap[id] as FormNode | undefined) ?? null;
	}

	private addNode<T extends AnyBaseFormNode>(node: T): T {
		if (!this.nodeMap[node.id]) {
			this.nodeMap[node.id] = node;
			// A builder may create reusable fields/containers before its first form.
			// Keep the first container as a provisional root, but let the first form
			// take over once it is created.
			if (isContainerNode(node) && !this.root) this.root = node;
			if (node.kind === 'form' && (!this.root || this.root.kind === 'container')) this.root = node;
		} else if (this.nodeMap[node.id] !== node) {
			throw new Error(`Node with id ${node.id} already exists in this form builder`);
		}
		return node;
	}

	private addChildToNode<T extends AnyBaseFormNode & { children: AnyRealFormNode[] }>(node: T, ...children: Array<AnyRealFormNode | null | undefined>): T {
		for (const child of children) {
			if (!child) continue;
			if (getAllNodes(child).some(descendant => descendant.id === node.id)) {
				throw new Error(`Adding '${child.id}' to '${node.id}' would create a form graph cycle`);
			}
			node.children.push(this.addNode(child));
		}
		return node;
	}

	newContainer: NewContainerNodeFn = <C extends AnyVueComponent, Config extends NewContainerNodeFnConfig<C>>(
		id: string,
		component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & ExtractExtraPropsFromConfig<Config>>,
		config: NoExtraProperties<NewContainerNodeFnConfig<C>, Config>,
	) => {
		const node: NewContainerNodeFnReturn<C, Config> = {
			...config,
			kind: 'container',
			id,
			children: [],
			component: component as C,
			addChildren: (...children: Array<AnyRealFormNode | null | undefined>) => this.addChildToNode(node, ...children),
		};
		return this.addNode(node);
	};

	newForm: NewFormNodeFn = <C extends AnyVueComponent, Config extends NewFormNodeFnConfig<C>>(
		id: string,
		component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & ExtractExtraPropsFromConfig<Config>>,
		config: NoExtraProperties<NewFormNodeFnConfig<C>, Config>,
	) => {
		const node: AddChildNodes & RealFormNode<ExtractExtraPropsFromConfig<Config>, C> = {
			...config,
			kind: 'form',
			id,
			children: [],
			component: component as C,
			addChildren: (...children: Array<AnyRealFormNode | null | undefined>) => this.addChildToNode(node, ...children),
		};
		return this.addNode(node);
	};

	newField: NewFieldNodeFn = (id, controller, component, config) => {
		return this.addNode(createFormFieldNode({ id }, controller, component, config)) as any;
	};

	newView: NewViewNodeFn = (id, component, config) => {
		return this.addNode({
			...config,
			component: component as any,
			id,
			kind: 'view' as const,
		} satisfies BaseViewNode);
	};

	getField(id: string) {
		return this.getTypedNode(id, 'field');
	}
	getView(id: string) {
		return this.getTypedNode(id, 'view');
	}
	getForm(id: string) {
		return this.getTypedNode(id, 'form');
	}
	getContainer(id: string) {
		return this.getTypedNode(id, 'container');
	}

	private getTypedNode<Kind extends NodeKind>(id: string, type: Kind): NodeKindMap[Kind] | null {
		const node = this.nodeMap[id];
		if (!node || node.kind !== type) return null;
		return node as NodeKindMap[Kind];
	}

	public get nodeList(): FormNode[] {
		return Object.values(this.nodeMap) as FormNode[];
	}

	public get containerList(): FormContainerLikeNode[] {
		return this.nodeList.filter(isContainerNode);
	}

	public get formsList(): FormBoundaryNode[] {
		return this.containerList.filter((node): node is FormBoundaryNode => node.kind === 'form');
	}

	public get formsMap(): Record<string, FormBoundaryNode> {
		return Object.fromEntries(this.formsList.map(form => [form.id, form]));
	}
}
