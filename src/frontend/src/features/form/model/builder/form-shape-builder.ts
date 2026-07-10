import { computed, markRaw, reactive, ref, toRaw, toRefs, type Ref, type ToRefs } from 'vue';

import { isContainerNode, isFieldNode } from '@/features/form/model/form-utils';
import { compileFormNode } from '@/features/form/model/persistence';
import createFormState, { createDefaultFormState } from '@/features/form/model/state';
import type { AnyFieldController, CompiledFormStateWithSummaries, FieldController, FormRuntimeContext } from '@/features/form/model/types';
import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';
import type {
	AnyBaseFormNode,
	AnyRealFormNode,
	BaseContainerNode,
	BaseFieldNode,
	BaseFormNode,
	BaseViewNode,
	FormBoundaryNode,
	FormContainerLikeNode,
	FormNode,
	ImplicitContainerComponentProps,
	ImplicitFieldComponentProps,
	NodeKind,
	NodeKindMap,
	RealContainerNode,
	RealFieldNode,
	RealFormNode,
	RealViewNode,
} from '@/features/form/model/types/form-shape';
import { ContainerRenderer } from '@/features/form/ui';
import type { AnyVueComponent, ConstrainComponentToProvidedProps, DistributiveOmit, NoExtraProperties, PublicPropsOf } from '@/types/helpers';

import useUid from '@/shared/utils/uid';

// Helpers
// ==========================================================================================================================

type ForbiddenConfigKeys = 'id' | 'children' | 'kind' | 'component' | 'controller' | 'htmlId' | 'modelValue';
type ImplicitComponentPropKeys = keyof ImplicitFieldComponentProps<unknown>;
type ImplicitContainerComponentPropKeys = keyof ImplicitContainerComponentProps;

type ConstrainComponentFromController<C extends AnyVueComponent, Controller> =
	Controller extends FieldController<string, infer State, infer Extra> ? ConstrainComponentToProvidedProps<C, ImplicitFieldComponentProps<State> & Extra> : never;

type ExtractExtraPropsFromComponent<C extends AnyVueComponent, ImplicitKeys extends PropertyKey = ImplicitComponentPropKeys> = Omit<PublicPropsOf<C>, ImplicitKeys>;
type ExtractExtraPropsFromController<Controller> = Controller extends FieldController<string, any, infer Extra> ? Extra : never;
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

type NewFieldNodeFnConfig<C extends AnyVueComponent, Controller extends AnyFieldController> = DistributiveOmit<
	ExtractExtraPropsFromController<Controller> & ExtractExtraPropsFromComponent<C> & BaseFieldNode,
	ForbiddenConfigKeys
>;
type NewFieldNodeFnReturn<C extends AnyVueComponent, Config extends NewFieldNodeFnConfig<C, AnyFieldController>> = RealFieldNode<ExtractExtraPropsFromConfig<Config>, C>;
type NewFieldNodeFnArgs<C extends AnyVueComponent, Controller extends AnyFieldController, Config extends NewFieldNodeFnConfig<C, Controller>> = [
	id: string,
	controller: Controller,
	component: ConstrainComponentFromController<C, Controller>,
	config: NoExtraProperties<NewFieldNodeFnConfig<C, Controller>, Config>,
];
interface NewFieldNodeFn {
	<Controller extends AnyFieldController, C extends AnyVueComponent, Config extends NewFieldNodeFnConfig<C, Controller>>(
		...args: NewFieldNodeFnArgs<C, Controller, Config>
	): NewFieldNodeFnReturn<C, Config>;
}

// new field is a terminal operation - returning the field.
interface NewFieldNode {
	newField: NewFieldNodeFn;
}

// View
// ==========================================================================================================================

type NewViewNodeFnConfig<C extends AnyVueComponent> = Omit<ExtractExtraPropsFromComponent<C> & BaseViewNode, ForbiddenConfigKeys>;
type NewViewNodeFnReturn<C extends AnyVueComponent, Config extends NewViewNodeFnConfig<C>> = RealViewNode<ExtractExtraPropsFromConfig<Config>, C>;
type NewViewNodeFnArgs<C extends AnyVueComponent, Config extends NewViewNodeFnConfig<C>> = [
	id: string,
	component: ConstrainComponentToProvidedProps<C, ImplicitFieldComponentProps<never> & ExtractExtraPropsFromConfig<Config>>,
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

function toRefsWithout<T extends object>(value: T, ...omittedKeys: readonly (keyof T)[]): Omit<ToRefs<T>, (typeof omittedKeys)[number]> {
	const refs = toRefs(value);
	for (const key of omittedKeys) delete refs[key];
	return refs;
}

export class FormBuilder implements NewContainerNode, NewFormNode, NewFieldNode, NewViewNode {
	public constructor(public context: FormRuntimeContext) {}

	private nodeMap = reactive<Record<string, AnyBaseFormNode>>({});
	private root = ref<BaseContainerNode | BaseFormNode | null>(null);

	public getRoot(): FormContainerLikeNode {
		const containers = Object.values(this.nodeMap).filter(isContainerNode);
		const childIds = new Set(containers.flatMap(node => node.children.map(child => child.id)));
		const graphRoots = containers.filter(node => !childIds.has(node.id));
		const root = graphRoots[0] ?? this.root.value;
		if (!root) throw new Error('Root node is not set');
		return root as FormContainerLikeNode;
	}

	public state = createFormState();

	protected renderableNode(node: FormNode, parentNode: FormNode | null): any {
		const idSuffix = useUid();
		const fieldRuntimeProps = {
			disabled: computed(() => {
				if (node.kind !== 'field') return false;
				const affects = node.controller.affectsBlackLabParameters;
				const values = typeof affects === 'function' ? affects(node, this.context) : affects;

				if (!values.length) return false;
				return values.some(param => this.state.rawOverrides.value[param] !== undefined);
			}),

			htmlId: computed(() => `${node.id}_${idSuffix}`),
		} satisfies Record<string, Ref<any>>;

		const containerRuntimeProps = {
			hideTitle: computed(() => isContainerNode(parentNode) && (parentNode.variant === 'tabs' || parentNode.variant === 'small-tabs')),
		} satisfies Record<string, Ref<any>>;

		if (node.kind === 'container' || node.kind === 'form') {
			return {
				is: markRaw(node.component ?? ContainerRenderer),
				// this is a bit of a hack - to avoid losing reactivty,
				// map every individual property to a ref - then remove some that shouldn't be passed to the component
				// then map the refs back to a reactive object
				// basically memoize the props object, while removing and adding some properties
				props: reactive({
					...toRefsWithout(node, 'component'),
					...containerRuntimeProps,

					children: computed(() => node.children.map(child => this.renderableNode(child, node))),
				}),
			};
		} else if (node.kind === 'field') {
			return {
				is: markRaw(node.component),
				props: reactive({
					...toRefsWithout(node, 'kind', 'component', 'controller'),
					...fieldRuntimeProps,
					...this.state.getVModel(node.id),
				}),
			};
		} else if (node.kind === 'view') {
			return {
				is: markRaw(node.component),
				props: reactive({
					...toRefsWithout(node, 'kind', 'component'),
				}),
			};
		}

		return node;
	}

	public renderableGraph(): { is: AnyVueComponent; props: Record<string, unknown> } | undefined;
	public renderableGraph(rootId: string): { is: AnyVueComponent; props: Record<string, unknown> } | undefined;
	public renderableGraph(rootId?: string): { is: AnyVueComponent; props: Record<string, unknown> } | undefined {
		const root = rootId ? this.nodeMap[rootId] : this.getRoot();
		if (!root) return;

		return this.renderableNode(root as FormNode, null);
	}

	public hasNode(id: string): boolean {
		return !!this.nodeMap[id];
	}

	private addNode<T extends AnyBaseFormNode>(node: T): T {
		if (!this.nodeMap[node.id]) {
			this.nodeMap[node.id] = node;
			// A builder may create reusable fields/containers before its first form.
			// Keep the first container as a provisional root, but let the first form
			// take over once it is created.
			if (isContainerNode(node) && !this.root.value) this.root.value = node;
			if (node.kind === 'form' && (!this.root.value || this.root.value.kind === 'container')) this.root.value = node;
			if (isFieldNode(node)) this.state.addNodeToState(node);
		} else if (toRaw(this.nodeMap[node.id]) !== node) {
			throw new Error(`Node with id ${node.id} already exists in this form builder`);
		}
		return node;
	}

	private addChildToNode<T extends AnyBaseFormNode & { children: AnyRealFormNode[] }>(node: T, ...children: Array<AnyRealFormNode | null | undefined>): T {
		for (const child of children) {
			if (!child) continue;
			const wasEmpty = node.children.length === 0;
			node.children.push(this.addNode(child));
			if (wasEmpty && isContainerNode(node)) this.state.activateDefaultChild(node.id, child.id);
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
			component: markRaw(component as any) as C,
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
			component: markRaw(component as any) as C,
			addChildren: (...children: Array<AnyRealFormNode | null | undefined>) => this.addChildToNode(node, ...children),
		};
		return this.addNode(node);
	};

	newField: NewFieldNodeFn = (id, controller, component, config) => {
		return this.addNode({
			...config,
			component: markRaw(component as any),
			controller,
			kind: 'field' as const,
			id,
		}) as any;
	};

	newView: NewViewNodeFn = (id, component, config) => {
		return this.addNode({
			...config,
			component: markRaw(component as any),
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

	// dirty dirty
	public nodeList = computed(() => Object.values(this.nodeMap));
	public containerList = computed(() => Object.values(this.nodeMap).filter(isContainerNode));
	public formsList = computed(() => this.containerList.value.filter(n => n.kind === 'form'));
	public formsMap = computed(() => this.formsList.value.reduce<Record<string, FormBoundaryNode>>((acc, f) => ((acc[f.id] = f), acc), {}));
	private submitListeners: ((formId: string, submitted: CompiledFormStateWithSummaries) => void)[] = [];
	private resetListeners: (() => void)[] = [];

	public compile(formId: string) {
		return compileFormNode(this.nodeMap[formId] as FormNode, this.state.getReactiveState(), this.context);
	}
	public submit(formId: string) {
		const compiled = this.compile(formId);
		this.submitListeners.forEach(callback => callback(formId, compiled));
		return compiled;
	}

	public reset() {
		this.state.replaceState(createDefaultFormState(this.context, ...(this.nodeList.value as FormNode[])));
		this.resetListeners.forEach(callback => callback());
	}

	public clearRawOverride(parameter: BlackLabParameter) {
		delete this.state.rawOverrides.value[parameter];
	}

	onSubmit(callback: (formId: string, submitted: CompiledFormStateWithSummaries) => void) {
		this.submitListeners.push(callback);
		return () => {
			const index = this.submitListeners.indexOf(callback);
			if (index >= 0) this.submitListeners.splice(index, 1);
		};
	}
	onReset(callback: () => void) {
		this.resetListeners.push(callback);
		return () => {
			const index = this.resetListeners.indexOf(callback);
			if (index >= 0) this.resetListeners.splice(index, 1);
		};
	}

	shutdown() {
		this.submitListeners.length = 0;
		this.resetListeners.length = 0;
	}
}
