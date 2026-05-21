import type { RangeFieldState, RangeFieldUiConfig } from './range-field';

export type RangeMultipleFieldsFieldState = RangeFieldState & {
	mode: 'permissive' | 'strict';
};

export type RangeMultipleFieldsFieldUiConfig = RangeFieldUiConfig & {
	mode?: RangeMultipleFieldsFieldState['mode'];
};
