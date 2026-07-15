import type { NamedFieldComponentProps, NamedFieldDefinition } from '@/features/form/model/field-component-props';

export type NumberFieldState = number;
export type NumberFieldExtraProps = {
	min?: number;
	max?: number;
	/** Positive interval used to normalize entered values. Defaults to an integer step. */
	step?: number;
};
export type NumberFieldDefinition = NamedFieldDefinition<NumberFieldState, NumberFieldExtraProps>;

export const createDefaultNumberFieldState = (): NumberFieldState => 0;
export type NumberFieldConfig = NumberFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `NumberFieldDefinition['componentProps']`. */
export type NumberFieldComponentProps = NamedFieldComponentProps<NumberFieldState> & NumberFieldExtraProps;
