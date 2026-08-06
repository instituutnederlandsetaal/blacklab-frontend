import type { NamedFieldComponentProps, NamedFieldDefinition } from '@/features/form/model/field-component-props';

import type { Option } from '@/shared/utils/options';

export type RadioFieldState = string;
type RadioFieldExtraProps = {
	options: Option[];
};
export type RadioFieldDefinition = NamedFieldDefinition<RadioFieldState, RadioFieldExtraProps>;

export const createDefaultRadioFieldState = (): RadioFieldState => '';
/** Materialized for Vue's runtime prop extraction; equivalent to `RadioFieldDefinition['componentProps']`. */
export type RadioFieldComponentProps = NamedFieldComponentProps<RadioFieldState> & RadioFieldExtraProps;
