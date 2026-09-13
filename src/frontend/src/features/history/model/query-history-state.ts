/**
 * This module contains the history of executed queries.
 * A new entry is created every time the user executes a query,
 * but also when the user changes the grouping, and when they switch between viewing hits/documents.
 */

import { stripIndent } from 'common-tags';
import { shallowRef } from 'vue';

import { type CorpusContext } from '@/app/state/useCorpusContext';
import type { Corpus } from '@/types/apptypes';

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

export type HistoryEntryInput = Pick<FullHistoryEntry, 'url'> & Partial<Pick<FullHistoryEntry, 'timestamp' | 'displayValues'>>;
export type HistoryUrlDetails = {
	identity: unknown;
	viewedResults: string | null;
	collocation: boolean;
	groupBy: string[];
	pattern?: string;
	filters?: string;
	exportResults: string | null;
	hasGapValues: boolean;
};

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
let urlDecoder: ((url: string) => HistoryUrlDetails) | undefined;

const setUrlDecoder = (decode: (url: string) => HistoryUrlDetails) => {
	urlDecoder = decode;
};

function details(url: string): HistoryUrlDetails {
	if (!urlDecoder) throw new Error('Query history initialized without a URL decoder.');
	return urlDecoder(url);
}

function createEntry({ url, displayValues, timestamp = Date.now() }: HistoryEntryInput): FullHistoryEntry | null {
	const decoded = details(url);
	if (!decoded.viewedResults) return null;
	return Object.freeze({
		url,
		timestamp,
		hash: hashJavaDJB2(stableStringify(decoded.identity)),
		displayValues: {
			pattern: displayValues?.pattern || decoded.pattern || '-',
			filters: displayValues?.filters || decoded.filters || '-',
		},
	});
}

const state = shallowRef<ModuleRootState>([]);
const getState = () => state.value;

const get = {
	details: (entry: FullHistoryEntry) => {
		const { viewedResults, collocation, groupBy } = details(entry.url);
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
		const { groupBy, exportResults, hasGapValues } = details(entry.url);
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
		const entries = [fullEntry, ...state.value.filter(entry => entry.hash !== fullEntry.hash)].slice(0, 200);
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
			.filter((entry, index, entries) => entries.findIndex(other => other.hash === entry.hash) === index);
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

export { actions, get, getState, init, setUrlDecoder, type FullHistoryEntry, type ModuleRootState };
