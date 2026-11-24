import { stripIndent } from 'common-tags';
import { shallowRef } from 'vue';
import { parseQuery } from 'vue-router';

import { type CorpusContext } from '@/app/state/useCorpusContext';
import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { FormRuntime } from '@/features/form';
import { restoreSubmittedForm } from '@/features/search/bindings/search-form';
import { summarizeSubmittedSearch } from '@/features/search/model/search-summary';
import type { Corpus } from '@/types/apptypes';
import { queryString } from '@/url/query';
import { readGroupBy, readSubmittedSearch } from '@/url/search-query';

import { debugLog } from '@/shared/debug/debug';
import { stableStringify } from '@/shared/utils/stable-stringify';

type HistoryEntryInput = { url: string; timestamp?: number; displayValues?: { pattern: string; filters: string } };
type FullHistoryEntry = Required<HistoryEntryInput> & {
	identity: string;
	viewedResults: string;
	groupBy: string[];
	collocation: boolean;
	exportResults: string | null;
	hasGapValues: boolean;
};
type ModuleRootState = FullHistoryEntry[];
const version = 12;

type LocalStorageState = {
	indexLastModified: string;
	version: number;
	history: HistoryEntryInput[];
};

// Track current corpus for localStorage keying
let corpus: Corpus | null = null;
function exportView(query: Record<string, unknown>, viewedResults: string | null) {
	const formId = queryString(query, 'f.form');
	const exportResults = (['corpora', 'frequency', 'ngram'] as const).find(mode => searchFormIds.exploreForm(mode) === formId) ?? viewedResults;
	try {
		const ui = JSON.parse(queryString(query, 'interface') ?? 'null');
		if (!formId && ui?.form === 'explore' && typeof ui.exploreMode === 'string') return ui.exploreMode as string;
	} catch {
		/* Older links may contain malformed interface state. */
	}
	return exportResults;
}

function createEntry({ url, displayValues, timestamp = Date.now() }: HistoryEntryInput, runtime?: FormRuntime | null): FullHistoryEntry | null {
	const uri = new URL(url, window.location.origin);
	const path = uri.pathname.split('/').filter(Boolean).map(decodeURIComponent);
	const viewedResults = path.at(-1);
	if (!viewedResults || path.at(-2) !== 'search') return null;
	const query = parseQuery(uri.search);
	const submitted = readSubmittedSearch(query);
	const { params, form } = submitted;
	const groupBy = params.colltype ? [] : readGroupBy(query);
	const summary = summarizeSubmittedSearch(submitted, runtime && restoreSubmittedForm(runtime, submitted).submittedResult);
	return Object.freeze({
		url: uri.href,
		timestamp,
		viewedResults,
		groupBy,
		collocation: !!params.colltype,
		hasGapValues: !!params.pattgapdata,
		exportResults: exportView(query, viewedResults),
		identity: stableStringify({ params, form, groupBy: [...groupBy].sort() }),
		displayValues: { pattern: displayValues?.pattern || summary.pattern || '-', filters: displayValues?.filters || summary.filter || '-' },
	});
}

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
		const { groupBy, exportResults, hasGapValues } = entry;
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
	addEntry: (entry: HistoryEntryInput, runtime?: FormRuntime | null) => {
		const fullEntry = createEntry(entry, runtime);
		if (!fullEntry) return;
		state.value = [fullEntry, ...state.value.filter(entry => entry.identity !== fullEntry.identity)].slice(0, 200);
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
			.map(entry => createEntry(entry))
			.filter(entry => entry !== null)
			.filter((entry, index, entries) => entries.findIndex(other => other.identity === entry.identity) === index);
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
		history: entries.map(({ url, timestamp, displayValues }) => ({ url, timestamp, displayValues })),
		indexLastModified: corpus.timeModified,
	};

	window.localStorage.setItem(key, JSON.stringify(stored));
};

export { actions, get, getState, init, type FullHistoryEntry, type ModuleRootState };
