import { markRaw } from 'vue';

import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { applyRawOverrides, compileFormNode, compileFormSummary } from '@/features/form/model/persistence';
import createFormState, { createDefaultFormState, type NewFormState } from '@/features/form/model/state';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
import type { RenderableFormNode } from '@/features/form/ui/renderable-graph';
import { renderFormNode } from '@/features/form/ui/renderable-graph';

/**
 * A reactive form session for one static definition.
 *
 * The definition has no Vue state. All mutable state used by mounted components
 * lives here, so the runtime should only be replaced when structural definition
 * inputs change. Restoration produces immutable snapshots that are cloned during
 * hydration. Finish all builder/customization edits before constructing a
 * runtime; structural mutation afterward is unsupported.
 */
export class FormRuntime {
	public readonly state;

	public constructor(
		public readonly definition: FormBuilder,
		initialState: NewFormState = createDefaultFormState(definition.context, ...definition.nodeList),
	) {
		this.state = createFormState(initialState);
		markRaw(this);
	}

	public renderableGraph(rootId?: string): RenderableFormNode | undefined {
		const root = rootId ? this.definition.getNode(rootId) : this.definition.getRoot();
		return root ? renderFormNode(root, { state: this.state }) : undefined;
	}

	public compile(formId: string): CompiledFormResult {
		const form = this.definition.getForm(formId);
		if (!form) throw new Error(`Cannot compile unknown form '${formId}'.`);
		const state = this.state.getReactiveState();
		return applyRawOverrides(compileFormNode(form, state, this.definition.context), state.rawOverrides, form.target.acceptedOutputs);
	}

	public compileSummary(formId: string): CompiledFormSummary {
		const form = this.definition.getForm(formId);
		if (!form) throw new Error(`Cannot compile summary for unknown form '${formId}'.`);
		const state = this.state.getReactiveState();
		return applyRawOverrides(compileFormSummary(form, state, this.definition.context), state.rawOverrides, form.target.acceptedOutputs);
	}

	public reset() {
		this.state.replaceState(createDefaultFormState(this.definition.context, ...this.definition.nodeList));
	}

	public clearRawOverride(parameter: string) {
		delete this.state.rawOverrides.value[parameter];
	}
}
