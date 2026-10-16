import type { RangeMode, RangeModeOption } from '@/features/form/fields/generic/range-mode';
import type { NamedFieldComponentProps, NamedFieldDefinition } from '@/features/form/model/field-component-props';

import type { DateValue } from '@/shared/utils/date-utils';
/** @public Date value type retained alongside the date-field definition. */
export type { DateValue } from '@/shared/utils/date-utils';

export type DateFieldState = {
	startDate: DateValue;
	endDate: DateValue;
	mode: RangeMode;
};
type DateFieldExtraProps = {
	range: boolean;
	min?: string | Date | DateValue;
	max?: string | Date | DateValue;
	/** Deferred labels and descriptions for the strict/permissive selector. */
	modeOptions?: RangeModeOption[];
	/** Lock the mode to a fixed value if present. */
	mode?: RangeMode;
};
export type DateFieldDefinition = NamedFieldDefinition<DateFieldState, DateFieldExtraProps>;

export const createDefaultDateFieldState = (): DateFieldState => ({
	startDate: { y: '', m: '', d: '' },
	endDate: { y: '', m: '', d: '' },
	mode: 'strict',
});

/** Materialized for Vue's runtime prop extraction; equivalent to `DateFieldDefinition['componentProps']`. */
export type DateFieldComponentProps = NamedFieldComponentProps<DateFieldState> & DateFieldExtraProps;
