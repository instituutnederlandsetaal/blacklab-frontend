import type { PersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import type { AnyFieldDefinition, FieldNodeProps, FieldState } from '@/features/form/model/field-component-props';
import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';
import type { QueryIR } from '@/features/form/model/types/form-query-ir';
import type { BaseFieldNode } from '@/features/form/model/types/form-shape';

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
	getQueryContribution: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext, state: State) => QueryIR | null;
	persistence: FieldPersistence<State, Extra>;
	/**
	 * BlackLab query parameters this field may affect.
	 * Used to make UI readonly/disabled while the parameter is in an overridden state (I.e. could not be parsed into the form successfully and has been preserved in its raw state).
	 * Also used as a category catalog for the query summary entries.
	 */
	affectsBlackLabParameters: BlackLabParameter[];
};

export type AnyFieldController = FieldController<string, any, any>;

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

export function getFieldPersistKey(field: { controller: AnyFieldController } & BaseFieldNode, runtime: FormRuntimeContext): string {
	return field.controller.persistence.key(field, runtime);
}

export function encodeControllerState<State, Extra>(controller: FieldController<string, State, Extra>, state: State, config: FieldControllerProps<Extra>, runtime: FormRuntimeContext): string | null {
	return controller.persistence.codec.encode(state, { config, runtime });
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
	return encodeControllerState(field.controller, state, field, runtime);
}

export function restoreFieldState(field: { controller: AnyFieldController } & BaseFieldNode, payload: EncodedFieldValue, runtime: FormRuntimeContext): unknown {
	return restoreControllerState(field.controller, payload, field, runtime);
}
