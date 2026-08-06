import type { NamedFieldComponentProps, NamedFieldDefinition } from '@/features/form/model/field-component-props';

export type TextFieldState = {
	value: string;
	caseSensitive: boolean;
};
export type TextFieldExtraProps = {
	placeholder?: string;
	autocomplete?: (term: string) => Promise<string[]>;
	/** Does the field have the option to toggle case-sensitivity. */
	caseSensitive?: boolean;
};
export type TextFieldDefinition = NamedFieldDefinition<TextFieldState, TextFieldExtraProps, 'placeholder'>;

export const createDefaultTextFieldState = (): TextFieldState => ({
	value: '',
	caseSensitive: false,
});
/** Materialized for Vue's runtime prop extraction; equivalent to `TextFieldDefinition['componentProps']`. */
export type TextFieldComponentProps = NamedFieldComponentProps<TextFieldState> & TextFieldExtraProps;
