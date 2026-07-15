import type { NamedFieldComponentProps, NamedFieldDefinition } from '@/features/form/model/field-component-props';

import type { Options } from '@/shared/utils/options';

export type SelectFieldState = string[];
export type SelectFieldExtraProps = {
	options: Options;
	placeholder?: string;
	multiple?: boolean;
	html?: boolean;
	hideEmpty?: boolean;
};
export type SelectFieldDefinition = NamedFieldDefinition<SelectFieldState, SelectFieldExtraProps, 'placeholder'>;

export const createDefaultSelectFieldState = (): SelectFieldState => [];
export type SelectFieldConfig = SelectFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `SelectFieldDefinition['componentProps']`. */
export type SelectFieldComponentProps = NamedFieldComponentProps<SelectFieldState> & SelectFieldExtraProps;
