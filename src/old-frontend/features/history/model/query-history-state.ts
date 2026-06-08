/**
 * This module contains the history of executed queries.
 * A new entry is created every time the user executes a query,
 * but also when the user changes the grouping, and when they switch between viewing hits/documents.
 */

import { stripIndent } from 'common-tags';
import jsonStableStringify from 'json-stable-stringify';
import URI from 'urijs';
import { markRaw, shallowRef } from 'vue';

import { debugLog } from '@/app/features/debug/debug';
import type { CorpusChange } from '@/app/plugins/installCorpusData';
import UrlStateParserSearch from '@/app/routes/urls/url-state-parser-search';
import type * as ExploreModule from '@/features/search/model/form/explore-state';
import type * as FilterModule from '@/features/search/model/form/filter-state';
import type * as PatternModule from '@/features/search/model/form/pattern-state';
import type * as GlobalModule from '@/features/search/model/results/global-results-state';
import type * as ViewModule from '@/features/search/model/results/view-state';
import type { NormalizedIndex } from '@/types/apptypes';

// Update the version whenever one of the properties in type HistoryEntry changes
// That is enough to prevent loading out-of-date history.
const version = 11;

type HistoryEntry = {
	// always set
	filters: {
		values: Record<string, FilterModule.FilterState['value']>;
		/** The lucene query */
		lucene: string;
		/** A human-readable summary of the filters */
		summary: string;
	};

	/** The state of the currently active view. */
	query: (
		| ({ form: 'pattern-simple' } & PatternModule.ModuleRootState['simple']['annotationValue'] & PatternModule.ModuleRootState['shared'])
		| ({ form: 'pattern-extended' } & PatternModule.ModuleRootState['extended'] & PatternModule.ModuleRootState['shared'])
		| ({ form: 'pattern-advanced' } & PatternModule.ModuleRootState['advanced'] & PatternModule.ModuleRootState['shared'])
		| ({ form: 'pattern-expert' } & PatternModule.ModuleRootState['expert'] & PatternModule.ModuleRootState['shared'])
		| ({ form: 'explore-corpora' } & ExploreModule.ModuleRootState['corpora'])
		| ({ form: 'explore-frequency' } & ExploreModule.ModuleRootState['frequency'])
		| ({ form: 'explore-ngram' } & ExploreModule.ModuleRootState['ngram'])
	) & {
		/** The raw cql string */
		patt: string | null;
		/** A human-readable summary of the query. */
		summary: string;
	};
	results: ViewModule.ViewRootState & { id: string } & GlobalModule.ModuleRootState;
};

type FullHistoryEntry = HistoryEntry & {
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
let corpus: NormalizedIndex | null = null;

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
			# Results: ${entry.query.form.startsWith('explore') ? entry.query.form : entry.results.id}
			# Pattern: ${entry.query.summary}
			# Filters: ${entry.filters.summary}
			# Grouping: ${entry.results.groupBy}
			# Contains gap values: ${entry.query.form === 'pattern-expert' && entry.query.gapValue ? 'yes' : 'no'}

			#####
			${btoa(JSON.stringify({ ...entry, version }))}
			#####`;

		const file = new Blob([fileContents], { type: 'text/plain;charset=utf-8' });
		return { file, fileName };
	},
	fromFile: (f: File) =>
		new Promise<FullHistoryEntry>((resolve, reject) => {
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

					if (originalEntry.version === version) {
						resolve(originalEntry);
						return;
					} else {
						// Roundtrip from url if not compatible.
						const entry = await new UrlStateParserSearch(new URI(originalEntry.url)).get();
						resolve({
							...entry,
							hash: originalEntry.hash,
							url: originalEntry.url,
							timestamp: originalEntry.timestamp,
						});
					}
				} catch (e) {
					debugLog('Cannot import query from file: ', f.name, e);
					reject(e);
				}
			};
			fr.readAsText(f);
		}),
};

const actions = {
	addEntry: (entry: HistoryEntry & { url: string }) => {
		// Should only contain items that uniquely identify a query
		// Normally this would only be the pattern (including gap values) and filters,
		// but we've agreed that grouping differently constitutes a new query, so we also need to compare those
		// Note that changing search field (source field in a parallel corpus) also constitute a new query,
		//  but target fields become part of the pattern, so don't need to be included here.
		const hashBase = {
			filters: entry.filters.lucene,
			fieldName: 'source' in entry.query ? entry.query.source : undefined,
			pattern: entry.query.cql,
			gap: entry.query.form === 'pattern-expert' ? entry.query.gapValue : undefined,
			groupBy: entry.results.groupBy.sort((l, r) => l.localeCompare(r)),
		};

		const fullEntry: FullHistoryEntry = Object.freeze(
			markRaw({
				...entry,
				hash: hashJavaDJB2(jsonStableStringify(hashBase)),
				url: entry.url,
				timestamp: new Date().getTime(),
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
