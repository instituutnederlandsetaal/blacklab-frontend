import type { NamedFieldComponentProps, NamedFieldDefinition } from '@/features/form/model/field-component-props';

import type { Option } from '@/shared/utils/options';

export type CheckboxFieldState = string[];
export type CheckboxFieldExtraProps = {
	options: Option[];
};
export type CheckboxFieldDefinition = NamedFieldDefinition<CheckboxFieldState, CheckboxFieldExtraProps>;

export const createDefaultCheckboxFieldState = (): CheckboxFieldState => [];
export type CheckboxFieldConfig = CheckboxFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `CheckboxFieldDefinition['componentProps']`. */
export type CheckboxFieldComponentProps = NamedFieldComponentProps<CheckboxFieldState> & CheckboxFieldExtraProps;
