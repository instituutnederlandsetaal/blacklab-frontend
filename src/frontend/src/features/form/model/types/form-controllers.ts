import type { PersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import type { AnyFieldDefinition, FieldNodeProps, FieldState } from '@/features/form/model/field-component-props';
import type { Emit, FormOutputName, FormOutputValues, ResultPreset, SummaryEntry } from '@/features/form/model/types/form-output';
import type { BaseFieldNode, FormFieldNode } from '@/features/form/model/types/form-shape';

import type { Translate } from '@/shared/i18n';

type FormRuntimeCorpus = {
	readonly indexId?: string;
	readonly isParallelCorpus?: boolean;
	readonly textDirection?: 'ltr' | 'rtl';
};

export type FormRuntimeContext = {
	readonly corpus: FormRuntimeCorpus;
	readonly translate: Translate;
};

export type FieldControllerProps<Extra> = BaseFieldNode & Extra;
export type EncodedFieldValue = string | string[];

export type FieldPersistenceContext<Extra> = {
	readonly config: FieldControllerProps<Extra>;
	readonly runtime: FormRuntimeContext;
};

type FieldPersistence<State, Extra> = {
	/** Short stable key used under the scoped f.* URL namespace. Must be unique within the active form. */
	key: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => string;
	codec: PersistenceCodec<State, FieldPersistenceContext<Extra>>;
};

export type FieldController<Kind extends string = string, State = any, Extra = object> = {
	/** Unique key for this controller. */
	kind: Kind;
	createDefaultState: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => State;
	collect: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext, state: State, sink: Emit) => void;
	summarize?: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext, state: State, emit: (summary: SummaryEntry) => void) => void;
	getResultPreset?: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext, state: State) => ResultPreset | undefined;
	persistence: FieldPersistence<State, Extra>;
	/** Semantic outputs this field may emit. */
	outputs: readonly FormOutputName[];
};

export type AnyFieldController = FieldController<string, any, any>;

/** Collect the sole output accepted by a compound controller. */
export function gatherOutput<Name extends FormOutputName>(
	field: FormFieldNode,
	state: unknown,
	runtime: FormRuntimeContext,
	name: Name,
	isValue: (value: unknown) => value is FormOutputValues[Name],
): FormOutputValues[Name][] {
	const values: FormOutputValues[Name][] = [];
	const sink = (output: unknown, value: unknown): void => {
		if (output !== name) throw new Error(`Unexpected '${String(output)}' output from embedded field '${field.id}'.`);
		if (!isValue(value)) throw new Error(`Malformed '${name}' output from embedded field '${field.id}'.`);
		values.push(value);
	};
	field.controller.collect(field, runtime, state, sink);
	return values;
}

/** Controller config derived from a field contract, plus controller-only node props. */
export type FieldControllerConfig<Definition extends AnyFieldDefinition, Extra extends object = object> = FieldNodeProps<Definition> & Extra;

/** A controller whose state and field props come from one field contract. */
export type FieldControllerFor<Kind extends string, Definition extends AnyFieldDefinition, Extra extends object = object> = FieldController<
	Kind,
	FieldState<Definition>,
	FieldControllerConfig<Definition, Extra>
>;

/** Define a controller against a field contract instead of repeating its state and node props. */
export function defineFieldController<Kind extends string, Definition extends AnyFieldDefinition, Extra extends object = object>(
	definition: FieldControllerFor<Kind, Definition, Extra>,
): FieldControllerFor<Kind, Definition, Extra> {
	return definition;
}

/** Resolve a field's persistence key with the field itself as controller configuration. */
export function getFieldPersistKey(field: { controller: AnyFieldController } & BaseFieldNode, runtime: FormRuntimeContext): string {
	return field.controller.persistence.key(field, runtime);
}

export function restoreControllerState<State, Extra>(
	controller: FieldController<string, State, Extra>,
	payload: EncodedFieldValue,
	config: FieldControllerProps<Extra>,
	runtime: FormRuntimeContext,
): State {
	if (Array.isArray(payload)) throw new Error(`Cannot restore field persistence from multiple URL values.`);
	return controller.persistence.codec.decode(payload, { config, runtime });
}

export function encodeFieldState(field: { controller: AnyFieldController } & BaseFieldNode, state: unknown, runtime: FormRuntimeContext): string | null {
	return field.controller.persistence.codec.encode(state, { config: field, runtime });
}

/** Restore nested field state with the field itself as controller configuration. */
export function restoreFieldState(field: { controller: AnyFieldController } & BaseFieldNode, payload: EncodedFieldValue, runtime: FormRuntimeContext): unknown {
	return restoreControllerState(field.controller, payload, field, runtime);
}
