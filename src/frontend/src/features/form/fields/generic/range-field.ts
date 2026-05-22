import type { GenericFieldUiConfig } from '@/features/form/fields/generic/shared-ui-config';

export type RangeFieldState = {
	low: string;
	high: string;
};

export const createDefaultRangeFieldState = (): RangeFieldState => ({
	low: '',
	high: '',
});

export type RangeFieldUiConfig = GenericFieldUiConfig & {
	lowPlaceholder?: string;
	highPlaceholder?: string;
	inputType?: 'text' | 'number';
};