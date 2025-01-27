/**
 * This module contains the corpus info as it's configured in blacklab.
 * We use it for pretty much everything to do with layout:
 * which annotations and filters are available, what is the default annotation (lemma/pos/word/etc...),
 * are the filters subdivided in groups, what is the text direction, and so on.
 */

import { getStoreBuilder } from 'vuex-typex';

import * as Api from '@/api';

import { RootState } from '@/store/';

import { NormalizedAnnotatedField, NormalizedAnnotatedFieldParallel, NormalizedAnnotation, NormalizedAnnotationGroup, NormalizedIndex, NormalizedMetadataField, NormalizedMetadataGroup } from '@/types/apptypes';
import { mapReduce } from '@/utils';
import { normalizeIndex } from '@/utils/blacklabutils';
import { combineLoadableStreams, Loadable, loadableFromObservable, loadedIfNotNull, mapLoaded, repeatLatestWhen, switchMapLoaded, toObservable } from '@/utils/loadable-streams';
import { User } from 'oidc-client-ts';
import { BehaviorSubject, combineLatest, combineLatestWith, distinctUntilChanged, map, repeat, repeatWhen, shareReplay, switchMap, tap } from 'rxjs';

type ModuleRootState = Loadable<NormalizedIndex>;

const currentUser$ = new BehaviorSubject<User|null>(null);
const indexId$ = new BehaviorSubject<string|null>(null);
/** A way to retry loading from an external event. */
const retry$ = new BehaviorSubject<undefined>(undefined);
const index$ = combineLatest({user: currentUser$, indexId: indexId$}).pipe(
	distinctUntilChanged((a, b) => a.user === b.user && a.indexId === b.indexId),
	map(loadedIfNotNull('indexId')),
	repeatLatestWhen(retry$),
	// NO async behavior after this point,
	// otherwise the output of that async might occur after the next switchMap, which would be a bug.
	switchMapLoaded(({user, indexId}) =>
		combineLoadableStreams({
			index: toObservable(Api.frontend.getCorpus(indexId)),
			relations: toObservable(Api.blacklab.getRelations(indexId)),
		})
		.pipe(
			mapLoaded(({index, relations}) => {
				const corpus = normalizeIndex(index, relations);
				// Filter bogus entries from groups (normally doesn't happen, but might happen when customjs interferes with the page).
				corpus.annotationGroups.forEach(g => g.entries = g.entries.filter(id => corpus.annotatedFields[g.annotatedFieldId].annotations[id]));
				corpus.metadataFieldGroups.forEach(g => g.entries = g.entries.filter(id => corpus.metadataFields[id]));
				return Object.freeze(corpus);
			}),
			// TODO yuck! Move to App component....
			tap(v => {
				if (v.isLoaded()) {
					const corpus = v.value;
					// Set displayname in navbar if it's currently a fallback.
					// (which is when search.xml doesn't specify a displayname)
					const displayNameInNavbar = document.querySelector('.navbar-brand')!;
					if (corpus.displayName && displayNameInNavbar.hasAttribute('data-is-fallback')) {
						displayNameInNavbar.innerHTML = corpus.displayName || corpus.id;
					}
				} else if (v.isEmpty()) { // no corpus, reset displayname in navbar
					const displayNameInNavbar = document.querySelector('.navbar-brand')!;
					displayNameInNavbar.innerHTML = 'Corpus Frontend';
				}
			})
		)
	),
	// Make sure we don't run this multiple times if multiple subscribers are listening.
	shareReplay(1)
);

const namespace = 'corpus';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, loadableFromObservable(index$, []));
const getState = b.state();

const get = {
	/**
	 * Util for when you're in a component where you are sure the corpus is loaded
	 * @deprecated this is an antipattern. Instead we should use the regular getters.
	 */
	corpus: b.read((state): NormalizedIndex => {
		if (!state.isLoaded()) {
			debugger;
			alert('Corpus not loaded'); throw new Error('Corpus not loaded');
		}
		return state.value;
	}, 'corpus'),

	/** Get the indexId. Available before index has fully loaded. */
	corpusId: b.read(state => {
		/* NOTE: we must touch something in the state for reactivity to register
		 * (even though we don't use the value in this function)
		 * In practice, loading still will immediately switch when we set a new indexId
		 * So this function will response correctly as it immediately updates the returned indexId.
		 * But if we don't touch the state, it wouldn't ever update.
		 */
		return !state.isEmpty() ? indexId$.value : null
	}, 'corpusId'),

	/** List of annotated fields */
	allAnnotatedFields: b.read((state): NormalizedAnnotatedField[] =>
		state.isLoaded() ? Object.values(state.value.annotatedFields) : []
	, 'allAnnotatedFields'),

	/** Map of annotated fields */
	allAnnotatedFieldsMap: b.read((state): Record<string, NormalizedAnnotatedField> =>
		state.isLoaded() ? state.value.annotatedFields : {}
	, 'allAnnotatedFieldsMap'),

	/** Main annotated field name */
	mainAnnotatedField: b.read((state): string =>
		state.isLoaded() ? state.value.mainAnnotatedField : 'contents'
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
		state.isLoaded() ? Object.values(state.value.annotatedFields[state.value.mainAnnotatedField].annotations) : [], 'allAnnotations'),

	allAnnotationsMap: b.read((): Record<string, NormalizedAnnotation> => mapReduce(get.allAnnotations(), 'id'), 'allAnnotationsMap'),

	allMetadataFields: b.read((state): NormalizedMetadataField[] => state.isLoaded() ? Object.values(state.value.metadataFields) : [], 'allMetadataFields'),
	allMetadataFieldsMap: b.read((state): Record<string, NormalizedMetadataField> => state.isLoaded() ? state.value.metadataFields : {}, 'allMetadataFieldsMap'),

	// TODO there can be multiple main annotations if there are multiple annotatedFields
	// the ui needs to respect this (probably render more extensive results?)
	firstMainAnnotation: () => get.allAnnotations().find(f => f.isMainAnnotation)!,

	/**
	 * Returns all metadatagroups from the indexstructure, unless there are no metadatagroups defined.
	 * In that case a single generated group "metadata" is returned, containing all metadata fields.
	 * If groups are defined, fields not in any group are omitted.
	 */
	metadataGroups: b.read((state): Array<NormalizedMetadataGroup&{fields: NormalizedMetadataField[]}> =>
		state.isLoaded() ? state.value.metadataFieldGroups.map(g => ({
			...g,
			fields: g.entries.map(id => state.value.metadataFields[id])
		})) : [], 'metadataGroups'),

	/**
	 * Returns all annotationGroups from the indexstructure.
	 * May contain internal annotations if groups were defined through indexconfig.yaml.
	 */
	annotationGroups: b.read((state): Array<NormalizedAnnotationGroup&{fields: NormalizedAnnotation[]}> =>
		state.isLoaded() ? state.value.annotationGroups.map(g => ({
			...g,
			fields: g.entries.map(id => state.value.annotatedFields[g.annotatedFieldId].annotations[id]),
		})) : [], 'annotationGroups'),

	textDirection: b.read(state => state.isLoaded() ? state.value.textDirection : 'ltr', 'getTextDirection'),
	hasRelations: b.read(state => state.isLoaded() ? state.value.relations.relations != null : false, 'hasRelations'),
};

const actions = {
	// TODO should this just be a part of search.xml? It's such a fundamental part of the page setup.
	/**
	 * Implementation may look strange,
	 * but this function is just so we're in a commit() and Vue doesn't throw a warning
	 * when we modify displayNames in the corpus object.
	 * (that may be known in the tagset, but not in the corpus itself)
	 */
	loadTagsetValues: b.commit((state, handler: () => void) => handler(), 'loadTagsetValues'),
	corpus: (corpusId: string|null) => indexId$.next(corpusId),
	user: (user: User|null) => currentUser$.next(user),
	retry: () => retry$.next(undefined)
};

const init = () => {}

export {
	actions, get, getState,
	// Root store needs to monitor loading state so it can properly initialize other parts of the app.
	index$, init, ModuleRootState, namespace, NormalizedAnnotatedField,
	NormalizedAnnotation, NormalizedIndex, NormalizedMetadataField
};

