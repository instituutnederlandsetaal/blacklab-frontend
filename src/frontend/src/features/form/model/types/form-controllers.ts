import { markRaw } from 'vue';

import type { QueryContribution } from '@/features/form/model/types/form-query';
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
export type FieldController<Kind extends string = string, State = any, Extra = object> = {
	/** Unique key for this controller. */
	kind: Kind;
	createDefaultState: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => State;
	getQueryContribution?: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext, state: State) => QueryContribution;
	restore?: (payload: unknown, config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => State;
	encode?: (state: State, config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => unknown;
	validate?: (config: FieldControllerProps<Extra>, runtime: FormRuntimeContext) => string[];

	/** Required for form versioning - return something that uniquely identifies the configuration of this controller,
	 * so that when restoring from history we can check if the controller has changed in a non-compatible way. */
	toJSON(): any;
};
export type AnyFieldController = FieldController<string, any, any>;

export type CreateFieldControllerInput<Kind extends string, State, Extra extends object> = Omit<FieldController<Kind, State, Extra>, 'toJSON'> & {
	version?: number;
	configVersion?: number;
	toJSON?: () => any;
};

export function createFieldController<Kind extends string, State, Extra extends object>(definition: CreateFieldControllerInput<Kind, State, Extra>): FieldController<Kind, State, Extra> {
	const { configVersion = 1, toJSON, version = 1, ...controller } = definition;
	return markRaw({
		...controller,
		toJSON() {
			return toJSON?.() ?? { kind: controller.kind, version, configVersion };
		},
	});
}
