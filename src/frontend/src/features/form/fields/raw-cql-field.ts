import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';

export type RawCqlQueryFieldState = string;
export type RawCqlQueryFieldExtraProps = {
	hideLabel?: boolean;
};
export type RawCqlQueryFieldDefinition = FieldDefinition<RawCqlQueryFieldState, RawCqlQueryFieldExtraProps>;

/** Materialized for Vue's runtime prop extraction; equivalent to `RawCqlQueryFieldDefinition['componentProps']`. */
export type RawCqlQueryFieldComponentProps = FieldComponentProps<RawCqlQueryFieldState> & RawCqlQueryFieldExtraProps;
