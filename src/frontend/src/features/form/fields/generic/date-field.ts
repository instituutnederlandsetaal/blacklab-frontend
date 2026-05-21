import type { DateValue, FilterDateValue } from '@/features/form/model/filter-value-functions';

export type DateFieldState = FilterDateValue;

export type DateFieldUiConfig = {
	displayName: string;
	description?: string;
	range: boolean;
	min?: string | Date | DateValue;
	max?: string | Date | DateValue;
	mode?: FilterDateValue['mode'];
};