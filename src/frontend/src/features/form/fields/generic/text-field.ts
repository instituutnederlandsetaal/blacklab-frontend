export type TextFieldState = {
	value: string;
	caseSensitive: boolean;
};

export type TextFieldUiConfig = {
	displayName: string;
	description?: string;
	placeholder?: string | null;
	textDirection?: 'ltr' | 'rtl';
	autocomplete?: (term: string) => Promise<string[]>;
	caseSensitive?: boolean;
	caseSensitiveLabel?: string;
};