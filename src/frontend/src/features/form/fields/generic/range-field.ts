import type { RangeMode } from '@/features/form/fields/generic/range-mode';
import type { NamedFieldComponentProps, NamedFieldDefinition } from '@/features/form/model/field-component-props';

export type RangeFieldState = {
	low: string;
	high: string;
	mode: RangeMode;
};
export type RangeFieldExtraProps = {
	lowPlaceholder?: string;
	highPlaceholder?: string;
	inputType?: 'text' | 'number';
	/** Lock the range mode to a fixed value if present. */
	mode?: RangeMode | null;
	/** Show the strict/permissive range mode selector. Enabled automatically for multi-field ranges. */
	showMode?: boolean;
	lowField?: string;
	highField?: string;
};
export type RangeFieldDefinition = NamedFieldDefinition<RangeFieldState, RangeFieldExtraProps, 'lowPlaceholder' | 'highPlaceholder'>;

export const createDefaultRangeFieldState = (): RangeFieldState => ({
	low: '',
	high: '',
	mode: 'strict',
});

export type RangeFieldConfig = RangeFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `RangeFieldDefinition['componentProps']`. */
export type RangeFieldComponentProps = NamedFieldComponentProps<RangeFieldState> & RangeFieldExtraProps;
