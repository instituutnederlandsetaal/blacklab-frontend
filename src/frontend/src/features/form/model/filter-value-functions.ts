import type { MetadataFilterFieldConfig } from '@/features/form/model/controllers/metadata-filter-controller';
import type { TextFieldState } from '@/features/form/fields/generic/text-field';

import { mapReduce } from '@/shared/utils/map-reduce';
import { findOption, optionLabel, optionValues, type Option } from '@/shared/utils/options';
import { escapeLucene, splitIntoTerms, unescapeLucene } from '@/shared/utils/string-utils';

export type DateValue = {
	d: string;
	m: string;
	y: string;
};

export type FilterDateValue = {
	startDate: DateValue;
	endDate: DateValue;
	mode: 'strict' | 'permissive';
};
export type FilterDateMetadata = (
	| {
			field: string;
	  }
	| {
			from_field: string;
			to_field: string;
			mode?: 'strict' | 'permissive';
	  }
) & {
	range: boolean;
	min?: string | Date | DateValue;
	max?: string | Date | DateValue;
};

export type FilterRangeValue = {
	low: string;
	high: string;
};
export type FilterRangeMetadata = never;

export type FilterRangeMultipleFieldsValue = {
	low: string;
	high: string;
	mode: 'permissive' | 'strict';
};
export type FilterRangeMultipleFieldsMetadata = {
	low: string;
	high: string;
	mode?: 'permissive' | 'strict';
};

export type FilterCheckboxValue = Record<string, boolean>;
export type FilterCheckboxMetadata = Option[];

export type FilterSelectValue = string[];
export type FilterSelectMetadata = Option[];

export type FilterRadioValue = string;
export type FilterRadioMetadata = Option[];

export type FilterAutocompleteValue = TextFieldState;
export type FilterAutocompleteMetadata = (value: string) => Promise<string[]>;

export type FilterTextValue = TextFieldState;
export type FilterTextMetadata = never;

type FilterValueFunctions<Metadata, Value> = {
	createDefaultValue: (definition: MetadataFilterFieldConfig<Metadata>) => Value | null;
	luceneQuery: (id: string, filterMetadata: Metadata | undefined, value: Value | null) => string | null;
	luceneQuerySummary: (id: string, filterMetadata: Metadata | undefined, value: Value | null) => string | null;
	isActive: (id: string, filterMetadata: Metadata | undefined, value: Value | null) => boolean;
	isSpanFilter?: boolean;
};

export const DateUtils = {
	dateValueToLucene(date: DateValue | null | undefined, mode: 'start' | 'end'): string {
		if (!date) return '';
		let { y, m, d } = date;
		if (!y.length || !y.match(/^[0-9]{1,4}$/)) return '';
		if (!m.length || !m.match(/^[0-9]{1,2}$/)) m = mode === 'start' ? '1' : '12';
		if (!d.length || !d.match(/^[0-9]{1,2}$/)) d = mode === 'start' ? '1' : new Date(Number(y), Number(m), 0).getDate().toString();
		return `${y.padStart(4, '0')}${m.padStart(2, '0')}${d.padStart(2, '0')}`;
	},
	luceneToDisplayString(date: string): string {
		const match = date.match(/([\d]{4})-?([\d]{2})-?([\d]{2})/);
		if (!match) return date;
		const [, y, m, d] = match;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	},
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

const valueFunctions = {
	'filter-autocomplete': {
		createDefaultValue: () => ({ value: '', caseSensitive: false }),
		luceneQuery(id, _filterMetadata, value) {
			if (!value?.value.trim()) return null;
			return `${id}:(${splitIntoTerms(value.value, true)
				.map(term => escapeLucene(term.value, !term.isQuoted))
				.join(' ')})`;
		},
		luceneQuerySummary(_id, _filterMetadata, value) {
			const split = value?.value ? splitIntoTerms(value.value, true) : [];
			return split.map(term => (term.isQuoted || split.length > 1 ? `"${term.value}"` : term.value)).join(', ') || null;
		},
		isActive(id, filterMetadata, value) {
			return this.luceneQuery(id, filterMetadata, value) !== null;
		},
	} satisfies FilterValueFunctions<FilterAutocompleteMetadata, FilterAutocompleteValue>,

	'filter-text': {
		createDefaultValue: () => ({ value: '', caseSensitive: false }),
		luceneQuery(id, _filterMetadata, value) {
			if (!value?.value.trim()) return null;
			return `${id}:(${splitIntoTerms(value.value, true)
				.map(term => escapeLucene(term.value, !term.isQuoted))
				.join(' ')})`;
		},
		luceneQuerySummary(_id, _filterMetadata, value) {
			const split = value?.value ? splitIntoTerms(value.value, true) : [];
			return split.map(term => (term.isQuoted || split.length > 1 ? `"${term.value}"` : term.value)).join(', ') || null;
		},
		isActive(id, filterMetadata, value) {
			return this.luceneQuery(id, filterMetadata, value) !== null;
		},
	} satisfies FilterValueFunctions<FilterTextMetadata, FilterTextValue>,

	'filter-checkbox': {
		createDefaultValue: () => ({}),
		luceneQuery(id, _filterMetadata, filterValue) {
			const selected = Object.entries(filterValue || {})
				.filter(([, isSelected]) => isSelected)
				.map(([value]) => escapeLucene(value, false));
			return selected.length ? `${id}:(${selected.join(' ')})` : null;
		},
		luceneQuerySummary(_id, filterMetadata, filterValue) {
			const selected = Object.entries(filterValue || {})
				.filter(([, isSelected]) => isSelected)
				.map(([value]) => filterMetadata?.find(option => option.value === value)?.label || value);
			return selected.length >= 2 ? selected.map(value => `"${value}"`).join(', ') : selected[0] || null;
		},
		isActive(id, filterMetadata, value) {
			return this.luceneQuery(id, filterMetadata, value) !== null;
		},
	} satisfies FilterValueFunctions<FilterCheckboxMetadata, FilterCheckboxValue>,

	'filter-radio': {
		createDefaultValue: () => '',
		luceneQuery(id, _filterMetadata, value) {
			return value ? `${id}:(${escapeLucene(value, false)})` : null;
		},
		luceneQuerySummary(_id, filterMetadata, value) {
			return value ? optionLabel(findOption(filterMetadata ?? [], value) ?? value) : null;
		},
		isActive(id, filterMetadata, value) {
			return this.luceneQuery(id, filterMetadata, value) !== null;
		},
	} satisfies FilterValueFunctions<FilterRadioMetadata, FilterRadioValue>,

	'filter-range': {
		createDefaultValue: () => ({ low: '', high: '' }),
		luceneQuery(id, _filterMetadata, value) {
			if (!value) return null;
			return value.low || value.high ? `${id}:[${value.low || '0'} TO ${value.high || '9999'}]` : null;
		},
		luceneQuerySummary(_id, _filterMetadata, value) {
			return value && (value.low || value.high) ? `${value.low || '0'} - ${value.high || '9999'}` : null;
		},
		isActive(id, filterMetadata, value) {
			return this.luceneQuery(id, filterMetadata, value) !== null;
		},
	} satisfies FilterValueFunctions<FilterRangeMetadata, FilterRangeValue>,

	'filter-range-multiple-fields': {
		createDefaultValue: () => ({ low: '', high: '', mode: 'strict' }),
		luceneQuery(_id, filterMetadata, value) {
			if (!filterMetadata || !value || (!value.low && !value.high)) return null;
			const lowPadded = value.low ? value.low.padStart(4, '0') : '0';
			const highPadded = value.high ? value.high.padStart(4, '0') : '9999';
			const op = (filterMetadata.mode ?? value.mode) === 'permissive' ? 'OR' : 'AND';
			return `(${filterMetadata.low}:[${lowPadded} TO ${highPadded}] ${op} ${filterMetadata.high}:[${lowPadded} TO ${highPadded}])`;
		},
		luceneQuerySummary(_id, _filterMetadata, value) {
			return value && (value.low || value.high) ? `${value.low || '0'} - ${value.high || '9999'}` : null;
		},
		isActive(id, filterMetadata, value) {
			return this.luceneQuery(id, filterMetadata, value) !== null;
		},
	} satisfies FilterValueFunctions<FilterRangeMultipleFieldsMetadata, FilterRangeMultipleFieldsValue>,

	'filter-select': {
		createDefaultValue: () => [],
		luceneQuery(id, _filterMetadata, value) {
			return value?.length ? `${id}:(${value.map(v => escapeLucene(v, false)).join(' ')})` : null;
		},
		luceneQuerySummary(_id, filterMetadata, value) {
			const labels = (value || []).map(v => filterMetadata?.find(option => option.value === v)?.label || v);
			return labels.length >= 2 ? labels.map(v => `"${v}"`).join(', ') : labels[0] || null;
		},
		isActive(id, filterMetadata, value) {
			return this.luceneQuery(id, filterMetadata, value) !== null;
		},
	} satisfies FilterValueFunctions<FilterSelectMetadata, FilterSelectValue>,

	'filter-date': {
		createDefaultValue: () => ({
			startDate: { y: '', m: '', d: '' },
			endDate: { y: '', m: '', d: '' },
			mode: 'strict',
		}),
		luceneQuery(id, filterMetadata, value) {
			if (!value) return null;
			const metadata = filterMetadata ?? { field: id, range: false };
			const start = DateUtils.dateValueToLucene(value.startDate, 'start');
			const end = DateUtils.dateValueToLucene(metadata.range ? value.endDate : value.startDate, 'end');
			if (!start && !end) return null;
			const range = `[${start || '00000101'} TO ${end || '99991231'}]`;
			if ('from_field' in metadata) {
				const op = (metadata.mode ?? value.mode) === 'permissive' ? 'OR' : 'AND';
				return `(${metadata.from_field}:${range} ${op} ${metadata.to_field}:${range})`;
			}
			return `${metadata.field}:${range}`;
		},
		luceneQuerySummary(id, filterMetadata, value) {
			const lucene = this.luceneQuery(id, filterMetadata, value);
			if (!lucene || !value) return null;
			const start = DateUtils.dateValueToLucene(value.startDate, 'start');
			const end = DateUtils.dateValueToLucene(value.endDate, 'end');
			return [start && DateUtils.luceneToDisplayString(start), end && DateUtils.luceneToDisplayString(end)].filter(Boolean).join(' - ');
		},
		isActive(id, filterMetadata, value) {
			return this.luceneQuery(id, filterMetadata, value) !== null;
		},
	} satisfies FilterValueFunctions<FilterDateMetadata, FilterDateValue>,
};

export type FilterValueFunctionKey = keyof typeof valueFunctions;

export function isFilterValueFunctionKey(value: string): value is FilterValueFunctionKey {
	return value in valueFunctions;
}

export function getValueFunctionsByKey(key: FilterValueFunctionKey): FilterValueFunctions<any, any> {
	return valueFunctions[key];
}

export function getValueFunctions(definition: Pick<MetadataFilterFieldConfig, 'componentName' | 'behaviourName'>): FilterValueFunctions<any, any> {
	const key = (definition.behaviourName || definition.componentName) as FilterValueFunctionKey;
	return (key && isFilterValueFunctionKey(key) ? getValueFunctionsByKey(key) : undefined) ?? valueFunctions['filter-text'];
}

export function getDefaultFilterValue(definition: MetadataFilterFieldConfig): unknown {
	return getValueFunctions(definition).createDefaultValue(definition as never);
}

export function getFilterString(filters: Array<MetadataFilterFieldConfig & { value: unknown }>): string | null {
	const clauses = filters.map(filter => getValueFunctions(filter).luceneQuery(filter.id, filter.metadata, filter.value)).filter((clause): clause is string => !!clause);
	return clauses.length ? clauses.join(' AND ') : null;
}

export function getFilterSummary(filters: Array<MetadataFilterFieldConfig & { value: unknown }>): string | null {
	const clauses = filters.map(filter => getValueFunctions(filter).luceneQuerySummary(filter.id, filter.metadata, filter.value)).filter((clause): clause is string => !!clause);
	return clauses.length ? clauses.join(', ') : null;
}

export function isFilterActive(definition: MetadataFilterFieldConfig, value: unknown): boolean {
	return getValueFunctions(definition).isActive(definition.id, definition.metadata, value);
}

export function selectedCheckboxMap(values: string[]): Record<string, boolean> {
	return mapReduce(values.map(unescapeLucene));
}

export function optionValuesForDefinition(definition: MetadataFilterFieldConfig): string[] {
	return Array.isArray(definition.metadata) ? optionValues(definition.metadata) : [];
}
