import { checkNoLoops, generateSchemaVersion } from '@/features/form/model/form-utils';
import type { AnyFieldController, FieldController, FormSystemDefinition } from '@/features/form/model/types';
import type {
	AnyRealFormNode,
	BaseContainerNode,
	BaseFieldNode,
	BaseFormNode,
	BaseViewNode,
	ImplicitContainerComponentProps,
	ImplicitFieldComponentProps,
	NodeKind,
	NodeKindMap,
	RealContainerNode,
	RealFieldNode,
	RealFormNode,
	RealViewNode,
} from '@/features/form/model/types/form-shape';
import type { AnyVueComponent, ConstrainComponentToProvidedProps, DistributiveOmit, NoExtraProperties, PublicPropsOf } from '@/types/helpers';

// Tests
// ==========================================================================================================================

// const newContainerNode: NewContainerNodeFn = (id, component, config) => {
// 	return {} as any;
// };

// const TestContainerComponent = defineComponent({
// 	props: {
// 		foo: { type: String, required: true },
// 		// variant: { type: String, required: false },
// 		optional: { type: Array, required: false },
// 		required: { type: String, required: true },
// 	},
// });

// const testContainerNode = newContainerNode('test-node', TestContainerComponent, {
// 	variant: 'list',
// 	foo: 'bar',
// 	required: 'string',
// });

// const newFormNode: NewFormNodeFn = (id, component, config) => {
// 	return {} as any;
// };

// const TestFormComponent = defineComponent({
// 	props: {
// 		foo: { type: String, required: true },
// 		id: { type: String, required: true },
// 		required: { type: String, required: true },
// 		optional: { type: String, required: false },
// 	},
// });

// const testFormNode = newFormNode('test-form-node', TestFormComponent, {
// 	foo: 'bar',
// 	required: 'true',
// 	resultPreset: {
// 		viewedResults: 'list',
// 	},
// 	// htmlId: 'forbidden',
// });

// const testController: FieldController<string, any, { foo: string; test: any[] }> = {
// 	kind: 'test',
// 	createDefaultState: (node, runtime) => {
// 		return 'default';
// 	},
// 	toJSON() {
// 		return { foo: 'string', test: [] };
// 	},
// };

// const TestComponent = defineComponent({
// 	props: {
// 		foo: { type: String, required: true },
// 		test: { type: Array, required: true },
// 		id: { type: String, required: true },
// 	},
// });

// const newFieldNode: NewFieldNodeFn = (id, controller, component, config) => {
// 	return {} as any;
// };

// const testNode = newFieldNode('test-node', testController, TestComponent, {
// 	foo: 'string',
// 	variant: 'list',
// 	test: [],
// });

// const TestViewComponent = defineComponent({
// 	props: {
// 		foo: { type: String, required: true },
// 		id: { type: String, required: true },
// 	},
// });

// const newViewNode: NewViewNodeFn = (id, component, config) => {
// 	return {} as any;
// };

// const TestViewNodeConfig: NewViewNodeFnConfig<typeof TestViewComponent> = {
// 	foo: 'string',
// 	// variant: 'list' as const,
// 	// htmlId: 'forbidden',
// 	extraneous: 'value',
// };

// const testViewNode = newViewNode('test-view-node', TestViewComponent, {
// 	modelValue: 'test',
// 	foo: 'bar',
// 	htmlId: 'forbidden',
// 	extraneous: 'value',
// });

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
type NewContainerNodeFnReturn<C extends AnyVueComponent, Config extends NewContainerNodeFnConfig<C>> = AddContainerNode &
	AddFormNode &
	AddViewNode &
	AddFieldNode &
	AddChildNodes &
	RealContainerNode<ExtractExtraPropsFromConfig<Config>, C>;
type NewContainerNodeFnArgs<C extends AnyVueComponent, Config extends NewContainerNodeFnConfig<C>> = [
	id: string,
	component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & ExtractExtraPropsFromConfig<Config>>,
	config: NoExtraProperties<NewContainerNodeFnConfig<C>, Config>,
];

interface NewContainerNodeFn {
	<C extends AnyVueComponent, Config extends NewContainerNodeFnConfig<C>>(...args: NewContainerNodeFnArgs<C, Config>): NewContainerNodeFnReturn<C, Config>;
}
interface AddContainerNodeFn extends NewContainerNodeFn {}
// new container is a terminal operation - returning the container.
interface NewContainerNode {
	newContainer: NewContainerNodeFn;
}
// adding a container is a terminal operation - returning the container for chaining.
interface AddContainerNode {
	addContainer: AddContainerNodeFn;
}

// Form
// ==========================================================================================================================

type NewFormNodeFnConfig<C extends AnyVueComponent> = Omit<ExtractExtraPropsFromComponent<C, ImplicitContainerComponentPropKeys> & BaseFormNode, ForbiddenConfigKeys>;
type NewFormNodeFnReturn<C extends AnyVueComponent, Config extends NewFormNodeFnConfig<C>> = AddContainerNode &
	AddFieldNode &
	AddViewNode &
	AddChildNodes &
	RealFormNode<ExtractExtraPropsFromConfig<Config>, C>;
type NewFormNodeFnArgs<C extends AnyVueComponent, Config extends NewFormNodeFnConfig<C>> = [
	id: string,
	component: ConstrainComponentToProvidedProps<C, ImplicitContainerComponentProps & ExtractExtraPropsFromConfig<Config>>,
	config: NoExtraProperties<NewFormNodeFnConfig<C>, Config>,
];

interface NewFormNodeFn {
	<C extends AnyVueComponent, Config extends NewFormNodeFnConfig<C>>(...args: NewFormNodeFnArgs<C, Config>): NewFormNodeFnReturn<C, Config>;
}
interface AddFormNodeFn extends NewFormNodeFn {}
// new form is a terminal operation - returning the form.
interface NewFormNode {
	newForm: NewFormNodeFn;
}
// adding a form is a terminal operation - returning the form for chaining
interface AddFormNode {
	addForm: AddFormNodeFn;
}

// Field
// ==========================================================================================================================

type NewFieldNodeFnConfig<C extends AnyVueComponent, Controller extends AnyFieldController> = DistributiveOmit<
	ExtractExtraPropsFromController<Controller> & ExtractExtraPropsFromComponent<C> & BaseFieldNode,
	ForbiddenConfigKeys
>;
type NewFieldNodeFnReturn<C extends AnyVueComponent, Controller extends AnyFieldController, Config extends NewFieldNodeFnConfig<C, Controller>> = RealFieldNode<ExtractExtraPropsFromConfig<Config>, C>;
type NewFieldNodeFnArgs<C extends AnyVueComponent, Controller extends AnyFieldController, Config extends NewFieldNodeFnConfig<C, Controller>> = [
	id: string,
	controller: Controller,
	component: ConstrainComponentFromController<C, Controller>,
	config: NoExtraProperties<NewFieldNodeFnConfig<C, Controller>, Config>,
];
interface NewFieldNodeFn {
	<Controller extends AnyFieldController, C extends AnyVueComponent, Config extends NewFieldNodeFnConfig<C, Controller>>(
		...args: NewFieldNodeFnArgs<C, Controller, Config>
	): NewFieldNodeFnReturn<C, Controller, Config>;
}

// new field is a terminal operation - returning the field.
interface NewFieldNode {
	newField: NewFieldNodeFn;
}

// adding a field is a chainable operation - returning this.
interface AddFieldNode {
	addField<Controller extends AnyFieldController, C extends AnyVueComponent, Config extends NewFieldNodeFnConfig<C, Controller>>(...args: NewFieldNodeFnArgs<C, Controller, Config>): this;
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
// Adding a view is a chainable operation - returning this.
interface AddViewNode {
	addView<C extends AnyVueComponent, Config extends NewViewNodeFnConfig<C>>(...args: NewViewNodeFnArgs<C, Config>): this;
}

// Children
// ==========================================================================================================================

interface AddChildNodes {
	addChildren(...children: Array<AnyRealFormNode | null | undefined>): this;
}

// Builder
// ==========================================================================================================================

export type FormRegistrationCallback = (api: FormBuilder) => RealContainerNode<unknown, AnyVueComponent> | RealFormNode<unknown, AnyVueComponent> | void;

export class FormBuilder implements NewContainerNode, NewFormNode, NewFieldNode, NewViewNode {
	private nodeMap: Record<string, AnyRealFormNode> = {};

	private root: RealContainerNode<unknown, any> | RealFormNode<unknown, any> | null = null;

	public hasNode(id: string): boolean {
		return !!this.nodeMap[id];
	}

	newContainer: NewContainerNodeFn = (id, component, config) => {
		const node = {
			...config,
			builder: this,
			kind: 'container',
			id,
			children: [] as any[],
			component: component as any,
			addContainer(id, component, config) {
				const childNode = this.builder.newContainer(id, component, config);
				this.children.push(childNode);
				return childNode;
			},
			addForm(id, component, config) {
				const childNode = this.builder.newForm(id, component, config);
				this.children.push(childNode);
				return childNode;
			},
			addView(id, component, config) {
				const childNode = this.builder.newView(id, component, config);
				this.children.push(childNode);
				return this;
			},
			addField(id, controller, component, config) {
				const childNode = this.builder.newField(id, controller, component, config);
				this.children.push(childNode);
				return this;
			},
			addChildren(...children: Array<AnyRealFormNode | null | undefined>) {
				for (const child of children) {
					if (!child) continue;
					if (this.builder.nodeMap[child.id] && this.builder.nodeMap[child.id] !== child) {
						throw new Error(`Node with id ${child.id} already exists in this form builder`);
					}
					this.builder.nodeMap[child.id] = child;
					this.children.push(child);
				}
				return this;
			},
		} satisfies NewContainerNodeFnReturn<AnyVueComponent, any> & { builder: FormBuilder };
		if (!this.root) this.root = node;
		this.nodeMap[id] = node;
		return node;
	};

	newForm: NewFormNodeFn = (id, component, config) => {
		if (this.nodeMap[id]) throw new Error(`Node with id ${id} already exists`);

		const node = {
			...config,
			builder: this,
			kind: 'form',
			id,
			component: component as any,
			children: [] as AnyRealFormNode[],
			addContainer(id, component, config) {
				const childNode = this.builder.newContainer(id, component, config);
				this.children.push(childNode);
				return childNode;
			},
			addView(id, component, config) {
				const childNode = this.builder.newView(id, component, config);
				this.children.push(childNode);
				return this;
			},
			addField(id, controller, component, config) {
				const childNode = this.builder.newField(id, controller, component, config);
				this.children.push(childNode);
				return this;
			},
			addChildren(...children: Array<AnyRealFormNode | null | undefined>) {
				for (const child of children) {
					if (!child) continue;
					if (this.builder.nodeMap[child.id] && this.builder.nodeMap[child.id] !== child) {
						throw new Error(`Node with id ${child.id} already exists in this form builder`);
					}
					this.builder.nodeMap[child.id] = child;
					this.children.push(child);
				}
				return this;
			},
		} satisfies NewFormNodeFnReturn<AnyVueComponent, {}> & { builder: FormBuilder };
		if (!this.root) this.root = node;
		this.nodeMap[id] = node;
		return node;
	};

	newField: NewFieldNodeFn = (id, controller, component, config) => {
		if (this.nodeMap[id]) throw new Error(`Node with id ${id} already exists`);
		const node = {
			...config,
			component: component as any,
			controller,
			kind: 'field' as const,
			id,
		} satisfies NewFieldNodeFnReturn<AnyVueComponent, AnyFieldController, {}>;
		this.nodeMap[id] = node;
		return node;
	};

	newView: NewViewNodeFn = (id, component, config) => {
		if (this.nodeMap[id]) throw new Error(`Node with id ${id} already exists`);
		const node = {
			...config,
			component: component as any,
			id,
			kind: 'view' as const,
		} satisfies NewViewNodeFnReturn<AnyVueComponent, {}>;
		this.nodeMap[id] = node;
		return node;
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

	build(): FormSystemDefinition {
		if (!this.root) throw new Error('Form must have at least one node');
		checkNoLoops(this.root);

		return {
			schemaVersion: generateSchemaVersion(this.root),
			root: this.root,
		};
	}
}
