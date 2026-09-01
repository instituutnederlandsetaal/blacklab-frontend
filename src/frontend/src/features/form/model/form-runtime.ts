import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { compileFormNode, compileFormSummary } from '@/features/form/model/compile';
import createFormState, { createDefaultFormState } from '@/features/form/model/state';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
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

	public constructor(public readonly definition: FormBuilder) {
		this.state = createFormState(createDefaultFormState(definition.context, ...definition.nodeList));
	}

	public renderableGraph() {
		return renderFormNode(this.definition.getRoot(), { state: this.state });
	}

	public compile(formId: string): CompiledFormResult {
		const form = this.definition.getForm(formId);
		if (!form) throw new Error(`Cannot compile unknown form '${formId}'.`);
		const state = this.state.getReactiveState();
		return compileFormNode(form, state, this.definition.context, state.rawOverrides);
	}

	public compileSummary(formId: string): CompiledFormSummary {
		const form = this.definition.getForm(formId);
		if (!form) throw new Error(`Cannot compile summary for unknown form '${formId}'.`);
		const state = this.state.getReactiveState();
		return compileFormSummary(form, state, this.definition.context, state.rawOverrides);
	}

	public reset() {
		this.state.replaceState(createDefaultFormState(this.definition.context, ...this.definition.nodeList));
	}

	public clearRawOverride(parameter: string) {
		delete this.state.rawOverrides.value[parameter as keyof typeof this.state.rawOverrides.value];
	}
}
