import type { FilterRangeValue } from '@/features/form/model/filter-value-functions';

export type RangeFieldState = FilterRangeValue;

export type RangeFieldUiConfig = {
	displayName: string;
	description?: string;
	lowPlaceholder?: string;
	highPlaceholder?: string;
	inputType?: 'text' | 'number';
};