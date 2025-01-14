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
import { Empty, InteractiveLoadable, isLoadable, isLoaded, isLoading, Loadable, loadableFromObservable, LoadableState, Loaded, promiseFromLoadableStream as promiseFromLoadableStream, switchMapLoaded, toObservable } from '@/utils/loadable-streams';
import { distinct, distinctUntilChanged, filter, firstValueFrom, map, pipe, ReplaySubject, shareReplay, tap } from 'rxjs';
import {frontend} from '@/api';

type ModuleRootState = Loadable<Tagset>;
const namespace = 'tagset';

const indexId$ = new ReplaySubject<string|null>(1);
const tagset$ = indexId$.pipe(
	map((id): Loadable<string> => id ? Loaded(id) : Empty()),
	switchMapLoaded(id => toObservable(frontend.getTagset(id))),
	tap(v => {
		if (!isLoaded(v)) return;
		const tagset = v.value;
		const annots = CorpusStore.get.allAnnotationsMap();
		const mainAnnot = Object.values(annots).flat().find(a => a.uiType === 'pos');
		if (!mainAnnot) {
			// We don't have any annotation to attach the tagset to
			// Stop loading, and act as if no tagset was loaded (because it wasn't).
			console.warn(`Attempting to loading tagset when no annotation has uiType "pos". Cannot load!`);
			return;
		}

		validateTagset(mainAnnot, annots, tagset);
		lowercaseValuesIfNeeded(mainAnnot, annots, tagset);

		// we're modifying the corpus info here, so we need to commit the changes to the store.
		CorpusStore.actions.loadTagsetValues(() => {
			copyDisplaynamesAndValuesToCorpus(mainAnnot, Object.values(tagset.values));
			Object.values(tagset.subAnnotations).forEach(sub => copyDisplaynamesAndValuesToCorpus(annots[sub.id], sub.values));
		});
	}),
	shareReplay(1)
);

const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, loadableFromObservable(tagset$, []));

const getState = b.state();

const get = {};

const init = async (corpus: CorpusStore.NormalizedIndex|null) => {
	if (!corpus) indexId$.next(null);
	else {
		const mainAnnot = Object.values(CorpusStore.get.allAnnotations()).find(a => a.uiType === 'pos');
		if (!mainAnnot) indexId$.next(null);
		else indexId$.next(corpus.id);
	}
	return promiseFromLoadableStream(tagset$);
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
	init,

	namespace,
};
