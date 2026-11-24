import { stripIndent } from 'common-tags';
import URI from 'urijs';
import { shallowRef } from 'vue';

import { type CorpusContext } from '@/app/state/useCorpusContext';
import type { FormRuntime } from '@/features/form';
import { restoreSubmittedForm } from '@/features/search/bindings/search-form';
import { summarizeSubmittedSearch } from '@/features/search/model/search-summary';
import type { Corpus } from '@/types/apptypes';
import { queryHistoryDetails } from '@/url/query-history';
import { readSubmittedSearch } from '@/url/search-query';

import { debugLog } from '@/shared/debug/debug';
import { stableStringify } from '@/shared/utils/stable-stringify';
import { hashJavaDJB2 } from '@/shared/utils/string-utils';
import useInjectable from '@/shared/utils/useInjectable';

type FullHistoryEntry = {
	displayValues: { filters: string; pattern: string };
	hash: number;
	url: string;
	timestamp: number;
};

type ModuleRootState = FullHistoryEntry[];

export type HistoryEntryInput = { url: string; timestamp?: number; displayValues?: { pattern: string; filters: string } };
type HistoryUrlSummaryDecoder = (url: string) => Promise<HistoryEntryInput>;
export const [, provideHistoryImport, useHistoryImport] = useInjectable<(url: string) => Promise<void>>('history-import');
const version = 12;

type LocalStorageState = {
	indexLastModified: string;
	version: number;
	history: ModuleRootState;
};

// Track current corpus for localStorage keying
let corpus: Corpus | null = null;
function createEntry({ url, displayValues, timestamp = Date.now() }: HistoryEntryInput): FullHistoryEntry | null {
	const decoded = queryHistoryDetails(url);
	if (!decoded.viewedResults) return null;
	return Object.freeze({
		url: new URL(url, window.location.origin).toString(),
		timestamp,
		hash: hashJavaDJB2(stableStringify(decoded.identity)),
		displayValues: {
			pattern: displayValues?.pattern || decoded.pattern || '-',
			filters: displayValues?.filters || decoded.filters || '-',
		},
	});
}

function sameQuery(a: FullHistoryEntry, b: FullHistoryEntry) {
	if (a.hash !== b.hash) return false;
	return a.url === b.url || stableStringify(queryHistoryDetails(a.url).identity) === stableStringify(queryHistoryDetails(b.url).identity);
}

const state = shallowRef<ModuleRootState>([]);
const getState = () => state.value;

const get = {
	details: (entry: FullHistoryEntry) => {
		const { viewedResults, collocation, groupBy } = queryHistoryDetails(entry.url);
		return { viewedResults, collocation, groupBy };
	},
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
		const { groupBy, exportResults, hasGapValues } = queryHistoryDetails(entry.url);
		const fileContents = stripIndent`
			# Date: ${date}
			# Results: ${exportResults || '-'}
			# Pattern: ${entry.displayValues.pattern || '-'}
			# Filters: ${entry.displayValues.filters || '-'}
			# Grouping: ${groupBy.join(',')}
			# Contains gap values: ${hasGapValues ? 'yes' : 'no'}

			#####
			${btoa(JSON.stringify({ version, url: entry.url }).replace(/[\u0080-\uffff]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')))}
			#####`;
		return {
			file: new Blob([fileContents], { type: 'text/plain;charset=utf-8' }),
			fileName: `query_${date}.txt`,
		};
	},
	fromFile: async (file: Pick<File, 'name' | 'text'>) => {
		try {
			const contents = await file.text();
			const base64 = (contents.split('#####').at(-2) ?? contents).replace(/#.*(?:\r\n|\n|\r|$)/g, '').trim();
			const entry = JSON.parse(atob(base64));
			if (entry?.version == null || typeof entry.url !== 'string' || !entry.url) throw new Error('Cannot import: file does not appear to be a valid query.');
			return { url: entry.url as string };
		} catch (error) {
			debugLog('history', 'Cannot import query from file: ', file.name, error);
			throw new Error(`Could not read query file '${file.name}'.`);
		}
	},
};

const actions = {
	importUrl: async (url: string, decodeSummary: HistoryUrlSummaryDecoder) => {
		const targetCorpus = corpus;
		const entry = await decodeSummary(url);
		if (corpus === targetCorpus) actions.addEntry(entry);
	},
	addEntry: (entry: HistoryEntryInput) => {
		const fullEntry = createEntry(entry);
		if (!fullEntry) return;
		state.value = [fullEntry, ...state.value.filter(entry => !sameQuery(entry, fullEntry))].slice(0, 200);
		saveToLocalStorage(state.value);
	},
	removeEntry: (i: number) => {
		const entries = [...state.value];
		entries.splice(i, 1);
		state.value = entries;
		saveToLocalStorage(entries);
	},
	clear: () => {
		state.value = [];
		saveToLocalStorage(state.value);
	},
};

export function importSearchUrl(url: string, runtime: FormRuntime | null) {
	if (!corpus) return;
	const submitted = readSubmittedSearch(new URI(url).query(true));
	const summary = summarizeSubmittedSearch(submitted, runtime && restoreSubmittedForm(runtime, submitted).submittedResult);
	actions.addEntry({ url, displayValues: { pattern: summary.pattern || '', filters: summary.filter || '' } });
}

const init = (change: CorpusContext) => {
	corpus = change.index ?? null;
	state.value = readFromLocalStorage();
};

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
			debugLog('history', 'Index was modified in between saving and loading history, clearing history.');
			window.localStorage.removeItem(key);
			return [];
		}
		// Old entries already contain replayable URLs; drop their form snapshots on load.
		const entries = stored.history
			.filter(entry => typeof entry.url === 'string' && entry.url)
			.map(createEntry)
			.filter(entry => entry !== null)
			.filter((entry, index, entries) => entries.findIndex(other => sameQuery(other, entry)) === index);
		if (stored.version !== version) saveToLocalStorage(entries);
		return entries;
	} catch (e) {
		debugLog('history', 'Could not read search history from localstorage', e);
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

export { actions, get, getState, init, type FullHistoryEntry, type ModuleRootState };
