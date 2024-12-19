/**
 * This module contains the corpus info as it's configured in blacklab.
 * We use it for pretty much everything to do with layout:
 * which annotations and filters are available, what is the default annotation (lemma/pos/word/etc...),
 * are the filters subdivided in groups, what is the text direction, and so on.
 */

import Axios from 'axios';
import {getStoreBuilder} from 'vuex-typex';

import {RootState} from '@/store/';
import * as CorpusStore from '@/store/corpus';

import { NormalizedAnnotation, Tagset } from '@/types/apptypes';

import { mapReduce } from '@/utils';

type ModuleRootState = Tagset&{
	/** Uninitialized before init() or load() action called. loading/loaded during/after load() called. Disabled when load() not called before init(), or loading failed for any reason. */
	state: 'uninitialized'|'loading'|'loaded'|'disabled';
	message: string;
	/**
	 * Url from which the tagset will be loaded on initialization.
	 * We must defer initialization because corpus info first has the be downloaded from the server.
	 * We need that to validate the contents of the tagset (which annotations exist, which values are valid, etc...)
	 * So that users can't create queries that won't work.
	 * (we don't _have_ to do that, but it would make creating and debugging a tagset pretty difficult)
	 */
	url: string|null;
};

const namespace = 'tagset';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, {
	state: 'uninitialized',
	url: null,
	message: '',
	subAnnotations: {},
	values: {}
});

const getState = b.state();

const get = {
	isLoaded: b.read(state => state.state === 'loaded', 'tagset_loaded'),
	isLoading: b.read(state => state.state === 'loading', 'tagset_loading'),
};

const internalActions = {
	state: b.commit((state, payload: {state: ModuleRootState['state'], message: string}) => Object.assign(state, payload), 'state'),
	replace: b.commit((state, payload: Tagset) => Object.assign(state, payload), 'replace')
};

const actions = {
	/** Load the tagset from the provided url. This should be called prior to decoding the page url. */
	load: b.commit((state, url: string) => state.url = url, 'load'),
};

const init = async () => {
	const state = getState();
	if (state.state !== 'uninitialized') {
		return Promise.resolve();
	}
	if (!state.url) {
		internalActions.state({state: 'disabled', message: 'No tagset loaded.\n Call "vuexModules.tagset.actions.load(CONTEXT_URL + /static/${path_to_tagset.json}) from custom js file before $document.ready()'});
		return Promise.resolve();
	}

	// by now the corpus module should be initialized.
	// the url should be set.
	// load the tagset.

	internalActions.state({state: 'loading', message: 'Loading tagset...'});
	return Axios.get<Tagset>(state.url, {
		// Remove comment-lines in the returned json. (that's not strictly allowed by JSON, but we chose to support it)
		transformResponse: [(r: string) => r.replace(/\/\/.*[\r\n]+/g, '')].concat(Axios.defaults.transformResponse!)
	})
	.then(t => {
		const tagset = t.data;
		const annots = CorpusStore.get.allAnnotationsMap();
		const mainAnnot = Object.values(annots).flat().find(a => a.uiType === 'pos');
		if (!mainAnnot) {
			// We don't have any annotation to attach the tagset to
			// Stop loading, and act as if no tagset was loaded (because it wasn't).
			console.warn(`Attempting to loading tagset when no annotation has uiType "pos". Cannot load!`);
			internalActions.state({state: 'disabled', 'message': 'No annotation has uiType "pos". Cannot load tagset.'});
			return;
		}

		validateTagset(mainAnnot, annots, tagset);
		lowercaseValuesIfNeeded(mainAnnot, annots, tagset);

		// we're modifying the corpus info here, so we need to commit the changes to the store.
		CorpusStore.actions.loadTagsetValues(() => {
			copyDisplaynamesAndValuesToCorpus(mainAnnot, Object.values(tagset.values));
			Object.values(tagset.subAnnotations).forEach(sub => copyDisplaynamesAndValuesToCorpus(annots[sub.id], sub.values));
		});
		internalActions.replace(tagset);
	})
	.then(() => internalActions.state({state: 'loaded', message: ''}))
	.catch(e => {
		console.warn('Could not load tagset: ' + e.message);
		internalActions.state({state: 'disabled', message: 'Error loading tagset: ' + e.message});
	});

};

/**
 * Copy displaynames and extra values defined in the tagset into the corpus info.
 * This way any annotation that is defined in the tagset will have the same displaynames and values in the corpus info.
 * That creates a uniform experience in all components that display those annotations.
 */
function copyDisplaynamesAndValuesToCorpus(annotation: NormalizedAnnotation, valuesInTagset: Array<{value: string, displayName: string}>) {
	const originalValues = mapReduce(annotation.values, 'value');

	for (const tagsetValue of valuesInTagset) {
		const a = originalValues[tagsetValue.value];
		const b = tagsetValue;

		const value = a ? a.value : b.value;
		const label = b.displayName || b.value;
		const title = a ? a.title : null;

		originalValues[value] = {
			value,
			label,
			title
		};
	}
	// Now we have (potentially) have new displaynames and values, sort the values again.
	// preserve the original order where possible.
	annotation.values = Object.values(originalValues)
	.sort((a, b) =>
		annotation.values ?
			annotation.values.findIndex(v => v.value === a.value) -
			annotation.values.findIndex(v => v.value === b.value) :
			0
	);

	// Since we now have an exhaustive list of all values for the annotation, we can change the uiType to 'select'.
	if (annotation.uiType === 'text') {
		annotation.uiType = 'select';
	}
}

/**
 * Sometimes an annotation in the corpus is case-insensitive, but the tagset is case-sensitive.
 * In that case, we need to lowercase all values in the tagset.
 * It doesn't matter for query-generation purposes,
 * but the tagset usually contains nice display names for all annotation values,
 * and we can only copy them into the corpus annotations if the values match exactly.
 * So we lowercase the values in the tagset if the annotation in the corpus is case-insensitive.
 *
 * Only do this after validating the tagset, because we don't check whether annotations in the tagset and corpus match, so we could crash if they don't.
 */
function lowercaseValuesIfNeeded(mainTagsetAnnotation: NormalizedAnnotation, corpusAnnotations: Record<string, NormalizedAnnotation>, tagset: Tagset) {
	// for the main tagset annotations - lowercase values if the annotation in the corpus is not case sensitive.
	const mainAnnotationCS = mainTagsetAnnotation.caseSensitive;
	if (!mainAnnotationCS) {
		for (const key in tagset.values) tagset.values[key].value = tagset.values[key].value.toLowerCase();
	}

	for (const id in tagset.subAnnotations) {
		const cs = corpusAnnotations[id].caseSensitive;
		if (cs) continue;
		for (const value of tagset.subAnnotations[id].values) {
			// lowercase the value
			value.value = value.value.toLowerCase();
			// lowercase references to main-pos values too
			if (value.pos && !mainAnnotationCS)
				value.pos = value.pos.map(v => v.toLowerCase());
		}
	}
}


/**
 * Tagsets are tightly coupled to the contents of one or more of the part-of-speech annotations in the corpus.
 * Check that all annotations defined in the tagset actually exist in the corpus, throws an error if they don't.
 * Also validate internal constraints: that the main annotation doesn't reference any subannotations that don't exist,
 * and that the subannotations don't reference any main-pos values that don't exist.
 * Finally also warn if values for an annotation in the tagset values don't match the values in the corpus.
 *
 * @param mainTagsetAnnotation The annotation that the tagset is attached to.
 * @param t The tagset to validate.
 */
function validateTagset(mainTagsetAnnotation: NormalizedAnnotation, otherAnnotations: Record<string, NormalizedAnnotation>, t: Tagset) {
	/** Validate that subannotations exist within the corpus, and that they don't reference unknown values within the main annotation */
	function validateAnnotation(annotationId: string, annotationValuesInTagset: Tagset['subAnnotations'][string]['values']) {
		const annotationInCorpus = otherAnnotations[annotationId];
		if (!annotationInCorpus) {
			throw new Error(`Annotation "${annotationId}" does not exist in the corpus, but is referenced in the tagset.`);
		}

		if (!annotationInCorpus.values) {
			throw new Error(`Annotation "${annotationId}" does not have any known values in the corpus, but is referenced in the tagset.`);
		}

		// part-of-speech is almost always indexed case-insensitive
		// so we always want to compare values in the tagset and values in the corpus in lowercase
		const annotationValuesInCorpus = mapReduce(annotationInCorpus.values, 'value');
		annotationValuesInTagset.forEach(v => {
			if (!annotationValuesInCorpus[annotationInCorpus.caseSensitive ? v.value : v.value.toLowerCase()]) {
				console.warn(`Annotation "${annotationId}" may have value "${v.value}" which does not exist in the corpus.`);
			}

			if (v.pos) {
				const unknownPosList = v.pos.filter(pos => !t.values[pos]);
				if (unknownPosList.length > 0) {
					console.warn(`SubAnnotation '${annotationId}' value '${v.value}' declares unknown main-pos value(s): ${unknownPosList.toString()}`);
				}
			}
		});
	}

	// validate the root annotation
	validateAnnotation(mainTagsetAnnotation.id, Object.values(t.values));
	// validate all subannotations
	Object.values(t.subAnnotations).forEach(sub => validateAnnotation(sub.id, sub.values));

	// validate that the main annotation doesn't reference any subannotations that don't exist
	Object.values(t.values).forEach(({value, subAnnotationIds}) => {
		const subAnnotsNotInTagset = subAnnotationIds.filter(id => t.subAnnotations[id] == null);
		if (subAnnotsNotInTagset.length) {
			throw new Error(`Value "${value}" declares subAnnotation(s) "${subAnnotsNotInTagset}" that do not exist in the tagset.`);
		}

		const subAnnotsNotInCorpus = subAnnotationIds.filter(subId => otherAnnotations[subId] == null);
		if (subAnnotsNotInCorpus.length) {
			throw new Error(`Value "${value}" declares subAnnotation(s) "${subAnnotsNotInCorpus}" that do not exist in the corpus.`);
		}
	});
}

export {
	ModuleRootState,
	Tagset,

	getState,
	get,
	actions,
	init,

	namespace,
};
