import type { RangeMode } from '@/features/form/fields/generic/range-mode';
import type { NamedFieldComponentProps, NamedFieldDefinition } from '@/features/form/model/field-component-props';

export type DateValue = {
	d: string;
	m: string;
	y: string;
};

export type DateFieldState = {
	startDate: DateValue;
	endDate: DateValue;
	mode: RangeMode;
};
export type DateFieldExtraProps = {
	range: boolean;
	min?: string | Date | DateValue;
	max?: string | Date | DateValue;
	/** Lock the mode to a fixed value if present. */
	mode?: RangeMode;
};
export type DateFieldDefinition = NamedFieldDefinition<DateFieldState, DateFieldExtraProps>;

export const createDefaultDateFieldState = (): DateFieldState => ({
	startDate: { y: '', m: '', d: '' },
	endDate: { y: '', m: '', d: '' },
	mode: 'strict',
});

export const DateUtils = {
	/**
	 * Return the date as a string in the format YYYYMMDD,
	 * Missing/invalid months/days are filled in as either the earliest or latest possible value depending on the mode.
	 * Null dates or dates with invalid years return an empty string.
	 * Works for years in the range 0000-9999.
	 */
	dateValueToString(date: DateValue | null | undefined, mode: 'start' | 'end'): string {
		if (!date) return '';
		let { y, m, d } = date;
		if (!y.length || !y.match(/^[0-9]{1,4}$/)) return '';
		if (!m.length || !m.match(/^[0-9]{1,2}$/)) m = mode === 'start' ? '1' : '12';
		if (!d.length || !d.match(/^[0-9]{1,2}$/)) d = mode === 'start' ? '1' : new Date(Number(y), Number(m), 0).getDate().toString();
		return `${y.padStart(4, '0')}${m.padStart(2, '0')}${d.padStart(2, '0')}`;
	},
	dateValueToDisplayString(date: DateValue | null | undefined): string {
		if (!date) return '';
		const { y, m, d } = date;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	},
	// luceneToDisplayString(date: string): string {
	// 	const match = date.match(/([\d]{4})-?([\d]{2})-?([\d]{2})/);
	// 	if (!match) return date;
	// 	const [, y, m, d] = match;
	// 	return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	// },
	normalizeBoundaryDate(date?: DateValue | Date | string): DateValue | null {
		if (!date) return null;
		if (date instanceof Date) return this.dateToValue(date);
		if (typeof date === 'string') {
			const match = date.match(/([\d]{4})-?([\d]{2})-?([\d]{2})/);
			if (!match) return null;
			const [, y, m, d] = match;
			return { y, m, d };
		}
		return date;
	},
	dateToValue(date: Date): DateValue {
		return {
			y: date.getFullYear().toString().padStart(4, '0'),
			m: (date.getMonth() + 1).toString().padStart(2, '0'),
			d: date.getDate().toString().padStart(2, '0'),
		};
	},
};

export type DateFieldConfig = DateFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `DateFieldDefinition['componentProps']`. */
export type DateFieldComponentProps = NamedFieldComponentProps<DateFieldState> & DateFieldExtraProps;
