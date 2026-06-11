import type { GenericFieldUiConfig, RangeMode } from '@/features/form/fields/generic/shared-ui-config';

export type RangeFieldState = {
	low: string;
	high: string;
	mode: RangeMode;
};

export const createDefaultRangeFieldState = (): RangeFieldState => ({
	low: '',
	high: '',
	mode: 'strict',
});

export type RangeFieldUiConfig = GenericFieldUiConfig & {
	lowPlaceholder?: string;
	highPlaceholder?: string;
	inputType?: 'text' | 'number';
	/** Lock the range mode to a fixed value if present. */
	mode?: RangeMode | null;
	/** Show the strict/permissive range mode selector. Enabled automatically for multi-field ranges. */
	showMode?: boolean;
};
