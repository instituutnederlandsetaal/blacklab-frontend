import { unescapeLucene, escapeLucene, splitIntoTerms, mapReduce, cast } from '@/utils';
import { FilterValue, Option } from '@/types/apptypes';
import { ASTNode, ASTRange } from 'lucene-query-parser';
// @ts-ignore - weird this doesn't work during builds
import { modes } from './FilterRangeMultipleFields.vue';
import { FullFilterState } from '@/store/search/form/filters';
import { debugLog } from '@/utils/debug';


/** month (m) and day (d) may be empty strings. Month field starts at 1 instead of javascript Date's 0. */
export type DateValue = {
	d: string;
	m: string;
	y: string;
};

/** Value prop of the FilterDate component */
export type FilterDateValue = {
	startDate: DateValue,
	endDate: DateValue,
	mode: 'strict'|'permissive'
};

/** Metadata of the FilterDate component */
export type FilterDateMetadata = ({
	field: string;
}|{
	from_field: string;
	to_field: string
	mode?: 'strict'|'permissive';
})&{
	range: boolean;
	/** string in format yyyymmdd or yyyy-mm-dd */
	min?: string|Date|DateValue;
	/** string in format yyyymmdd or yyyy-mm-dd */
	max?: string|Date|DateValue;
};

type FilterValueFunctions<M, V> = {
	/**
	 * Called once for every filter in the interface
	 * Custom filters are called first.
	 * If a custom filter wants to take "ownership" of a decoded filter value, it should delete the value from the map, to prevent
	 * later (inbuilt) filters from decoding it.
	 */
	decodeInitialState(id: string, filterMetadata: M, filterValues: Record<string, FilterValue|undefined>, ast: ASTNode): V|null,
	luceneQuery(id: string, filterMetadata: M, value: V|null): string|null;
	luceneQuerySummary(id: string, filterMetadata: M, value: V|null): string|null;
};

/**
 * search for a construct like
 * - (lower:[low TO high] or higher:[low TO high])
 * - (lower:[low TO high] and higher:[low TO high])
 *
 * it looks like this in the ast
 *
 * ```js
 * {
 *   field: '<implicit>',
 *   operator: 'AND'|'OR',
 *   left: {
 *     field: lower/higher
 *     term_min: 0
 *     term_max: 100
 *     inclusive: true
 *   },
 *   right: {
 *     field: lower/higher
 *     term_min: 0
 *     term_max: 100
 *     inclusive: true
 *   }
 * }
 * ```
 */
function getFieldValues(ast: ASTNode, field1: string, field2: string): {
	field1: {
		low: string,
		high: string,
	},
	field2: {
		low: string,
		high: string;
	},
	mode: 'permissive'|'strict';
}|null {
	function isRange(n: any): n is ASTRange {
		return  !!(n && 'field' in n && 'term_min' in n);
	}


	const stack: ASTNode[] = [ast];
	while (stack.length) {
		const cur = stack.shift()!;
		if (cur.field) {
			// attached to a field, we're looking for a node describing a logical group,
			// like (fieldA:a OR fieldB:b), so it will never have a single field
			continue;
		}

		// terminating clause
		if (
			(isRange(cur.left) && (cur.left.field === field1 || cur.left.field === field2)) &&
			(isRange(cur.right) && (cur.right.field === field1 || cur.right.field === field2))
		) {
			const f1 = cur.left.field === field1 ? cur.left : cur.right;
			const f2 = cur.left.field === field2 ? cur.left : cur.right;
			return {
				field1: {
					// Strip leading zeroes we may have inserted
					low: f1.term_min.replace(/^0*/, ''),
					high: f1.term_max.replace(/^0*/, '')
				},
				field2: {
					// Strip leading zeroes we may have inserted
					low: f2.term_min.replace(/^0*/, ''),
					high: f2.term_max.replace(/^0*/, '')
				},
				mode:
					cur.operator === '&&' ? 'strict' :
					cur.operator === 'AND' ? 'strict' :
					cur.operator === '||' ? 'permissive' :
					cur.operator === 'OR' ? 'permissive' :
					'permissive', // unknown operator -- just interpret as permissive.
			};
		}

		// descend recursively down left and right
		if (cur.left && 'operator' in cur.left) {
			stack.push(cur.left);
		}

		if (cur.right && 'operator' in cur.right) {
			stack.push(cur.right);
		}
	}
	return null;
}

export const DateUtils = {
	/**
	 * Conver the date object into a lucene filter string (which is just the concatenated numbers with zero-padding).
	 * Filling in blank months or days based on the mode. (first/last month of the year, first/last day of the month).
	 * Ex. {d: '1', m: '4', y: '2022'} => '20220401'.
	 * Returns an empty string if the date could not be parsed.
	 */
	dateValueToLucene(date: DateValue|null|undefined, mode: 'start'|'end'): string {
		if (!date) return '';
		let {y, m, d} = date;
		if (!y.length || !y.match(/^[0-9]{1,4}$/)) { return ''; }
		if (!m.length || !m.match(/^[0-9]{1,2}$/)) { m = mode === 'start' ? '1' : '12'; }
		if (!d.length || !d.match(/^[0-9]{1,2}$/)) { d = mode === 'start' ? '1' : new Date(Number(y), Number(m), 0).getDate().toString(); }
		return `${y.padStart(4, '0')}${m.padStart(2, '0')}${d.padStart(2, '0')}`;
	},
	/**
	 * The opposite of DateValueToLuceneString. Assumed to be used to decode initial value for FilterDate.
	 * Can also handle date strings with separator char '-'.
	 * Ex. 2022-04-01 => {d: '01', m: '04', y: '2022'}.
	 * If date cannot be parsed, returns empty strings (which FilterDate can use).
	 */
	luceneToDateValue(date?: string): {y: string, m: string, d: string} {
		if (!date) return { y: '', m: '', d: '' };
		const match = date.match(/([\d]{4})-?([\d]{2})-?([\d]{2})/);
		if (!match) return { y: '', m: '', d: '' };
		const [_, y, m, d] = match;
		return {y,m,d};
	},
	/** Format the lucene date filter string to a display string with separators and padded zeroes. */
	luceneToDisplayString(date: string): string {
		const [_,y,m,d] = date.match(/([\d]{4})-?([\d]{2})-?([\d]{2})/)!;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
	},
	/**
	 * Boundary dates are the minDate and maxDate settings for FilterDate. E.g. boundaries of what the user may enter (also used to inform the user about the contents of the corpus).
	 * For convenience we allow the admin to enter boundary dates in a couple of formats ('yyyymmdd', 'yyyy-mm-dd', new Date(), {y: string, m: string, d: string}).
	 * Check which one it is, and convert it into a valid DateValue.
	 * Semantics are a little different than the other conversion functions: this one returns null if the process fails at any step.
	 */
	normalizeBoundaryDate(date?: DateValue|Date|string): DateValue|null {
		if (!date) return null;
		if (date instanceof Date) return this.dateToValue(date);
		if (typeof date === 'string') {
			const match = date.match(/([\d]{4})-?([\d]{2})-?([\d]{2})/);
			if (!match) return null;
			const [_, y, m, d] = match;
			return {y,m,d};
		}
		return date;
	},
	dateToValue(date: Date): DateValue {
		const y = date.getFullYear().toString().padStart(4, '0');
		const m = (date.getMonth() + 1).toString().padStart(2, '0');
		const d = date.getDate().toString().padStart(2, '0');
		return { y,m,d }
	},
}

/**
 * Separate from the components so we can easily call these functions from other places.
 */
export const valueFunctions: Record<string, FilterValueFunctions<any, any>> = {
	'filter-autocomplete': cast<FilterValueFunctions<never, string>>({
		decodeInitialState(id, filterMetadata, filterValues) {
			return (filterValues[id]?.values || []).map(unescapeLucene).map(val => val.match(/\s+/) ? `"${val}"` : val).join(' ') || null;
		},
		luceneQuery(id, filterMetadata, value) {
			if (!value || !value.trim()) { return null; }
			return `${id}:(${splitIntoTerms(value, true).map(t => escapeLucene(t.value, !t.isQuoted)).join(' ')})`;
		},
		luceneQuerySummary(id, filterMetadata, value) {
			const split = value ? splitIntoTerms(value, true) : [];
			return split.map(t => (t.isQuoted || split.length > 1) ? `"${t.value}"` : t.value).join(', ') || null;
		}
	}),
	'filter-checkbox': cast<FilterValueFunctions<Option[], Record<string, boolean>>>({
		decodeInitialState(id, filterMetadata, filterValues) {
			const availableValues = filterValues[id]?.values
				?.map(unescapeLucene)
				.filter(value => {
					const valueIsPossible = filterMetadata.find(option => option.value === value);
					if (!valueIsPossible) { debugLog(`Filter ${id} ignoring requested value ${value} while decoding - value is not in the available options.`); }
					return valueIsPossible;
				});

			return availableValues?.length ? mapReduce(availableValues) : null;
		},
		luceneQuery(id, filterMetadata, filterValue) {
			const selected = Object.entries(filterValue || {})
					.filter(([value, isSelected]) => isSelected)
					.map(([value, isSelected]) => escapeLucene(value, false));
			return selected.length ? `${id}:(${selected.join(' ')})` : null;
		},
		luceneQuerySummary(id, filterMetadata, filterValue) {
			const selected = Object.entries(filterValue || {})
				.filter(([value, isSelected]) => isSelected)
				.map(([value, isSelected]) => filterMetadata.find(option => option.value === value)?.label || value);

			return selected.length >= 2 ? selected.map(v => `"${v}"`).join(', ') : selected[0] || null;
		}
	}),
	'filter-radio': cast<FilterValueFunctions<Option[], string>>({
		decodeInitialState(id, filterMetadata, filterValues) {
			const availableValues = filterValues[id]?.values
				?.map(unescapeLucene)
				.filter(value => {
					const valueIsPossible = filterMetadata.find(option => option.value === value);
					if (!valueIsPossible) { debugLog(`Filter ${id} ignoring requested value ${value} while decoding - value is not in the available options.`); }
					return valueIsPossible;
				});

			return availableValues?.length ? availableValues[0] : null;
		},
		luceneQuery(id, filterMetadata, value) {
			return value ? `${id}:(${escapeLucene(value, false)})` : null;
		},
		luceneQuerySummary(id, filterMetadata, value) {
			return filterMetadata.find(option => option.value === value)?.label || value || null;
		}
	}),
	'filter-range': cast<FilterValueFunctions<never, { low: string; high: string; }>>({
		decodeInitialState(id, filterMetadata, filterValues) {
			const v = filterValues[id];
			if (!v || !v.values.length) { return null; }
			return {
				low: v.values[0] !== '0' ? v.values[0] || '' : '',
				high: v.values[1] !== '9999' ? v.values[1] || '' : '',
			};
		},
		luceneQuery(id, filterMetadata, value) {
			if (!value) return null;
			return (value.low || value.high) ?
				`${id}:[${value.low || '0'} TO ${value.high || '9999'}]` :
				null;
		},
		luceneQuerySummary(id, filterMetadata, value) {
			return (value && (value.low != null || value.high != null)) ? `${value.low || '0'} - ${value.high || '9999'}` : null;
		}
	}),
	'filter-range-multiple-fields': cast<FilterValueFunctions<{low: string, high: string}, {low: string, high: string, mode: 'permissive'|'strict'}>>({
		decodeInitialState(id, filterMetadata, filterValues, ast) {
			const {low, high} = filterMetadata;
			const s = getFieldValues(ast, low, high);
			// Prevent these fields from also being decoded by another filter later in the decoding stage.
			// Otherwise the values would "double up".
			// https://github.com/INL/corpus-frontend/issues/379
			if (filterValues[low] && filterValues[high]) {
				delete filterValues[low];
				delete filterValues[high];
			}
			return s ? {
				low: s.field1.low,
				high: s.field2.high,
				mode: s.mode
			} : null;
		},
		luceneQuery(id: string, filterMetadata: {low: string, high: string}, value: { low: string; high: string; mode: keyof typeof modes}|null): string|null {
			if (!value) { return null; }
			const {low, high} = filterMetadata;

			// pad using leading zeroes, for when the field is a string in lucene/bls, otherwise field:[1 TO 2] matches anything containing a 1 or 2
			// NOTE: ranges can be unbounded ('*'), if so, skip padding.
			const lowPadded = value.low.padStart(4, '0');
			const highPadded = value.high ? value.high.padStart(4, '0') : '9999'; // unbounded query
			const op = modes[value.mode as keyof typeof modes].operator;

			return (value.low || value.high) ? `(${low}:[${lowPadded} TO ${highPadded}] ${op} ${high}:[${lowPadded} TO ${highPadded}])` : null;
		},
		luceneQuerySummary(id, filterMetadata, value) {
			const lowValue = value!.low;
			const highValue = value!.high;
			// We need to pad shorter the values with leading zeroes or lucene will behave strangely
			// as they're usually indexed as text values, and not numeric values
			const longestValue = Math.max(lowValue.length, highValue.length);

			const luceneQuery = this.luceneQuery(id, filterMetadata, value);
			return luceneQuery ? `${lowValue.padStart(longestValue, '0')}-${highValue.padStart(longestValue, '0')}` : null;
		}
	}),
	'filter-select': cast<FilterValueFunctions<Option[], string[]>>({
		decodeInitialState(id, filterMetadata, filterValues) {
			const availableValues = filterValues[id]?.values
				?.map(unescapeLucene)
				.filter(value => {
					const valueIsPossible = filterMetadata.find(option => option.value === value);
					if (!valueIsPossible) { debugLog(`Filter ${id} ignoring requested value ${value} while decoding - value is not in the available options.`); }
					return valueIsPossible;
				});

			return availableValues?.length ? availableValues : null;
		},
		luceneQuery(id, filterMetadata, value) {
			return (value && value.length) ? `${id}:(${value.map(v => escapeLucene(v, false)).join(' ')})` : null;
		},
		luceneQuerySummary(id, filterMetadata, value) {
			const asDisplayValues = (value || []).map(v => {
				return filterMetadata.find(option => option.value === v)?.label || v;
			});
			return asDisplayValues.length >= 2 ? asDisplayValues.map(v => `"${v}"`).join(', ') : asDisplayValues[0] || null;
		}
	}),
	'filter-text': cast<FilterValueFunctions<never, string>>({
		decodeInitialState(id, filterMetadata, filterValues) {
			return (filterValues[id]?.values || []).map(unescapeLucene).map(val => val.match(/\s+/) ? `"${val}"` : val).join(' ') || null;
		},
		luceneQuery(id, filterMetadata, value) {
			if (!value || !value.trim()) { return null; }
			return `${id}:(${splitIntoTerms(value, true).map(t => escapeLucene(t.value, !t.isQuoted)).join(' ')})`;
		},
		luceneQuerySummary(id, filterMetadata, value) {
			const split = value ? splitIntoTerms(value, true) : [];
			return split.map(t => (t.isQuoted || split.length > 1) ? `"${t.value}"` : t.value).join(', ') || null;
		}
	}),
	'filter-date': cast<FilterValueFunctions<FilterDateMetadata, FilterDateValue>>({
		decodeInitialState(id, filterMetadata, filterValues, ast) {
			const minDate = DateUtils.dateValueToLucene(DateUtils.normalizeBoundaryDate(filterMetadata.min), 'start');
			const maxDate = DateUtils.dateValueToLucene(DateUtils.normalizeBoundaryDate(filterMetadata.max), 'end');

			if ('field' in filterMetadata) {
				if (!filterValues[filterMetadata.field]) return null;
				// single field mode. i.e. the date is governed by a single metadata field
				// we can just extract the values directly.
				const [from, to] = filterValues[filterMetadata.field]!.values;
				// If the value is equal to the boundary of the range, don't set it. It is the implicit value, so act as if it wasn't set
				const startDate = from !== minDate ? DateUtils.luceneToDateValue(from) : {y: '', m: '', d: ''};
				const endDate = to !== maxDate ? DateUtils.luceneToDateValue(to) : {y: '', m: '', d: ''};
				delete filterValues[filterMetadata.field];
				return {startDate, endDate, mode: 'permissive'};
			}
			// the value is in two fields.
			// Query looks identical to that of range-multiple-fields
			const r = getFieldValues(ast, filterMetadata.from_field, filterMetadata.to_field);
			if (!r) return null;
			const from = r.field1.low;
			const to = r.field1.high;
			delete filterValues[filterMetadata.from_field];
			delete filterValues[filterMetadata.to_field];

			// If the value is equal to the boundary of the range, don't set it. It is the implicit value, so act as if it wasn't set
			const startDate = from !== minDate ? DateUtils.luceneToDateValue(from) : {y: '', m: '', d: ''};
			const endDate = to !== maxDate ? DateUtils.luceneToDateValue(to) : {y: '', m: '', d: ''};
			return { startDate, endDate, mode: r.mode };
		},
		luceneQuery(id, filterMetadata, value) {
			// @ts-ignore isDefaultValue is set by FilterDate when value prop is unset and user hasn't interacted yet.
			if (!value || value.isDefaultValue) { return null; }

			const startDate = value.startDate;
			// value.endDate is only used when the filter is in range mode
			const endDate = filterMetadata.range ? value.endDate : value.startDate;
			const operator = modes[value.mode].operator; // OR or AND
			// Which metadatafield are we filtering? either a single field ('field' prop), or two separate fields ('from_field' and 'to_field')
			const lowFieldName = 'field' in filterMetadata ? filterMetadata.field : filterMetadata.from_field;
			const highFieldName = 'field' in filterMetadata ? filterMetadata.field : filterMetadata.to_field;

			// These are the boundaries (if defined by admin) - empty strings if not defined.
			const minBoundaryLucene = DateUtils.dateValueToLucene(DateUtils.normalizeBoundaryDate(filterMetadata.min), 'start');
			const maxBoundaryLucene = DateUtils.dateValueToLucene(DateUtils.normalizeBoundaryDate(filterMetadata.max), 'end');

			// Convert the values into the lucene strings, sub in boundary values if no value set by filter itself.
			const from = DateUtils.dateValueToLucene(startDate, 'start') || minBoundaryLucene;
			const to = DateUtils.dateValueToLucene(endDate, 'end') || maxBoundaryLucene;
			// finally, check if we have sensible values and at least one of the values is not the boundary
			if (!from || !to || (from === minBoundaryLucene && to === maxBoundaryLucene)) {
				return null;
			}

			return `(${lowFieldName}:[${from} TO ${to}] ${operator} ${highFieldName}:[${from} TO ${to}])`;
		},
		luceneQuerySummary(id, filterMetadata, value) {
			// Instead of repeating all the logic above, just regex out the relevant parts
			const v = this.luceneQuery(id, filterMetadata, value);
			if (!v) return null;
			let [_, start, end] = v.match(/(\d+).+?(\d+)/)!; // capture the first two numbers.
			start = DateUtils.luceneToDisplayString(start);
			end = DateUtils.luceneToDisplayString(end);
			return (start !== end) ? start + ' to ' + end : start;
		},
	})
};

/**
 * Converts the active filters into a parameter string blacklab-server can understand.
 *
 * Values from filters with types other than 'range' or 'select' will be split on whitespace and individual words will be surrounded by quotes.
 * Effectively transforming
 * "quoted value" not quoted value
 * into
 * "quoted value" "not" "quoted" "value"
 *
 * The result of this is that the filter will respond to any value within one set of quotes, so practially an OR on individual words.
 *
 * If the array is empty or null, undefined is returned,
 * so it can be placed directly in the request paremeters without populating the object if the value is not present.
 */
export function getFilterString(filters: FullFilterState[]): string|undefined {
	return filters
		.map(f => valueFunctions[f.componentName].luceneQuery(f.id, f.metadata, f.value))
		.filter(lucene => !!lucene).join(' AND ') || undefined;
}

// NOTE: range filter has hidden defaults for unset field (min, max), see https://github.com/INL/corpus-frontend/issues/234
export const getFilterSummary = (filters: FullFilterState[]): string|undefined => filters
	.map(f => ({f, summary: valueFunctions[f.componentName].luceneQuerySummary(f.id, f.metadata, f.value)}))
	.filter(f => !!f.summary)
	.map(f => `${f.f.defaultDisplayName}: ${f.summary}`)
	.join(', ') || undefined;
