export type RangeFieldState = {
	low: string;
	high: string;
};

export type RangeFieldUiConfig = {
	displayName: string;
	description?: string;
	lowPlaceholder?: string;
	highPlaceholder?: string;
	inputType?: 'text' | 'number';
};