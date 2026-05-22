import type { RangeMode } from '@/features/form/fields/generic/shared-ui-config';

import { createDefaultRangeFieldState, type RangeFieldState, type RangeFieldUiConfig } from './range-field';

export type RangeMultipleFieldsFieldState = RangeFieldState & {
	mode: RangeMode;
};

export const createDefaultRangeMultipleFieldsFieldState = (): RangeMultipleFieldsFieldState => ({
	...createDefaultRangeFieldState(),
	mode: 'strict',
});

export type RangeMultipleFieldsFieldUiConfig = RangeFieldUiConfig & {
	/** If set, lock the range mode to a fixed value */
	mode?: RangeMode;
};
