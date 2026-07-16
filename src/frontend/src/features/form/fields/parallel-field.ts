import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

import type { Translate } from '@/shared/i18n';
import { optionValue, type Option, type SimpleOption } from '@/shared/utils/options';

export type ParallelFieldState = {
	source: string | null;
	targets: string[];
	alignBy: string | null;
	childStates: Record<string, unknown>;
};

export type ParallelAnnotatedField = Parameters<Translate['$tAnnotatedFieldDisplayName']>[0];
export type ParallelFieldExtraProps = {
	fieldOptions: ParallelAnnotatedField[];
	alignByOptions?: Array<SimpleOption | Option>;
	defaultSource?: string | null;
	/** Applied even when alignByOptions is empty, allowing a fixed relation type without rendering a picker. */
	defaultAlignBy?: string | null;

	/** Complete child field definition rendered once for each active version. */
	childFieldTemplate: FormFieldNode;

	errorNoParallelSourceVersion?: boolean;
};
export type ParallelFieldDefinition = FieldDefinition<ParallelFieldState, ParallelFieldExtraProps>;

export type ParallelFieldConfig = ParallelFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `ParallelFieldDefinition['componentProps']`. */
export type ParallelFieldComponentProps = FieldComponentProps<ParallelFieldState> & ParallelFieldExtraProps;

export function createDefaultParallelFieldState(config: ParallelFieldConfig, runtime: FormRuntimeContext): ParallelFieldState {
	const source = config.defaultSource ?? null;

	return {
		source,
		targets: [],
		alignBy: config.defaultAlignBy ?? (config.alignByOptions?.[0] ? optionValue(config.alignByOptions[0]) : null),
		childStates: source != null ? { [source]: createDefaultParallelChildState(config, runtime) } : {},
	};
}

export function createDefaultParallelChildState(config: ParallelFieldConfig, runtime: FormRuntimeContext): unknown {
	return config.childFieldTemplate.controller.createDefaultState(config.childFieldTemplate, runtime);
}
