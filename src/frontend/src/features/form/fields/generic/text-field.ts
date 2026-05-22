import type { GenericFieldUiConfig } from '@/features/form/fields/generic/shared-ui-config';

export type TextFieldState = {
	value: string;
	caseSensitive: boolean;
};

export const createDefaultTextFieldState = (): TextFieldState => ({
	value: '',
	caseSensitive: false,
});

export type TextFieldUiConfig = GenericFieldUiConfig & {
	placeholder?: string;
	autocomplete?: (term: string) => Promise<string[]>;
	/** Does the field have the option to toggle case-sensitivity */
	caseSensitive?: boolean;
	caseSensitiveLabel?: string;
};
