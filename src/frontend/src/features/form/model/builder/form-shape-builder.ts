import { markRaw } from 'vue';

import { checkNoLoops, generateSchemaVersion } from '@/features/form/model/form-utils';
import type { FieldController, ViewDefinition } from '@/features/form/model/types/form-controllers';
import type { FormContainerNode, FormNode, FormBoundaryNode, FormChildNode, FormFieldNode, FormViewNode, NodeKind, NodeKindMap } from '@/features/form/model/types/form-shape';
import type { FormSystemDefinition } from '@/features/form/model/types/form-state';

export type FormRegistrationCallback = (api: FormBuilder) => FormContainerNode | void;

export type AnyFieldController = FieldController<string, any, any>;
export type AnyViewDefinition = ViewDefinition<string, any>;
export type ControllerRegistryMap = Partial<Record<string, AnyFieldController>>;
export type ViewRegistryMap = Partial<Record<string, AnyViewDefinition>>;
export type WithRegisteredController<C extends ControllerRegistryMap, Controller extends AnyFieldController> = Omit<C, Controller['kind']> & Record<Controller['kind'], Controller>;
export type WithRegisteredView<V extends ViewRegistryMap, View extends AnyViewDefinition> = Omit<V, View['kind']> & Record<View['kind'], View>;

export class ControllerRegistry<C extends ControllerRegistryMap = {}, V extends ViewRegistryMap = {}> {
	controllers: C = markRaw({} as C);
	views: V = markRaw({} as V);

	public registerController<Controller extends AnyFieldController>(controller: Controller): asserts this is ControllerRegistry<WithRegisteredController<C, Controller>, V> {
		// @ts-ignore
		if (this.controllers[controller.kind]) throw new Error(`Controller with kind ${controller.kind} is already registered`);
		// @ts-ignore
		this.controllers[controller.kind] = markRaw(controller);
	}

	public registerView<View extends AnyViewDefinition>(view: View): asserts this is ControllerRegistry<C, WithRegisteredView<V, View>> {
		// @ts-ignore
		if (this.views[view.kind]) throw new Error(`View with kind ${view.kind} is already registered`);
		// @ts-ignore
		this.views[view.kind] = markRaw(view);
	}
	public getController<Kind extends keyof C>(kind: Kind): C[Kind] {
		const controller = this.controllers[kind];
		if (!controller) throw new Error(`Controller with kind ${String(kind)} is not registered`);
		return controller as C[Kind];
	}
	public getView<Kind extends keyof V>(kind: Kind): V[Kind] {
		const view = this.views[kind];
		if (!view) throw new Error(`View with kind ${String(kind)} is not registered`);
		return view as V[Kind];
	}
}

export type FormContainerNodeBuilder = FormContainerNode & {
	builder: FormBuilder;
	newContainer: (...args: Parameters<FormBuilder['newContainer']>) => FormContainerNodeBuilder;
	newForm: (...args: Parameters<FormBuilder['newForm']>) => FormContainerNodeBuilder;
	newField: (...args: Parameters<FormBuilder['newField']>) => FormContainerNodeBuilder;
	newView: (...args: Parameters<FormBuilder['newView']>) => FormContainerNodeBuilder;
	addChildren: (...children: FormNode[]) => FormContainerNodeBuilder;
};
export type FormBoundaryNodeBuilder = FormBoundaryNode & {
	builder: FormBuilder;
	addField: (...args: Parameters<FormBuilder['newField']>) => FormBoundaryNodeBuilder;
	addView: (...args: Parameters<FormBuilder['newView']>) => FormBoundaryNodeBuilder;
	addChildren: (...children: FormChildNode[]) => FormBoundaryNodeBuilder;
};

export class FormBuilder {
	private nodeMap: Record<string, FormNode> = {};

	private root: FormContainerNode | FormBoundaryNode | null = null;

	constructor(public readonly controllerRegistry: ControllerRegistry) {}

	newContainer(id: string, options?: Partial<Omit<FormContainerNode, 'id' | 'kind' | 'children'>>) {
		if (this.nodeMap[id]) throw new Error(`Node with id ${id} already exists`);

		const node: FormContainerNodeBuilder = {
			...options,
			builder: this,
			id,
			kind: 'container',
			children: [],
			newContainer(...args: Parameters<FormBuilder['newContainer']>) {
				node.children.push(this.builder.newContainer(...args));
				return this;
			},
			newForm(...args: Parameters<FormBuilder['newForm']>) {
				this.children.push(this.builder.newForm(...args));
				return this;
			},
			newField(...args: Parameters<FormBuilder['newField']>) {
				node.children.push(this.builder.newField(...args));
				return this;
			},
			newView(...args: Parameters<FormBuilder['newView']>) {
				node.children.push(this.builder.newView(...args));
				return this;
			},
			addChildren(...children: FormNode[]) {
				for (const child of children) {
					if (!this.builder.nodeMap[child.id]) {
						throw new Error(`Node with id ${child.id} does not belong to this form builder`);
					}
				}
				node.children.push(...children);
				return this;
			},
		};
		if (!this.root) this.root = node;
		return (this.nodeMap[id] = node as any);
	}
	newForm(id: string, options?: Partial<Omit<FormBoundaryNode, 'id' | 'kind' | 'children'>>): FormBoundaryNodeBuilder {
		if (this.nodeMap[id]) throw new Error(`Node with id ${id} already exists`);
		const node: FormBoundaryNodeBuilder = {
			...options,
			builder: this,
			id,
			kind: 'form',
			children: [],
			addField(...args: Parameters<FormBuilder['newField']>) {
				node.children.push(this.builder.newField(...args));
				return this;
			},
			addView(...args: Parameters<FormBuilder['newView']>) {
				node.children.push(this.builder.newView(...args));
				return this;
			},
			addChildren(...children: FormChildNode[]) {
				for (const child of children) {
					if (!this.builder.nodeMap[child.id]) {
						throw new Error(`Node with id ${child.id} does not belong to this form builder`);
					}
				}
				node.children.push(...children);
				return this;
			},
		};
		if (!this.root) this.root = node;
		return (this.nodeMap[id] = node as any);
	}
	newField<Config>(
		id: string,
		controller: FieldController<string, any, Config>,
		config: Config,
		options?: Partial<Omit<FormFieldNode<Config>, 'id' | 'kind' | 'controller' | 'config'>>,
	): FormFieldNode<Config> {
		if (this.nodeMap[id]) throw new Error(`Node with id ${id} already exists`);
		const node: FormFieldNode<Config> = {
			...options,
			id,
			kind: 'field',
			controller,
			config,
		} as FormFieldNode<Config>;
		return (this.nodeMap[id] = node as any);
	}
	newView<Config>(id: string, view: ViewDefinition<string, Config>, config?: Config, options?: Partial<Omit<FormViewNode<Config>, 'id' | 'view' | 'config'>>): FormViewNode<Config> {
		if (this.nodeMap[id]) throw new Error(`Node with id ${id} already exists`);
		const node: FormViewNode<Config> = {
			...options,
			id,
			kind: 'view',
			view,
			config,
		} as FormViewNode<Config>;
		return (this.nodeMap[id] = node as any);
	}

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
