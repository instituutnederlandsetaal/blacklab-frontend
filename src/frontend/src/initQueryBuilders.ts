// import 'bootstrap';
// import 'bootstrap-select';
// import 'bootstrap-select/dist/css/bootstrap-select.css';

import $ from 'jquery';

import {QueryBuilder, AttributeDef as QueryBuilderAttributeDef, QueryBuilderOptions} from '@/modules/cql_querybuilder';
import * as RootStore from '@/store/search/';
import * as CorpusStore from '@/store/search/corpus';
import * as UIStore from '@/store/search/ui';
import * as PatternStore from '@/store/search/form/patterns';
import debug, {debugLog} from '@/utils/debug';

import { getAnnotationSubset } from '@/utils';
import { Option } from './types/apptypes';
import { RootState } from './store/article';


function getSettings(i18n: Vue): QueryBuilderOptions {
	const annotationGroups = getAnnotationSubset(
		UIStore.getState().search.advanced.searchAnnotationIds,
		CorpusStore.get.annotationGroups(),
		CorpusStore.get.allAnnotationsMap(),
		'Search',
		i18n,
		CorpusStore.get.textDirection(),
		false,
		false
	).map(g => ({
		groupname: g.label!,
		options: (g.options as Option[]).map<QueryBuilderAttributeDef>(({value: annotationId, label: localizedAnnotationDisplayName, title: localizedAnnotationDescription}, i) => ({
			attribute: annotationId,
			caseSensitive: g.entries[i].caseSensitive,
			label: (localizedAnnotationDisplayName || annotationId) + (debug.debug ? ` [id: ${annotationId}]` : ''),
			textDirection: CorpusStore.get.textDirection(),
			values: g.entries[i].values
		}))
	}));

	const withinSelectOptions = UIStore.getState().search.shared.within.elements
		.filter(UIStore.corpusCustomizations.search.within.include)
		.map(opt => ({
			...opt,
			label: i18n.$tWithinDisplayName(opt) || 'document',
		}));


	return {
		queryBuilder: { view: { withinSelectOptions } },
		attribute: {
			view: {
				// Pass the available properties of tokens in this corpus (PoS, Lemma, Word, etc..) to the querybuilder
				attributes: annotationGroups.length > 1 ? annotationGroups : annotationGroups.flatMap(g => g.options),
				defaultAttribute: UIStore.getState().search.advanced.defaultSearchAnnotationId
			}
		}
	};
}


async function updateOrCreateBuilder(el: HTMLElement, i18n: Vue, getState: (state: RootStore.RootState) => string|null, setState: (v: string|null) => void) {
	let instance = $(el).data('builder') as QueryBuilder;
	if (instance) {
		await instance.refresh(getSettings(i18n));
	} else {
		instance = new QueryBuilder($(el), getSettings(i18n), i18n);
		
		// When store updates - put in builder.
		RootStore.store.watch(getState, v => {
			const pattern = instance.getCql();
			if (v !== pattern) instance.parse(v);
		});

		// Initial value.
		if (getState(RootStore.getState())) {
			instance.parse(getState(RootStore.getState()));
		} else {
			setState(instance.getCql());
		}
	}
	
	// When builder updates - put in store
	// Always do this, instance.element is replaced on refresh() TODO: fix that.
	instance.element.on('cql:modified', () => {
		const pattern = instance.getCql();
		setState(pattern);
	});
}

/** Create or update the querybuilders. */
export async function initQueryBuilders(i18n: Vue) {
	debugLog('Begin initializing querybuilder(s)');

	// Initialize configuration
	$('.querybuilder').toArray().forEach(async (el, i) => {
		// Index 0 is the source query, the rest are target queries
		// They're all stored in the same store, but the first one is stored in a different field
		// Abstract that away here.
		const getStateValue = 
			i === 0 ? (state: RootStore.RootState) => (state.patterns.advanced.query || '') : 
			(state: RootStore.RootState) => (state.patterns.advanced.targetQueries[i - 1] || '');
		const setStateValue = i === 0 ? PatternStore.actions.advanced.query : 
			(v: string) => PatternStore.actions.advanced.changeTargetQuery({ index: i - 1, value: v });

		await updateOrCreateBuilder(el, i18n, getStateValue, setStateValue);
	})
}

