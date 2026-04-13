import cloneDeep from 'clone-deep';

import BaseUrlStateParser from './url-state-parser-base';

import * as CorpusModule from '@/store/corpus';
import type * as HistoryModule from '@/store/history';

// Form
import type * as FilterModule from '@/store/form/filters';
import * as InterfaceModule from '@/store/form/interface';
import * as PatternModule from '@/store/form/patterns';
import * as ExploreModule from '@/store/form/explore';
import * as GapModule from '@/store/form/gap';
import * as ConceptModule from '@/store/form/conceptStore';
import * as GlossModule from '@/store/form/glossStore';

// Results
import * as ViewModule from '@/store/results/views';
import * as GlobalResultsModule from '@/store/results/global';

// Article
import * as ArticleStore from '@/store/article';

/**
 * Decode the current url into a state payload for the article page.
 * Search form/results state is kept at defaults, while article state is restored from url.
 */
export default class UrlStateParserArticle extends BaseUrlStateParser<HistoryModule.HistoryEntry&{article: ArticleStore.HistoryState}> {
	public async get(): Promise<HistoryModule.HistoryEntry&{article: ArticleStore.HistoryState}> {
		const pattern = this.getString('patt') || this.getString('query') || null;
		const sourceFromUrl = this.getString('searchField') || this.getString('searchfield') || this.getString('field');
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
			concepts: cloneDeep(ConceptModule.defaults),
			glosses: cloneDeep(GlossModule.defaults),
			article: this.article,
		};
	}

	private get article(): ArticleStore.HistoryState {
		const [, page, docId] = this.paths;
		if (!(page === 'docs' && docId)) {
			return cloneDeep(ArticleStore.initialHistoryState);
		}
		return {
			docId: page === 'docs' && docId ? docId : null,
			viewField: this.getString('field', null, v => v || null),
			wordend: this.getNumber('wordend'),
			wordstart: this.getNumber('wordstart'),
			findhit: this.getNumber('findhit'),
		};
	}
}
