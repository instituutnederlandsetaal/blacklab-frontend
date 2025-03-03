/**
 * Helper functions for the grouping table component.
 * Table definitions (as in which columns etc), as well as the functions to calculate derived data that is shown in those columns.
 */

import { KeysOfType } from '@/types/helpers';


/**
 * The columns can display various computed data, such as relative group size, or relative frequency.
 * To keep the displaying manageable we use shortcodes for those, this is a definition list.
 * also for developer documentation :)
 */
export const definitions = [
	['c',   '[corpus]',            'The entire corpus'],
	['sc',  '[subcorpus]',         'A set of documents within c. Defined by a specific set of metadata.'],
	['gsc', '[grouped subcorpus]', 'A set of documents within sc. Creating by matching a set of metadata against documents in sc. If not grouping by metadata, gsc=sc'],
	['r',   '[results]',           'A set of documents within sc. Created by matching a (optional) cql pattern against documents in sc. If no cql is used, r=sc'],
	['gr',  '[grouped results]',   'A set of documents within r. Created by matching a set of metadata against documents in r.'],

	['*.d', '[documents]',         'Number of documents in a collection'],
	['*.t', '[tokens]',            'Number of tokens in a collections'],
	['*.h', '[documents]',         'Number of hits in a collection'],
];

/**
 * The BlackLab api response for groups has data in several different places.
 * We unpack and simplify it a little so that every entry has the same data available. Names are according to the definitions above
 */
export interface GroupData {
	type: 'group';
	/** ID of the group in BlackLab */
	id: string;
	size: number;
	displayname: string;

	/** results.documents (total number of documents in the total resultset) */
	'r.d': number;
	/** results.tokens (total number of tokens in the total resultset) */
	'r.t': number;
	/** results.hits (total number of hits - NOTE: unavailable for queries without cql pattern) */
	'r.h'?: number;

	/** Documents in group */
	'gr.d': number;
	/** Tokens in group */
	'gr.t'?: number; // FIXME remove optional flag when Jan implements
	/** Hits in group */
	'gr.h'?: number;        // NOTE: unavailable for queries without cql pattern

	// group within total search space
	'gsc.d'?: number;       // NOTE: might be unknown (in rare cases, 0 is returned for groups where the metadata value is unknown)
	'gsc.t'?: number;       // NOTE: might be unknown (in rare cases, 0 is returned for groups where the metadata value is unknown)

	// total search space
	'sc.d'?: number; // FIXME remove optional flag when Jan implements
	'sc.t'?: number; // FIXME remove optional flag when Jan implements
}

/** For UI purposes: holds derived statistics about groups. E.G. size of this group vs the largest group. */
export interface GroupRowData extends GroupData {

	// adds to 1 across all groups
	'relative group size [gr.d/r.d]': number;
	'relative group size [gr.t/r.t]'?: number; // FIXME remove option flag when Jan implements
	// adds to 1 across all groups - optional, only when cql pattern available
	'relative group size [gr.h/r.h]'?: number;

	'relative frequency (docs) [gr.d/gsc.d]'?: number; // optional because subcorpus might not be calculable
	'relative frequency (tokens) [gr.t/gsc.t]'?: number; // optional because subcorpus might not be calculable
	'relative frequency (hits) [gr.h/gsc.t]'?: number; // optional because subcorpus might not be calculable and hits are optional

	'relative frequency (docs) [gr.d/sc.d]'?: number; // FIXME optional because subcorpus is unknown for metadata grouped requests, wait for Jan
	'relative frequency (tokens) [gr.t/sc.t]'?: number; // FIXME optional because subcorpus is unknown for metadata grouped requests, wait for Jan

	'average document length [gr.t/gr.d]'?: number;
}

/** What properties are available to display in the columns */
export type Column = keyof GroupRowData;
/**
 * A "table" layout is just an array of columns.
 * A column in our case is a cell holding a number, or a horizontal bar (the table represents a sideways bar chart)
 * The subarray represents a bar, and a string ("column") represents a cell holding a number (like rowData[cell.key])
 */
export type TableDef = Array<Column|[Column, Column]>;

/**
 * These are the table layouts we can show.
 * There are several ways of displaying the data, and the user can pick which one they want.
 *
 * It is structured as follows:
 * Based on what the user has searched for, there are several ways of displaying the data
 * - At the top is the distinction of what we're grouping/displaying: hits or docs
 * - Below that is the distinction of what is being grouped on: document metadata, or a hit property (such as 'lemma' or 'pos')
 * - Then below THAT, is the display mode chose by the user. These are the same data, just different sets of columns.
 *     Usually one wide table containing all relevant properties of the groups
 *     Then the rest are the same columns but in a wider view using a horizontal bar to illustrate the magnitude of the group,
 *     instead of just a cell with a fractional number.
 */
export const displayModes: Record<'hits'|'docs', Record<'metadata'|'annotation', Record<string, TableDef>>> = {
	hits: {
		metadata: {
			'table': [
				'displayname',
				'gr.d',
				'gr.h',
				'gsc.d',
				'gsc.t',
				'relative frequency (docs) [gr.d/gsc.d]',
				'relative frequency (hits) [gr.h/gsc.t]',
			],

			'docs': [
				'displayname',
				['relative group size [gr.d/r.d]', 'gr.d'],
				'relative group size [gr.d/r.d]',
			],

			'hits': [
				'displayname',
				['relative group size [gr.h/r.h]', 'gr.h'],
				'relative group size [gr.h/r.h]',
			],

			'relative docs': [
				'displayname',
				['relative frequency (docs) [gr.d/gsc.d]', 'gr.d'],
				'relative frequency (docs) [gr.d/gsc.d]'
			],

			'relative hits': [
				'displayname',
				['relative frequency (hits) [gr.h/gsc.t]', 'gr.h'],
				'relative frequency (hits) [gr.h/gsc.t]'
			],
		},
		annotation: {
			'table': [
				'displayname',
				'gr.h',
				'relative frequency (hits) [gr.h/gsc.t]'
			],
			'hits': [
				'displayname',
				['relative frequency (hits) [gr.h/gsc.t]', 'gr.h'],
				'relative frequency (hits) [gr.h/gsc.t]',
			],
		},
	},
	docs: {
		annotation: {}, // no annotation grouping for docs
		metadata: {
			'table': [
				'displayname',
				'gr.d',
				'gr.t',
				'relative frequency (docs) [gr.d/gsc.d]',
				'relative frequency (tokens) [gr.t/gsc.t]',
				'average document length [gr.t/gr.d]',
			],
			'docs': [
				'displayname',
				['relative group size [gr.d/r.d]', 'gr.d'],
				'relative group size [gr.d/r.d]'
			],
			'tokens': [
				'displayname',
				['relative frequency (tokens) [gr.t/gsc.t]', 'gr.t'],
				'relative frequency (tokens) [gr.t/gsc.t]'
			],
		}
	}
};

/**
 * For every possible column (1 per key in the RowData type) a column header is defined.
 * It holds the display name, possible tooltip, and optionally what to sort on should the user click the header
 * (e.g. the column header for the "size" property sorts the groups based on size when clicked by the user - analogous to the Hits and Docs tables)
 *
 * So just a mapping for every internal column id to a display name, tooltip and sort property.
 */
export const tableHeaders: {
	[K in ('hits'|'docs'|'default')]: {
		[ColumnId in keyof GroupRowData]?: {
			label?: string;
			title?: string;
			/** annotation, meta field or other property to sort on should this header be clicked by the user */
			sortProp?: string;
		}
	}
} = {
	default: {
		'displayname': {
			label: 'Group',
			title: 'Group name',
			sortProp: 'identity'
		},
		'average document length [gr.t/gr.d]': {
			label: 'Average document length',
			title: '(gr.t/gr.d)'
		},
		'gsc.d': {
			label: '#all docs in current group',
			title: '(gsc.d) - This includes documents without hits'
		},
		'gr.t': {
			label: '#tokens in group',
			title: '(gr.t) - Combined length of all documents with hits in this group',
		},
		'gr.h': {
			label: '#hits in group',
			title: '(gr.h)'
		},
		'relative frequency (docs) [gr.d/gsc.d]': {
			label: 'Relative frequency (docs)',
			title: '(gr.d/gsc.d) - Note that gsc.d = sc.d when not grouped by metadata'
		},
		'relative frequency (hits) [gr.h/gsc.t]': {
			label: 'Relative frequency (hits)',
			title: '(gr.h/gsc.t) - Note that gsc.t = sc.t when not grouped by metadata'
		},
		'relative frequency (tokens) [gr.t/gsc.t]': {
			label: 'Relative frequency (tokens)',
			title: '(gr.t/gsc.t) - Note that gsc.t = sc.t when not grouped by metadata'
		}
	},
	hits: {
		'gr.d': {
			label: '#docs with hits in current group',
			title: '(gr.d)',
		},
		'gr.h': {
			sortProp: 'size'
		},
		'gsc.t': {
			label: '#all tokens in current group',
			title: '(gr.t)',
		},

		'relative group size [gr.d/r.d]': {
			label: 'Relative group size (docs)',
			title: '(gr.d/r.d) - Number of found documents in this group relative to total number of found documents',
		},
		'relative group size [gr.h/r.h]': {
			label: 'Relative group size (hits)',
			title: '(gr.h/r.h) - Number of hits in this group relative to total number hits',
		},
	},
	docs: {
		'gr.d': {
			label: '#docs in group',
			title: '(gr.d)',
			sortProp: 'size'
		},
		'relative group size [gr.d/r.d]': {
			label: 'Relative frequency (docs)',
			title: '(gr.d/r.d)',
		},
	},
};
// Helpers to compute the largest number in the currently displayed result set.
// E.G. largest occurance of the RowData['gr.d'] property.
// This is required to scale the bars in the horizontal barchart view. The largest occurance of a value there has 100% width.
// NOTE: sometimes we know the absolute maximum across all groups (such as the size), because BlackLab tells us,
// but sometimes we only have the maximum value in the currently displayed page (such as for properties we compute locally, such as relative sizes).
// Fixing this would be a substantial amount of extra work for BlackLab.
export type LocalMaxima = {  [P in keyof GroupRowData]-?: number extends GroupRowData[P] ? number : never; };
export class MaxCounter<T, K extends (T extends string ? T : KeysOfType<T, number>) = T extends string ? T : KeysOfType<T, number>> {
	public values: Record<K, number> = {} as any;

	public add(key: K, v?: number) {
		if (typeof v === 'number')
			this.values[key] = Math.max(this.values[key] || 0, v);
	}
}
