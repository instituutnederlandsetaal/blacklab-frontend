import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { AnyVueComponent } from '@/types/helpers';

import type { Translate } from '@/shared/i18n';
import type { Option, SimpleOption } from '@/shared/utils/options';

export type ParallelFieldState<ChildState = unknown> = {
	source: string | null;
	targets: string[];
	alignBy: string | null;
	sourceState: ChildState;
	targetStates: Record<string, ChildState>;
};

export type ParallelChildFieldConfig = {
	id: string;
	controller: FieldController<string, any, any>;
	component: AnyVueComponent;
	config: object;
};

export type ParallelAnnotatedField = Parameters<Translate['$tAnnotatedFieldDisplayName']>[0];
export type ParallelFieldExtraProps = {
	fieldOptions: ParallelAnnotatedField[];
	alignByOptions?: Array<SimpleOption | Option>;
	defaultSource?: string | null;
	/** Applied even when alignByOptions is empty, allowing a fixed relation type without rendering a picker. */
	defaultAlignBy?: string | null;
	child: ParallelChildFieldConfig;
	errorNoParallelSourceVersion?: boolean;
};
export type ParallelFieldDefinition = FieldDefinition<ParallelFieldState, ParallelFieldExtraProps>;

export type ParallelFieldConfig = ParallelFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `ParallelFieldDefinition['componentProps']`. */
export type ParallelFieldComponentProps = FieldComponentProps<ParallelFieldState> & ParallelFieldExtraProps;
