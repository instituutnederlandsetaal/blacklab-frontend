import type { FieldComponentProps, FieldRuntimeComponentProps } from '@/features/form/model/field-component-props';
import { createFormFieldNode, type ConstrainedFieldComponent, type CreatedFormField, type FormFieldConfig } from '@/features/form/model/form-field-node';
import { checkNoLoops, getAllNodes, isContainerNode } from '@/features/form/model/form-utils';
import type { AnyFieldController, FormRuntimeContext } from '@/features/form/model/types';
import type { QueryIR } from '@/features/form/model/types/form-query-ir';
import type {
	AnyBaseFormNode,
	AnyRealFormNode,
	BaseContainerNode,
	BaseFormNode,
	BaseViewNode,
	FormBoundaryNode,
	FormContainerLikeNode,
	FormFieldNode,
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

type BuilderManagedNodeKeys = 'id' | 'children' | 'kind' | 'component' | 'controller' | 'activeChildQueryContributions';
type ForbiddenConfigKeys = BuilderManagedNodeKeys | keyof FieldRuntimeComponentProps<unknown>;
type ImplicitContainerComponentPropKeys = keyof ImplicitContainerComponentProps;

type MutableContainerGraphFields = {
	children: AnyRealFormNode[];
	activeChildQueryContributions?: Record<string, QueryIR>;
};

/**
 * Node topology is readonly to consumers so extension code has to use the
 * validated editor API. The builder owns the underlying plain objects during
 * definition construction, making this narrow cast its deliberate mutation
 * boundary. This is compile-time protection, not runtime immutability.
 */
function mutableGraphFields(node: BaseContainerNode | BaseFormNode): MutableContainerGraphFields {
	return node as unknown as MutableContainerGraphFields;
}

/** Assign all extension properties without exposing them to object spread/enumeration. */
function assignNonEnumerable<Target extends object, Properties extends object>(target: Target, properties: Properties): Target & Properties {
	for (const key of Reflect.ownKeys(properties)) {
		Object.defineProperty(target, key, {
			...Object.getOwnPropertyDescriptor(properties, key)!,
			enumerable: false,
		});
	}
	return target as Target & Properties;
}

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

export type AddChildOptions = {
	queryWhenActive?: QueryIR;
};

export type FormNodeReference = FormNode | string;

export interface ParentFormNodeEditor {
	appendChild<Child extends AnyRealFormNode>(child: Child, options?: AddChildOptions): Child;
	prependChild<Child extends AnyRealFormNode>(child: Child, options?: AddChildOptions): Child;
	insertBefore<Child extends AnyRealFormNode>(newChild: Child, referenceChild: FormNodeReference, options?: AddChildOptions): Child;
	replaceChild<Child extends AnyRealFormNode>(newChild: Child, oldChild: FormNodeReference, options?: AddChildOptions): FormNode;
	removeChild(child: FormNodeReference): FormNode;
}

export interface AddChildNodes extends ParentFormNodeEditor {
	addChild(child: AnyRealFormNode, options?: AddChildOptions): this;
	addChildren(...children: Array<AnyRealFormNode | null | undefined>): this;
}

export type BuilderContainerNode = FormContainerLikeNode & AddChildNodes;
export type BuilderFormNode = FormBoundaryNode & AddChildNodes;
export type BuilderNode = BuilderContainerNode | FormFieldNode | NodeKindMap['view'];

// Builder
// ==========================================================================================================================

/**
 * A build-time extension callback. Nodes are owned by the builder that creates
 * or first adopts them and must not be transplanted between builders.
 */
export type FormRegistrationCallback = (api: FormBuilder) => RealContainerNode<unknown, AnyVueComponent> | RealFormNode<unknown, AnyVueComponent> | void;

/**
 * Builds the static form graph. Runtime state and Vue rendering deliberately live
 * outside this class so a definition can be recreated, inspected, and shared
 * without becoming part of a reactive dependency graph.
 *
 * Structural edits are supported only while constructing/customizing a
 * definition. A node belongs to one builder for its lifetime; sharing nodes
 * within that builder is supported, but transplanting them between builders is
 * not. This ownership rule is a caller contract rather than a runtime check.
 * Treat `id`, `kind`, component/controller identity, children, and active-child
 * contributions as builder-owned and use the editor methods rather than mutating
 * them directly.
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
		if (!this.root) throw new Error('Root node is not set');
		return this.root as FormContainerLikeNode;
	}

	public hasNode(id: string): boolean {
		return !!this.nodeMap[id];
	}
	public getNode(id: string): FormNode | null {
		return (this.nodeMap[id] as FormNode | undefined) ?? null;
	}
	public getElementById(id: string): BuilderNode | null {
		return (this.nodeMap[id] as BuilderNode | undefined) ?? null;
	}

	public getParents(nodeOrId: FormNodeReference): BuilderContainerNode[] {
		const node = this.resolveNode(nodeOrId);
		if (!node) return [];
		return this.containerList.filter(parent => parent.children.some(child => child === node)) as BuilderContainerNode[];
	}

	/** Like DOM `Node.contains`, a node contains itself. */
	public contains(ancestor: FormNodeReference, descendant: FormNodeReference): boolean {
		const resolvedAncestor = this.resolveNode(ancestor);
		const resolvedDescendant = this.resolveNode(descendant);
		if (!resolvedAncestor || !resolvedDescendant) return false;
		return getAllNodes(resolvedAncestor).includes(resolvedDescendant);
	}

	private resolveNode(nodeOrId: FormNodeReference): FormNode | null {
		const id = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId.id;
		return (this.nodeMap[id] as FormNode | undefined) ?? null;
	}

	private addNode<T extends AnyBaseFormNode>(node: T): T {
		if (!this.nodeMap[node.id]) {
			this.nodeMap[node.id] = node;
			// A builder may create reusable fields/containers before its first form.
			// Keep the first container as a provisional root, but let the first form
			// take over once it is created.
			if (isContainerNode(node) && !this.root) this.root = node;
			// Prefer a first form over an unused provisional container. Once a
			// container has structure, it is an intentional graph root.
			if (node.kind === 'form' && this.root?.kind === 'container' && !this.root.children.length) this.root = node;
		} else if (this.nodeMap[node.id] !== node) {
			throw new Error(`Node with id ${node.id} already exists in this form builder`);
		}
		return node;
	}

	private assertRegisteredParent(node: BaseContainerNode | BaseFormNode): void {
		if (this.nodeMap[node.id] !== node) throw new Error(`Parent node '${node.id}' is not registered in this form builder`);
	}

	private validateSubgraph(node: AnyRealFormNode, replacedNode?: FormNode): FormNode[] {
		checkNoLoops(node);
		const nodes = getAllNodes(node);
		const nodesById = new Map<string, FormNode>();
		for (const candidate of nodes) {
			const duplicate = nodesById.get(candidate.id);
			if (duplicate && duplicate !== candidate) throw new Error(`Form graph contains different nodes with the same id '${candidate.id}'`);
			nodesById.set(candidate.id, candidate);

			const registered = this.nodeMap[candidate.id];
			if (registered && registered !== candidate && registered !== replacedNode) {
				throw new Error(`Node with id ${candidate.id} already exists in this form builder`);
			}
			if (isContainerNode(candidate)) {
				const childIds = new Set<string>();
				for (const child of candidate.children) {
					if (childIds.has(child.id)) throw new Error(`Parent '${candidate.id}' already contains child '${child.id}'`);
					childIds.add(child.id);
				}
			}
		}
		return nodes;
	}

	private registerNodes(nodes: FormNode[], excludedNode?: FormNode): void {
		for (const candidate of nodes) {
			if (candidate === excludedNode) continue;
			if (isContainerNode(candidate)) this.attachGraphFunctions(candidate);
			this.addNode(candidate);
		}
	}

	private setActiveChildContribution(node: BaseContainerNode | BaseFormNode, childId: string, contribution?: QueryIR): void {
		const graph = mutableGraphFields(node);
		if (contribution) {
			graph.activeChildQueryContributions ??= {};
			graph.activeChildQueryContributions[childId] = contribution;
			return;
		}
		if (!graph.activeChildQueryContributions) return;
		delete graph.activeChildQueryContributions[childId];
		if (!Object.keys(graph.activeChildQueryContributions).length) delete graph.activeChildQueryContributions;
	}

	private prepareChild<Child extends AnyRealFormNode>(node: BaseContainerNode | BaseFormNode, child: Child): Child {
		this.assertRegisteredParent(node);
		if (node.children.some(existing => existing.id === child.id)) throw new Error(`Parent '${node.id}' already contains child '${child.id}'`);
		const childNodes = this.validateSubgraph(child);
		if (childNodes.some(descendant => descendant.id === node.id)) {
			throw new Error(`Adding '${child.id}' to '${node.id}' would create a form graph cycle`);
		}
		this.registerNodes(childNodes);
		return child;
	}

	private linkChild(node: BaseContainerNode | BaseFormNode, child: AnyRealFormNode, options?: AddChildOptions): void {
		this.setActiveChildContribution(node, child.id, options?.queryWhenActive);
		if (this.root === child) this.root = node;
	}

	private insertChildAt<Child extends AnyRealFormNode>(node: BaseContainerNode | BaseFormNode, child: Child, index: number, options?: AddChildOptions): Child {
		mutableGraphFields(node).children.splice(index, 0, this.prepareChild(node, child));
		this.linkChild(node, child, options);
		return child;
	}

	private getDirectChildIndex(node: BaseContainerNode | BaseFormNode, child: FormNodeReference): number {
		const id = typeof child === 'string' ? child : child.id;
		const index = node.children.findIndex(candidate => candidate.id === id);
		if (index === -1) throw new Error(`Node '${id}' is not a child of '${node.id}'`);
		return index;
	}

	private replaceChildInNode<Child extends AnyRealFormNode>(node: BaseContainerNode | BaseFormNode, newChild: Child, oldChild: FormNodeReference, options?: AddChildOptions): FormNode {
		this.assertRegisteredParent(node);
		const index = this.getDirectChildIndex(node, oldChild);
		const removed = node.children[index] as FormNode;
		if (removed.id === newChild.id) throw new Error(`Parent '${node.id}' already contains child '${newChild.id}'`);
		mutableGraphFields(node).children.splice(index, 1, this.prepareChild(node, newChild));
		this.setActiveChildContribution(node, removed.id);
		this.linkChild(node, newChild, options);
		return removed;
	}

	private detachChildAt(node: BaseContainerNode | BaseFormNode, index: number): FormNode {
		const [removed] = mutableGraphFields(node).children.splice(index, 1) as FormNode[];
		this.setActiveChildContribution(node, removed.id);
		return removed;
	}

	private attachGraphFunctions<T extends BaseContainerNode | BaseFormNode>(node: T): T & AddChildNodes {
		return assignNonEnumerable(node, {
			addChild: (child: AnyRealFormNode, options?: AddChildOptions) => {
				this.insertChildAt(node, child, node.children.length, options);
				return node;
			},
			addChildren: (...children: Array<AnyRealFormNode | null | undefined>) => {
				for (const child of children) if (child) this.insertChildAt(node, child, node.children.length);
				return node;
			},
			appendChild: <Child extends AnyRealFormNode>(child: Child, options?: AddChildOptions) => this.insertChildAt(node, child, node.children.length, options),
			prependChild: <Child extends AnyRealFormNode>(child: Child, options?: AddChildOptions) => this.insertChildAt(node, child, 0, options),
			insertBefore: <Child extends AnyRealFormNode>(newChild: Child, referenceChild: FormNodeReference, options?: AddChildOptions) =>
				this.insertChildAt(node, newChild, this.getDirectChildIndex(node, referenceChild), options),
			replaceChild: <Child extends AnyRealFormNode>(newChild: Child, oldChild: FormNodeReference, options?: AddChildOptions) => this.replaceChildInNode(node, newChild, oldChild, options),
			removeChild: (child: FormNodeReference) => {
				this.assertRegisteredParent(node);
				return this.detachChildAt(node, this.getDirectChildIndex(node, child));
			},
		}) as unknown as T & AddChildNodes;
	}

	newContainer: NewContainerNodeFn = <C extends AnyVueComponent, Config extends NewContainerNodeFnConfig<C>>(
		id: string,
		component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & ExtractExtraPropsFromConfig<Config>>,
		config: NoExtraProperties<NewContainerNodeFnConfig<C>, Config>,
	) => {
		const node = this.attachGraphFunctions({
			...config,
			kind: 'container',
			id,
			children: [],
			component: component as C,
		}) as NewContainerNodeFnReturn<C, Config>;
		return this.addNode(node);
	};

	newForm: NewFormNodeFn = <C extends AnyVueComponent, Config extends NewFormNodeFnConfig<C>>(
		id: string,
		component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & ExtractExtraPropsFromConfig<Config>>,
		config: NoExtraProperties<NewFormNodeFnConfig<C>, Config>,
	) => {
		const node = this.attachGraphFunctions({
			...config,
			kind: 'form',
			id,
			children: [],
			component: component as C,
		}) as AddChildNodes & RealFormNode<ExtractExtraPropsFromConfig<Config>, C>;
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
		return this.getTypedNode(id, 'form') as BuilderFormNode | null;
	}
	getContainer(id: string) {
		return this.getTypedNode(id, 'container') as BuilderContainerNode | null;
	}

	/**
	 * Replace a node without changing any of its incoming graph edges. Every
	 * parent keeps the same child position and ID-keyed edge contribution, while
	 * the replacement supplies the complete outgoing subtree whose descendants
	 * are recursively adopted into this builder.
	 */
	public replaceNode(id: string, replacement: AnyRealFormNode): FormNode {
		const current = this.getNode(id);
		if (!current) throw new Error(`Node '${id}' does not exist in this form builder`);
		if (replacement.id !== id) throw new Error(`Replacement node must preserve id '${id}', received '${replacement.id}'`);
		if (replacement === current) return current;
		if (current === this.root && !isContainerNode(replacement)) throw new Error(`Root node '${id}' must remain a container or form`);

		const replacementNodes = this.validateSubgraph(replacement, current);
		const parentEdges = this.getParents(current).map(parent => ({ parent, index: this.getDirectChildIndex(parent, current) }));
		for (const { parent } of parentEdges) {
			if (replacementNodes.includes(parent)) throw new Error(`Replacing '${id}' would create a form graph cycle through '${parent.id}'`);
		}

		if (isContainerNode(replacement)) this.attachGraphFunctions(replacement);
		this.registerNodes(replacementNodes, replacement);
		for (const { parent, index } of parentEdges) {
			mutableGraphFields(parent).children.splice(index, 1, replacement);
		}
		this.nodeMap[id] = replacement;
		if (this.root === current) this.root = replacement as BaseContainerNode | BaseFormNode;
		return current;
	}

	public removeNode(id: string): FormNode {
		const node = this.getNode(id);
		if (!node) throw new Error(`Node '${id}' does not exist in this form builder`);
		for (const parent of this.getParents(node)) this.detachChildAt(parent, this.getDirectChildIndex(parent, node));
		delete this.nodeMap[id];
		if (this.root === node) this.root = null;
		return node;
	}

	public pruneDetachedNodes(): FormNode[] {
		const root = this.getRoot();
		const reachable = new Set(getAllNodes(root));
		const removed: FormNode[] = [];
		for (const node of this.nodeList) {
			if (reachable.has(node)) continue;
			removed.push(node);
			delete this.nodeMap[node.id];
		}
		this.root = root;
		return removed;
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
