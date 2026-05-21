import type { FilterRangeMultipleFieldsValue } from '@/features/form/model/filter-value-functions';

import type { RangeFieldUiConfig } from './range-field';

export type RangeMultipleFieldsFieldState = FilterRangeMultipleFieldsValue;

export type RangeMultipleFieldsFieldUiConfig = RangeFieldUiConfig & {
	mode?: FilterRangeMultipleFieldsValue['mode'];
};