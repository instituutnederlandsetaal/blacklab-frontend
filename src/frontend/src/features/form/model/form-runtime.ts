import { markRaw } from 'vue';

import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { compileFormNode } from '@/features/form/model/persistence';
import createFormState, { createDefaultFormState, type FormStateInput } from '@/features/form/model/state';
import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';
import type { RenderableFormNode } from '@/features/form/ui/renderable-graph';
import { renderFormNode } from '@/features/form/ui/renderable-graph';

/**
 * A reactive form session for one static definition.
 *
 * The definition has no Vue state. All mutable state used by mounted components
 * lives here, so the runtime should only be replaced when structural definition
 * inputs change. Restoration produces immutable snapshots that are cloned during
 * hydration.
 */
export class FormRuntime {
	public readonly state;

	public constructor(
		public readonly definition: FormBuilder,
		initialState: FormStateInput = createDefaultFormState(definition.context, ...definition.nodeList),
	) {
		this.state = createFormState(initialState);
		markRaw(this);
	}

	public renderableGraph(rootId?: string): RenderableFormNode | undefined {
		const root = rootId ? this.definition.getNode(rootId) : this.definition.getRoot();
		return root ? renderFormNode(root, { state: this.state }) : undefined;
	}

	public compile(formId: string) {
		const form = this.definition.getNode(formId);
		if (!form) throw new Error(`Cannot compile unknown form '${formId}'.`);
		return compileFormNode(form, this.state.getReactiveState(), this.definition.context);
	}

	public reset() {
		this.state.replaceState(createDefaultFormState(this.definition.context, ...this.definition.nodeList));
	}

	public clearRawOverride(parameter: BlackLabParameter) {
		delete this.state.rawOverrides.value[parameter];
	}
}
