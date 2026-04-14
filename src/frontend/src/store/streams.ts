// Define a few pipelines to perform actions on streams of data
import URI from 'urijs';

import cloneDeep from 'clone-deep';
import { ReplaySubject, fromEvent, of } from 'rxjs';
import { filter, map, mergeMap } from 'rxjs/operators';

import * as RootStore from '@/store/';
import type * as ArticleStore from '@/store/article';
import * as CorpusStore from '@/store/corpus';
import * as ExploreStore from '@/store/form/explore';
import * as GapStore from '@/store/form/gap';
import * as PatternStore from '@/store/form/patterns';
import * as HistoryStore from '@/store/history';
import * as QueryStore from '@/store/query';
import * as ViewStore from '@/store/results/views';

import router from '@/route/router';
import { stateToUrl } from '@/url/state-to-url';
import UrlStateParserArticle from '@/url/url-state-parser-article';
import UrlStateParserSearch from '@/url/url-state-parser-search';

import type * as BLTypes from '@/types/blacklabtypes';
import { debugLogCat } from '@/utils/debug';
import jsonStableStringify from 'json-stable-stringify';

type QueryState = {
	indexId?: string|null,
	params?: BLTypes.BLSearchParameters,
	state: Pick<RootStore.RootState, 'query'|'interface'|'global'|'views'|'article'>
};

type BrowserHistoryEntry = HistoryStore.HistoryEntry&{article: ArticleStore.HistoryState};
const HISTORY_STATE_KEY = 'cfHistoryState';

const urlInputParameters$ = new ReplaySubject<QueryState>(1);

function decodeStateFromCurrentUrl(): Promise<HistoryStore.HistoryEntry&{article: ArticleStore.HistoryState}> {
	const pathSegments = new URI().segmentCoded().filter(s => !!s);
	const contextSegments = new URI(CONTEXT_URL).segmentCoded().filter(s => !!s);
	const relativeSegments = pathSegments.slice(contextSegments.length);
	const isArticleRoute = relativeSegments[1] === 'docs' && !!relativeSegments[2];
	return (isArticleRoute ? new UrlStateParserArticle() : new UrlStateParserSearch()).get();
}

function getStoredHistoryEntry(state: unknown): BrowserHistoryEntry|null {
	if (!state || typeof state !== 'object') {
		return null;
	}
	const typed = state as Record<string, unknown>;
	const nested = typed[HISTORY_STATE_KEY] as BrowserHistoryEntry|undefined;
	if (nested && typeof nested === 'object') {
		return nested;
	}
	if ('interface' in typed && 'patterns' in typed) {
		return typed as unknown as BrowserHistoryEntry;
	}
	return null;
}

function toRouterPath(url: string): string {
	const context = (CONTEXT_URL || '').replace(/\/+$/, '');
	if (!context || !url.startsWith(context)) {
		return url;
	}
	const relative = url.slice(context.length);
	return relative.length ? relative : '/';
}

function isNavigationDuplicated(err: unknown): boolean {
	if (!err || typeof err !== 'object') {
		return false;
	}
	const maybeError = err as {name?: string, message?: string};
	return maybeError.name === 'NavigationDuplicated' || (maybeError.message || '').includes('Avoided redundant navigation');
}

async function pushUrlWithHistoryState(url: string, state: BrowserHistoryEntry): Promise<void> {
	const target = toRouterPath(url);
	try {
		await router.push(target);
	} catch (e) {
		if (!isNavigationDuplicated(e)) {
			throw e;
		}
	}

	const existingState = (history.state && typeof history.state === 'object') ? history.state as Record<string, unknown> : {};
	history.replaceState({
		...existingState,
		[HISTORY_STATE_KEY]: state,
	}, '', undefined);
}


// Pipeline that will generate a new frontend URL and push it to the browser history whenever
// the root store state changes in a way that affects the query parameters.
urlInputParameters$.pipe(
	// Generate the new page url and add it to the data flowing through the stream
	map<QueryState, QueryState&{
		/**
		 * When the full url would be very long, we need to generate a truncated version (without the pattern and gap values, - which are often the longest part)
		 * This is an unfortunate side-effect of Tomcat being unable to handle large referrer headers (which contain the full url)
		 * and so blacklab-server will error out on any requests when the current url of the page is long enough.
		 * Additionally, loading the page from a long url is impossible too, because the front-end Tomcat instance also can't serve the page any longer.
		 */
		isTruncated: boolean;
		url: string;
	}>(v => {
		const full = stateToUrl({
			contextUrl: CONTEXT_URL,
			indexId: v.indexId,
			params: v.params,
			pattern: QueryStore.get.patternString(),
			gapValue: QueryStore.getState().gap?.value || null,
			searchField: QueryStore.get.sourceField().id,
			state: v.state,
		});
		return {
			url: full.url,
			isTruncated: full.isTruncated,
			state: v.state,
			params: v.params
		};
	}),
	// In the case the new url is identical to the current url, don't put it in history
	// We want to avoid pushing an identical url on to the history when you first load the page,
	// or went back and loaded older results.
	// (Or just when there are subtle differences such as a trailing slash or no trailing slash)
	filter(v => {
		// new urls are always generated without trailing slash (no empty trailing segment string)
		// while current url might contain one for whatever reason (if user just landed on page - tomcat injects it)
		// So strip it from the current url in order to properly compare.
		// also remove domain, port, protocol, since the new url may be generated without them.
		// if CONTEXT_URL (cfUrlExternal in blacklab-frontend.properties) doesn't contain them.
		// If we don't check this here, we might end up with a history entry for the same page, but with a different trailing slash, or even the exact same url.
		const curUrl = new URI().host('').protocol('').port('').toString().replace(/\/+$/, '');

		if (curUrl !== v.url) {
			return true;
		} else if (!v.isTruncated) {
			return false;
		}

		// New url is truncated, and is different from the previous url, but did the pattern change?
		// Might still be able to compare the patterns by checking the state from which it was generated
		// NOTE: history.state here is the browser's history entry state, we save it in this stream's subscribe handler
		const lastState = getStoredHistoryEntry(history.state);
		if (lastState == null) {
			// don't store; no previous state stored in history (i.e. the user just landed on the page, so it MUST be equal)
			// this can't actually happen I think, since if you just landed here, how did the url end up truncated
			// since the page can't even load with a url long enough to generate a state that would generate a truncated url.
			return false;
		}
		if (!lastState.interface || !lastState.patterns || !lastState.gap) {
			return true;
		}

		// shortcut: only need to check the pattern, as the interface state IS contained in the url, and is guaranteed to be the same
		// TODO double-check this, and document thought process better.
		return jsonStableStringify({formState: v.state.query.formState, gap: v.state.query.gap}) !== jsonStableStringify({formState: lastState.patterns[lastState.interface.patternMode], gap: lastState.gap});
	}),
	map((v): QueryState&{
		entry: BrowserHistoryEntry
		url: string,
	} => {
		const {query, views, global} = v.state;
		const activeView = v.state.interface.viewedResults ? views[v.state.interface.viewedResults] : undefined;
		// Store only those parts actively in use (so don't store the hits tab info when currently viewing docs for example)
		// the rest is set to defaults so the rest of the page nicely clears if this entry is loaded later.
		const entry: BrowserHistoryEntry = {
			filters: query.filters || {},
			global,
			view: activeView || cloneDeep(ViewStore.initialViewState),
			explore: query.form === 'explore' ? {
				...ExploreStore.defaults,
				[query.subForm]: query.formState
			} : ExploreStore.defaults,
			patterns: query.form === 'search' ? {
				...PatternStore.defaults,
				[query.subForm]: query.formState,
				shared: query.shared,
			} : PatternStore.defaults,
			interface: {
				form: query.form ? query.form : 'search',
				exploreMode: query.form === 'explore' ? query.subForm : 'ngram',
				patternMode: query.form === 'search' ? query.subForm : 'simple',
				viewedResults: v.state.interface.viewedResults,
				activeAnnotationTab: v.state.interface.activeAnnotationTab,
				activeFilterTab: v.state.interface.activeFilterTab,
			},
			gap: query.gap || GapStore.defaults,
			concepts: ConceptStore.defaults,
			glosses: GlossStore.defaults,
			article: {
				docId: v.state.article.docId,
				viewField: v.state.article.viewField,
				wordstart: v.state.article.wordstart,
				wordend: v.state.article.wordend,
				findhit: v.state.article.findhit,
			},
		};
		return {
			indexId: v.indexId,
			url: v.url,
			entry,
			state: v.state,
			params: v.params
		};
	})
)
.subscribe(v => {
	debugLogCat('history', 'Adding/updating query in query history, adding browser history entry, and reporting to ga', v.url, v.entry);
	const entryForQueryHistory: HistoryStore.HistoryEntry = {
		filters: v.entry.filters,
		global: v.entry.global,
		view: v.entry.view,
		explore: v.entry.explore,
		patterns: v.entry.patterns,
		interface: v.entry.interface,
		gap: v.entry.gap,
		concepts: v.entry.concepts,
		glosses: v.entry.glosses,
	};
	HistoryStore.actions.addEntry({
		entry: entryForQueryHistory,
		pattern: v.params && v.params.patt,
		url: v.url
	});
	debugLogCat('history', `Calling router.push (then replaceState) with entry:`, v.entry, `and url:`, v.url);
	pushUrlWithHistoryState(v.url, v.entry).catch(e => {
		console.error('Failed to push URL through router', e);
	});
});

/** Here we attach listeners to the vuex store, and pump the relevant values into the streams defined above. That in turn runs the listeners on those streams, and we can compute the stuff we need. */
export default () => {
	debugLogCat('init', 'Begin attaching store to url and subcorpus calculations.');

	// Because we use vuex-typex, getters are a little different
	// It doesn't matter though, they're attached to the same state instance, so just ignore the state argument.

	RootStore.store.watch(
		(state): QueryState => ({
			indexId: CorpusStore.get.indexId(),
			params: RootStore.get.blacklabParameters(),
			state: {
				views: state.views,
				global: state.global,
				article: state.article,
				interface: state.interface,
				query: state.query
			}
		}),
		(cur, prev) => {
			// update the frontend URL according to the changes in the store
			urlInputParameters$.next(cloneDeep(cur));
		},
		{
			immediate: true,
			deep: true
		}
	);

	fromEvent<PopStateEvent>(window, 'popstate')
	.pipe(mergeMap(evt => {
		const fromState = getStoredHistoryEntry(evt.state);
		return fromState ? of(fromState) : decodeStateFromCurrentUrl();
	}))
	.subscribe(state => RootStore.actions.replace(state));

	debugLogCat('init', 'Finished connecting store to url and subcorpus calculations.');
};
