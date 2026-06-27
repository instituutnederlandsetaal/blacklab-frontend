import { markRaw } from 'vue';

import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';
import type { QueryFragment } from '@/features/form/model/types/form-query';
import type { BaseFieldNode } from '@/features/form/model/types/form-shape';

import type { Translate } from '@/shared/i18n';

export type FormRuntimeCorpus = {
	indexId?: string;
	textDirection?: 'ltr' | 'rtl';
};

export type FormRuntimeContext = {
	corpus: FormRuntimeCorpus;
	translate: Translate;
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

export type CreateFieldControllerInput<Kind extends string, State, Extra extends object> = FieldController<Kind, State, Extra>;

export function createFieldController<Kind extends string, State, Extra extends object>(definition: CreateFieldControllerInput<Kind, State, Extra>): FieldController<Kind, State, Extra> {
	return markRaw(definition);
}
