/**
 * This module contains the corpus info as it's configured in blacklab.
 * We use it for pretty much everything to do with layout:
 * which annotations and filters are available, what is the default annotation (lemma/pos/word/etc...),
 * are the filters subdivided in groups, what is the text direction, and so on.
 */

import {getStoreBuilder} from 'vuex-typex';

import * as Api from '@/api';

import {RootState} from '@/store/';

import {NormalizedIndex, NormalizedAnnotation, NormalizedMetadataField, NormalizedAnnotatedField, NormalizedMetadataGroup, NormalizedAnnotationGroup, NormalizedAnnotatedFieldParallel} from '@/types/apptypes';
import { mapReduce } from '@/utils';
import { normalizeIndex } from '@/utils/blacklabutils';
import { combineLoadables, Empty, isEmpty, isError, isLoaded, isLoading, Loadable, loadableFromObservable, Loaded, mapLoaded, mergeMapLoaded, promiseFromLoadableStream, switchMapLoaded, toObservable } from '@/utils/loadable-streams';
import { combineLatest, distinct, distinctUntilChanged, filter, firstValueFrom, map, mergeMap, ReplaySubject, tap } from 'rxjs';

type ModuleRootState = Loadable<NormalizedIndex>;

const indexId$ = new ReplaySubject<string|null>(1);
const index$ = indexId$.pipe(
	distinctUntilChanged(),
	map((id): Loadable<string> => id ? Loaded(id) : Empty()),
	switchMapLoaded(id => combineLatest([
		toObservable(Api.frontend.getCorpus(id)),
		toObservable(Api.blacklab.getRelations(id)),
	] as const).pipe(map(combineLoadables))),
	mapLoaded(([index, relations]) => {
		const corpus = normalizeIndex(index, relations);
		// Filter bogus entries from groups (normally doesn't happen, but might happen when customjs interferes with the page).
		corpus.annotationGroups.forEach(g => g.entries = g.entries.filter(id => corpus.annotatedFields[g.annotatedFieldId].annotations[id]));
		corpus.metadataFieldGroups.forEach(g => g.entries = g.entries.filter(id => corpus.metadataFields[id]));
		return Object.freeze(corpus);
	}),
	// TODO yuck! Move to App component....
	tap(v => {
		if (isLoaded(v)) {
			const corpus = v.value;
			// Set displayname in navbar if it's currently a fallback.
			// (which is when search.xml doesn't specify a displayname)
			const displayNameInNavbar = document.querySelector('.navbar-brand')!;
			if (corpus.displayName && displayNameInNavbar.hasAttribute('data-is-fallback')) {
				displayNameInNavbar.innerHTML = corpus.displayName || corpus.id;
			}
		} else {
			// Reset displayname in navbar
			const displayNameInNavbar = document.querySelector('.navbar-brand')!;
			displayNameInNavbar.innerHTML = 'Corpus Frontend';
		}
	})
);

const namespace = 'corpus';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, loadableFromObservable(index$, []));
const getState = b.state();

const get = {
	loadingPromise(): Promise<NormalizedIndex|undefined> {
		return promiseFromLoadableStream(index$);
	},

	/** Util for when you're in a component where you are sure the corpus is loaded */
	corpus: b.read((state): NormalizedIndex => {
		if (!isLoaded(state)) { alert('Corpus not loaded'); throw new Error('Corpus not loaded'); }
		return state.value;
	}, 'corpus'),

	/** List of annotated fields */
	allAnnotatedFields: b.read((state): NormalizedAnnotatedField[] =>
		isLoaded(state) ? Object.values(state.value.annotatedFields) : []
	, 'allAnnotatedFields'),

	/** Map of annotated fields */
	allAnnotatedFieldsMap: b.read((state): Record<string, NormalizedAnnotatedField> =>
		isLoaded(state) ? state.value.annotatedFields : {}
	, 'allAnnotatedFieldsMap'),

	/** Main annotated field name */
	mainAnnotatedField: b.read((state): string =>
		isLoaded(state) ? state.value.mainAnnotatedField : 'contents'
	, 'mainAnnotatedField'),

	/** Is this a parallel corpus? */
	isParallelCorpus: b.read((state): boolean =>
		get.allAnnotatedFields().some(f => f.isParallel)
	, 'isParallelCorpus'),

	parallelAnnotatedFields: b.read((state): NormalizedAnnotatedFieldParallel[] =>
		get.allAnnotatedFields().filter((f): f is NormalizedAnnotatedFieldParallel => f.isParallel)
	, 'parallelAnnotatedFields'),

	parallelAnnotatedFieldsMap: b.read((state): Record<string, NormalizedAnnotatedFieldParallel> =>
		mapReduce(get.parallelAnnotatedFields(), 'id')
	, 'parallelAnnotatedFieldsMap'),


	/** If this is a parallel corpus, what's the parallel field prefix?
	 *  (e.g. "contents" if there's fields "contents__en" and "contents__nl")
	 *  There is only ever one.
	 */
	parallelFieldPrefix: b.read((state): string => { return get.parallelAnnotatedFields()[0]?.prefix ?? ''; }, 'parallelFieldPrefix'),

	/** All annotations, without duplicates and in no specific order */
	allAnnotations: b.read((state): NormalizedAnnotation[] =>
		isLoaded(state) ? Object.values(state.value.annotatedFields[state.value.mainAnnotatedField].annotations) : [], 'allAnnotations'),

	allAnnotationsMap: b.read((): Record<string, NormalizedAnnotation> => mapReduce(get.allAnnotations(), 'id'), 'allAnnotationsMap'),

	allMetadataFields: b.read((state): NormalizedMetadataField[] => isLoaded(state) ? Object.values(state.value.metadataFields) : [], 'allMetadataFields'),
	allMetadataFieldsMap: b.read((state): Record<string, NormalizedMetadataField> => isLoaded(state) ? state.value.metadataFields : {}, 'allMetadataFieldsMap'),

	// TODO there can be multiple main annotations if there are multiple annotatedFields
	// the ui needs to respect this (probably render more extensive results?)
	firstMainAnnotation: () => get.allAnnotations().find(f => f.isMainAnnotation)!,

	/**
	 * Returns all metadatagroups from the indexstructure, unless there are no metadatagroups defined.
	 * In that case a single generated group "metadata" is returned, containing all metadata fields.
	 * If groups are defined, fields not in any group are omitted.
	 */
	metadataGroups: b.read((state): Array<NormalizedMetadataGroup&{fields: NormalizedMetadataField[]}> =>
		isLoaded(state) ? state.value.metadataFieldGroups.map(g => ({
			...g,
			fields: g.entries.map(id => state.value.metadataFields[id])
		})) : [], 'metadataGroups'),

	/**
	 * Returns all annotationGroups from the indexstructure.
	 * May contain internal annotations if groups were defined through indexconfig.yaml.
	 */
	annotationGroups: b.read((state): Array<NormalizedAnnotationGroup&{fields: NormalizedAnnotation[]}> =>
		isLoaded(state) ? state.value.annotationGroups.map(g => ({
			...g,
			fields: g.entries.map(id => state.value.annotatedFields[g.annotatedFieldId].annotations[id]),
		})) : [], 'annotationGroups'),

	textDirection: b.read(state => isLoaded(state) ? state.value.textDirection : 'ltr', 'getTextDirection'),
	hasRelations: b.read(state => isLoaded(state) ? state.value.relations.relations != null : false, 'hasRelations'),
};

const actions = {
	// TODO should this just be a part of search.xml? It's such a fundamental part of the page setup.
	loadTagsetValues: b.commit((state, handler: () => void) => {
		// This is strange, this function is just so we're in a commit() and Vue doesn't throw a warning
		// about changing state outside of a mutation.
		handler();
	}, 'loadTagsetValues'),
	corpus: b.dispatch((state, corpusId: string|null) => {
		indexId$.next(corpusId);
		return promiseFromLoadableStream(index$);
	}, 'corpus')
};



const init = () => {}

export {
	ModuleRootState,
	NormalizedIndex,
	NormalizedAnnotatedField,
	NormalizedAnnotation,
	NormalizedMetadataField,

	getState,
	get,
	actions,
	init,

	namespace,
};
