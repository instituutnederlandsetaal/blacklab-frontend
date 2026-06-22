import cloneDeep from 'clone-deep';

import * as CorpusModule from '@/features/corpus/model/corpus-state';
import type * as HistoryModule from '@/features/history/model/query-history-state';
// Form
import * as ExploreModule from '@/features/search/model/form/explore-state';
import type * as FilterModule from '@/features/search/model/form/filter-state';
import * as GapModule from '@/features/search/model/form/gap-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import * as PatternModule from '@/features/search/model/form/pattern-state';
// Results
import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
import * as ViewModule from '@/features/search/model/results/view-state';

import BaseUrlStateParser from './url-state-parser-base';
import type { ArticleUrlState } from './state-to-url';
import { emptyArticleUrlState } from './state-to-url';

/**
 * Decode the current url into a state payload for the article page.
 * Search form/results state is kept at defaults, while article state is restored from url.
 */
export default class UrlStateParserArticle extends BaseUrlStateParser<HistoryModule.HistoryEntry & { article: ArticleUrlState }> {
	public async get(): Promise<HistoryModule.HistoryEntry & { article: ArticleUrlState }> {
		const pattern = this.getString('patt') || this.getString('query') || null;
		// TODO figure out and document what is the canonical value, is 'field' legacy, I think so, but we need to look at the git history and document this. It was introduced when we implemented parallel search/documents.
		const sourceFromUrl = this.getString('searchfield') || this.getString('searchField') || this.getString('field');
		const allAnnotatedFields = CorpusModule.get.allAnnotatedFieldsMap();
		const source = sourceFromUrl && allAnnotatedFields[sourceFromUrl] ? sourceFromUrl : PatternModule.defaults.shared.source;

		return {
			filters: {} as FilterModule.ModuleRootState,
			gap: this.getString('pattgapdata') ? { value: this.getString('pattgapdata')! } : cloneDeep(GapModule.defaults),
			global: {
				sampleMode: GlobalResultsModule.getState().sampleMode,
				sampleSeed: GlobalResultsModule.getState().sampleSeed,
				sampleSize: GlobalResultsModule.getState().sampleSize,
				context: GlobalResultsModule.getState().context,
			},
			interface: {
				...cloneDeep(InterfaceModule.defaults),
				viewedResults: null,
			},
			view: cloneDeep(ViewModule.initialViewState),
			explore: cloneDeep(ExploreModule.defaults),
			patterns: {
				...cloneDeep(PatternModule.defaults),
				shared: {
					...cloneDeep(PatternModule.defaults.shared),
					source,
				},
				expert: {
					...cloneDeep(PatternModule.defaults.expert),
					query: pattern,
				},
			},
			article: this.article,
		};
	}

	private get article(): ArticleUrlState {
		const [, page, docId] = this.paths;
		if (!(page === 'docs' && docId)) {
			return { ...emptyArticleUrlState };
		}
		return {
			docId: page === 'docs' && docId ? docId : null,
			viewField: this.getString('field', null, v => v || null),
			wordend: this.getNumber('wordend'),
			wordstart: this.getNumber('wordstart'),
			findhit: this.getNumber('findhit'),
			pattern: this.getString('patt') || this.getString('query') || null,
			pattgapdata: this.getString('pattgapdata'),
			searchfield: this.getString('searchfield') || this.getString('searchField') || this.getString('field'),
		};
	}
}
