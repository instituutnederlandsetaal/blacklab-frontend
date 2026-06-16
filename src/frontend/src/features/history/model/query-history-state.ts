/**
 * This module contains the history of executed queries.
 * A new entry is created every time the user executes a query,
 * but also when the user changes the grouping, and when they switch between viewing hits/documents.
 */

import { stripIndent } from 'common-tags';
import jsonStableStringify from 'json-stable-stringify';
import URI from 'urijs';
import { markRaw, shallowRef } from 'vue';

import type { CorpusChange } from '@/api/async/logic/corpus/corpus-data-from-id';
import * as UIModule from '@/app/state/ui-state';
import { getFilterSummary } from '@/components/filters/filterValueFunctions';
import * as CorpusModule from '@/features/corpus/model/corpus-state';
import type * as ExploreModule from '@/features/search/model/form/explore-state';
import type * as FilterModule from '@/features/search/model/form/filter-state';
import type * as GapModule from '@/features/search/model/form/gap-state';
import type * as InterfaceModule from '@/features/search/model/form/interface-state';
import type * as PatternModule from '@/features/search/model/form/pattern-state';
import type * as GlobalModule from '@/features/search/model/results/global-results-state';
import type * as ViewModule from '@/features/search/model/results/view-state';
import UrlStateParserSearch from '@/url/url-state-parser-search';
import { debugLog } from '@/utils/debug';
import { getPatternSummaryExplore, getPatternSummarySearch } from '@/utils/pattern-utils';

import { hashJavaDJB2 } from '@/shared/utils/string-utils';

// Update the version whenever one of the properties in type HistoryEntry changes
// That is enough to prevent loading out-of-date history.
const version = 10;

type HistoryEntry = {
	// always set
	filters: FilterModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
	global: GlobalModule.ExternalModuleRootState;
	interface: InterfaceModule.ModuleRootState;

	/** The state of the currently active view.
	Name of the active view is contained in interface.viewedResults */
	view: ViewModule.ViewRootState;

	// Depending on interface.form, one of these should contain the values, the other contains defaults.
	// Depending on interface.subForm, one of the subproperties is set, the others contain defaults.
	// (in order to reset inactive parts of the page)
	patterns: PatternModule.ModuleRootState;
	explore: ExploreModule.ModuleRootState;
};

/** Intermediate type between HistoryEntry and FullHistoryEntry used in a few places */
export type HistoryEntryPatternAndUrl = {
	entry: HistoryEntry;
	pattern?: string;
	url: string;
};

type FullHistoryEntry = HistoryEntry & {
	/** String representations of the query, for simpler displaying of the entry in UI */
	displayValues: {
		filters: string;
		pattern: string;
	};

	hash: number;
	url: string;
	timestamp: number;
};

type ModuleRootState = FullHistoryEntry[];

type LocalStorageState = {
	indexLastModified: string;
	version: number;
	history: ModuleRootState;
};

// Track current corpus for localStorage keying
let corpus: CorpusModule.NormalizedIndex | null = null;

// Shallow ref: entries are frozen+markRaw, so no deep reactivity needed.
// We replace the array reference when entries change.
const state = shallowRef<ModuleRootState>([]);
const getState = () => state.value;

const get = {
	asFile: (entry: FullHistoryEntry) => {
		const date = new Date().toLocaleString('en-EN', {
			hour12: false,
			year: '2-digit',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});

		const fileName = `query_${date}.txt`;
		const fileContents = stripIndent`
			# Date: ${date}
			# Results: ${entry.interface.form === 'search' ? entry.interface.viewedResults : entry.interface.exploreMode || '-'}
			# Pattern: ${entry.displayValues.pattern || '-'}
			# Filters: ${entry.displayValues.filters || '-'}
			# Grouping: ${entry.view.groupBy}
			# Contains gap values: ${entry.gap.value ? 'yes' : 'no'}

			#####
			${btoa(JSON.stringify(Object.assign({ version }, entry)))}
			#####`;

		const file = new Blob([fileContents], { type: 'text/plain;charset=utf-8' });
		return { file, fileName };
	},
	fromFile: (f: File) =>
		new Promise<{ entry: HistoryEntry; pattern: string; url: string }>((resolve, reject) => {
			const fr = new FileReader();
			fr.onload = async function () {
				try {
					const base64 = (fr.result as string).replace(/#.*(?:\r\n|\n|\r|$)/g, '').trim();
					let originalEntry: FullHistoryEntry & { version: number };
					try {
						originalEntry = JSON.parse(atob(base64));
					} catch {
						throw new Error(`Could not read query file '${f.name}'.`);
					}
					if (!originalEntry || originalEntry.version == null) {
						throw new Error('Cannot import: file does not appear to be a valid query.');
					}

					// Roundtrip from url if not compatible.
					const entry = originalEntry.version === version ? originalEntry : await new UrlStateParserSearch(new URI(originalEntry.url)).get();

					resolve({
						entry,
						pattern: originalEntry.displayValues.pattern,
						url: originalEntry.url,
					});
				} catch (e) {
					debugLog('Cannot import query from file: ', f.name, e);
					reject(e);
				}
			};
			fr.readAsText(f);
		}),
};

const actions = {
	addEntry: ({ entry, pattern, url }: HistoryEntryPatternAndUrl) => {
		// history is updated together with page url, so we don't always receive a state we need to store.
		if (entry.interface.viewedResults == null) {
			return;
		}

		// Order needs to be consistent or hash will be different.
		const filterSummary: string | undefined = getFilterSummary(Object.values(entry.filters).sort((l, r) => l.id.localeCompare(r.id)));
		const defaultAlignBy = UIModule.getState().search.shared.alignBy.defaultValue;
		const patternSummary: string | undefined =
			entry.interface.form === 'search'
				? getPatternSummarySearch(entry.interface.patternMode, entry.patterns, defaultAlignBy, entry.filters)
				: entry.interface.form === 'explore'
					? getPatternSummaryExplore(entry.interface.exploreMode, entry.explore, CorpusModule.get.allAnnotationsMap())
					: undefined;

		// Should only contain items that uniquely identify a query
		// Normally this would only be the pattern (including gap values) and filters,
		// but we've agreed that grouping differently constitutes a new query, so we also need to compare those
		// Note that changing search field (source field in a parallel corpus) also constitute a new query,
		//  but target fields become part of the pattern, so don't need to be included here.
		const hashBase = {
			filters: entry.filters,
			fieldName: entry.patterns.shared.source,
			pattern,
			gap: entry.gap,
			groupBy: entry.view.groupBy.sort((l, r) => l.localeCompare(r)),
		};

		const fullEntry: FullHistoryEntry = Object.freeze(
			markRaw({
				...entry,
				hash: hashJavaDJB2(jsonStableStringify(hashBase)),
				url,
				timestamp: new Date().getTime(),
				displayValues: {
					filters: filterSummary || '-',
					pattern: patternSummary || '-',
				},
			}),
		);

		const entries = [...state.value];
		const i = entries.findIndex(v => v.hash === fullEntry.hash);
		if (i !== -1) {
			entries.splice(i, 1);
		}
		entries.unshift(fullEntry);
		entries.splice(200);
		state.value = entries;
		saveToLocalStorage(entries);
	},
	removeEntry: (i: number) => {
		const entries = [...state.value];
		entries.splice(i, 1);
		state.value = entries;
		saveToLocalStorage(entries);
	},
	clear: () => {
		state.value = [];
		saveToLocalStorage([]);
	},
};

const init = (change: CorpusChange) => {
	corpus = change.index ?? null;
	state.value = readFromLocalStorage();
};

/**
 * Load the history for a given index, if it exists and the corpus wasn't modified since saving.
 * @param indexId the index for which to read query history
 * @param indexTimeModified when the index was last modified (as reported by BlackLab)
 * @returns the history, or null if it could not be read
 */
const readFromLocalStorage = (): ModuleRootState => {
	if (!window.localStorage || !corpus?.id || !corpus?.timeModified) {
		return [];
	}

	const key = `cf/history/${corpus.id}`;
	const historyJson = window.localStorage.getItem(key);
	if (historyJson == null) {
		return [];
	}

	try {
		const stored: LocalStorageState = JSON.parse(historyJson);
		if (stored.indexLastModified !== corpus.timeModified) {
			debugLog('Index was modified in between saving and loading history, clearing history.');
			window.localStorage.removeItem(key);
			return [];
		}
		if (stored.version !== version) {
			debugLog(`History out of date: read version ${stored.version}, current version ${version}, clearing history.`);
			window.localStorage.removeItem(key);
			return [];
		}
		return stored.history;
	} catch (e) {
		debugLog('Could not read search history from localstorage', e);
		return [];
	}
};

const saveToLocalStorage = (entries: ModuleRootState) => {
	if (!window.localStorage || !corpus?.id || !corpus?.timeModified) {
		return;
	}

	const key = `cf/history/${corpus.id}`;
	const stored: LocalStorageState = {
		version,
		history: entries,
		indexLastModified: corpus.timeModified,
	};

	window.localStorage.setItem(key, JSON.stringify(stored));
};

export { actions, get, getState, init, type FullHistoryEntry, type HistoryEntry, type ModuleRootState };
