import {getStoreBuilder} from 'vuex-typex';

import { RootState } from '@/store/search/';

import * as ExploreModule from '@/store/search/form/explore';
import * as FilterModule from '@/store/search/form/filters';
import * as InterfaceModule from '@/store/search/form/interface';
import * as PatternModule from '@/store/search/form/patterns';
import * as GapModule from '@/store/search/form/gap';
import * as GlossModule from '@/store/search/form/glossStore';
import * as ConceptModule from '@/store/search/form/conceptStore';
import * as TopicModule from '@/store/search/form/analyse/topic';
import * as ColloModule from '@/store/search/form/analyse/collocation';
import * as CooccurModule from '@/store/search/form/analyse/cooccur';
import * as WordlistMoudle from '@/store/search/form/analyse/wordlist';
import * as KeywordMoudle from '@/store/search/form/analyse/keyword';
import * as NetworkModule from '@/store/search/form/analyse/network';

type PartialRootState = {
	explore: ExploreModule.ModuleRootState;
	filters: FilterModule.FullModuleRootState;
	interface: InterfaceModule.ModuleRootState;
	patterns: PatternModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
	glosses: GlossModule.ModuleRootState;
	concepts: ConceptModule.ModuleRootState;
	topic: TopicModule.ModuleRootState;
	collocation: ColloModule.ModuleRootState;
	cooccur: CooccurModule.ModuleRootState;
	wordlist: WordlistMoudle.ModuleRootState;
	keyword: KeywordMoudle.ModuleRootState;
	network: NetworkModule.ModuleRootState;
};

type ResetState = {
	explore: ExploreModule.ModuleRootState;
	filters: FilterModule.ModuleRootState;
	interface: InterfaceModule.ModuleRootState;
	patterns: PatternModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
	glosses: GlossModule.HistoryState;
	concepts: ConceptModule.HistoryState;
	topic: TopicModule.ModuleRootState;
	collocation: ColloModule.ModuleRootState;
	cooccur: CooccurModule.ModuleRootState;
	wordlist: WordlistMoudle.ModuleRootState;
	keyword: KeywordMoudle.ModuleRootState;
	network: NetworkModule.ModuleRootState;
}

const b = getStoreBuilder<RootState>();

const get = {
	// nothing yet.
};

const actions = {
	reset: b.commit(() => {
		ExploreModule.actions.reset();
		FilterModule.actions.reset();
		InterfaceModule.actions.viewedResults(null);
		PatternModule.actions.reset();
		GapModule.actions.reset();
		GlossModule.actions.reset();
		ConceptModule.actions.reset();
		TopicModule.actions.reset();
		CooccurModule.actions.reset();
		ColloModule.actions.reset();
		WordlistMoudle.actions.reset();
		KeywordMoudle.actions.reset();
		NetworkModule.actions.reset();
	}, 'resetForm'),

	replace: b.commit((state, payload: ResetState) => {
		ExploreModule.actions.replace(payload.explore);
		FilterModule.actions.replace(payload.filters);
		PatternModule.actions.replace(payload.patterns);
		InterfaceModule.actions.replace(payload.interface);
		GapModule.actions.replace(payload.gap);
		GlossModule.actions.replace(payload.glosses);
		ConceptModule.actions.replace(payload.concepts);
		TopicModule.actions.replace(payload.topic);
		CooccurModule.actions.replace(payload.cooccur);
		ColloModule.actions.replace(payload.collocation);
		WordlistMoudle.actions.replace(payload.wordlist);
		KeywordMoudle.actions.replace(payload.keyword);
		NetworkModule.actions.replace(payload.network);
	}, 'replaceForm')
};

const init = () => {
	ExploreModule.init();
	FilterModule.init();
	InterfaceModule.init();
	PatternModule.init();
	GapModule.init();
	GlossModule.init();
	ConceptModule.init();
};

export {
	PartialRootState,

	get,
	actions,
	init,
};
