import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';
import type { QueryFragment } from '@/features/form/model/types/form-query';
import type { BaseFieldNode } from '@/features/form/model/types/form-shape';
import type { AnyFieldDefinition, FieldNodeProps, FieldState } from '@/features/form/model/field-component-props';

import type { Translate } from '@/shared/i18n';

export type FormRuntimeCorpus = {
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
export type RestoreFieldResult<State> =
	| State
	| {
			state: State;
			warnings?: string[];
			errors?: string[];
	  };

export type FieldController<Kind extends string = string, State = any, Extra = object> = {
	/** Unique key for this controller. */
	kind: Kind;
	createDefaultState: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => State;
	getQueryContribution: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext, state: State) => QueryFragment;
	/** Short stable key used under the scoped f.* URL namespace. Must be unique within the active form. */
	getPersistKey: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => string;
	restore: (payload: EncodedFieldValue, config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => RestoreFieldResult<State>;
	encode: (state: State, config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => EncodedFieldValue | null | undefined;
	/** BlackLab query parameters this field may affect. Used for locking controls while raw overrides are active. */
	affectsBlackLabParameters: BlackLabParameter[] | ((config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => BlackLabParameter[]);
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
