import type { NamedFieldComponentProps, NamedFieldDefinition } from '@/features/form/model/field-component-props';

import type { Options } from '@/shared/utils/options';

export type SelectFieldState = string[];
export type SingleSelectFieldState = string;
export type SelectFieldExtraProps = {
	options: Options;
	placeholder?: string;
	multiple?: boolean;
	html?: boolean;
	hideEmpty?: boolean;
};
export type SelectFieldDefinition<State extends string | string[] = SelectFieldState> = NamedFieldDefinition<State, SelectFieldExtraProps, 'placeholder'>;
export type SingleSelectFieldDefinition = SelectFieldDefinition<SingleSelectFieldState>;

export const createDefaultSelectFieldState = (): SelectFieldState => [];
/** Materialized for Vue's runtime prop extraction; equivalent to `SelectFieldDefinition['componentProps']`. */
export type SelectFieldComponentProps = NamedFieldComponentProps<SelectFieldState | SingleSelectFieldState> & SelectFieldExtraProps;
