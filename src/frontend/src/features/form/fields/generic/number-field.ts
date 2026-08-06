import type { NamedFieldComponentProps } from '@/features/form/model/field-component-props';

type NumberFieldState = number;
type NumberFieldExtraProps = {
	min?: number;
	max?: number;
	/** Positive interval used to normalize entered values. Defaults to an integer step. */
	step?: number;
};

/** Materialized for Vue's runtime prop extraction; equivalent to `NumberFieldDefinition['componentProps']`. */
export type NumberFieldComponentProps = NamedFieldComponentProps<NumberFieldState> & NumberFieldExtraProps;
