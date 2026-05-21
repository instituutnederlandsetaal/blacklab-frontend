import type { Options } from '@/shared/utils/options';

export type SelectFieldState = {
	caseSensitive: boolean;
	selectedValues: string[];
};

export type SelectFieldUiConfig = {
	displayName: string;
	description?: string;
	options: Options;
	placeholder?: string | null;
	textDirection?: 'ltr' | 'rtl';
	multiple?: boolean;
	caseSensitive?: boolean;
	caseSensitiveLabel?: string;
};