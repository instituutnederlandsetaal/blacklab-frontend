/**
 * This module contains the corpus info as it's configured in blacklab.
 * We use it for pretty much everything to do with layout:
 * which annotations and filters are available, what is the default annotation (lemma/pos/word/etc...),
 * are the filters subdivided in groups, what is the text direction, and so on.
 */

import {getStoreBuilder} from 'vuex-typex';

import * as Api from '@/api';

import {RootState} from '@/store/search/';

import {NormalizedIndex, NormalizedAnnotation, NormalizedMetadataField, NormalizedAnnotatedField, NormalizedMetadataGroup, NormalizedAnnotationGroup, NormalizedAnnotatedFieldParallel} from '@/types/apptypes';
import { mapReduce } from '@/utils';
import { normalizeIndex } from '@/utils/blacklabutils';

type ModuleRootState = { corpus: NormalizedIndex|null };

const namespace = 'corpus';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, {corpus: null});

const getState = b.state();

const get = {

	/** List of annotated fields */
	allAnnotatedFields: b.read((state): NormalizedAnnotatedField[] =>
		Object.values(state.corpus?.annotatedFields ?? {}), 'allAnnotatedFields'),

	/** Map of annotated fields */
	allAnnotatedFieldsMap: b.read((state): Record<string, NormalizedAnnotatedField> =>
		state.corpus?.annotatedFields ?? {}, 'allAnnotatedFieldsMap'),

	/** Main annotated field name */
	mainAnnotatedField: b.read((state): string =>
		state.corpus?.mainAnnotatedField || 'contents', 'mainAnnotatedField'),

	/** Is this a parallel corpus? */
	isParallelCorpus: b.read((state): boolean =>
		get.allAnnotatedFields().some(f => f.isParallel), 'isParallelCorpus'),

	parallelAnnotatedFields: b.read((state): NormalizedAnnotatedFieldParallel[] => {
		return get.allAnnotatedFields().filter((f): f is NormalizedAnnotatedFieldParallel => f.isParallel);
	}, 'parallelAnnotatedFields'),

	parallelAnnotatedFieldsMap: b.read((state): Record<string, NormalizedAnnotatedFieldParallel> => {
		return mapReduce(get.parallelAnnotatedFields(), 'id');
	}, 'parallelAnnotatedFieldsMap'),


	/** If this is a parallel corpus, what's the parallel field prefix?
	 *  (e.g. "contents" if there's fields "contents__en" and "contents__nl")
	 *  There is only ever one.
	 */
	parallelFieldPrefix: b.read((state): string => { return get.parallelAnnotatedFields()[0]?.prefix ?? ''; }, 'parallelFieldPrefix'),

	/** All annotations, without duplicates and in no specific order */
	allAnnotations: b.read((state): NormalizedAnnotation[] => Object.values(state.corpus?.annotatedFields[state.corpus.mainAnnotatedField].annotations ?? {}), 'allAnnotations'),
	allAnnotationsMap: b.read((): Record<string, NormalizedAnnotation> => mapReduce(get.allAnnotations(), 'id'), 'allAnnotationsMap'),

	allMetadataFields: b.read((state): NormalizedMetadataField[] => Object.values(state.corpus?.metadataFields || {}), 'allMetadataFields'),
	allMetadataFieldsMap: b.read((state): Record<string, NormalizedMetadataField> => state.corpus?.metadataFields ?? {}, 'allMetadataFieldsMap'),

	// TODO there can be multiple main annotations if there are multiple annotatedFields
	// the ui needs to respect this (probably render more extensive results?)
	firstMainAnnotation: () => get.allAnnotations().find(f => f.isMainAnnotation)!,

	/**
	 * Returns all metadatagroups from the indexstructure, unless there are no metadatagroups defined.
	 * In that case a single generated group "metadata" is returned, containing all metadata fields.
	 * If groups are defined, fields not in any group are omitted.
	 */
	metadataGroups: b.read((state): Array<NormalizedMetadataGroup&{fields: NormalizedMetadataField[]}> => state.corpus?.metadataFieldGroups.map(g => ({
		...g,
		fields: g.entries.map(id => state.corpus!.metadataFields[id])
	})) ?? [], 'metadataGroups'),

	/**
	 * Returns all annotationGroups from the indexstructure.
	 * May contain internal annotations if groups were defined through indexconfig.yaml.
	 */
	annotationGroups: b.read((state): Array<NormalizedAnnotationGroup&{fields: NormalizedAnnotation[]}> => state.corpus?.annotationGroups.map(g => ({
		...g,
		fields: g.entries.map(id => state.corpus!.annotatedFields[g.annotatedFieldId].annotations[id]),
	})) ?? [], 'annotationGroups'),

	textDirection: b.read(state => state.corpus?.textDirection ?? 'ltr', 'getTextDirection'),

	hasRelations: b.read(state => state.corpus?.relations.relations != null, 'hasRelations'),
};

const actions = {
	// TODO should this just be a part of search.xml? It's such a fundamental part of the page setup.
	loadTagsetValues: b.commit((state, handler: (state: ModuleRootState) => void) => {
		handler(state);
	}, 'loadTagsetValues')
	// nothing here yet (probably never, indexmetadata should be considered immutable)
	// maybe just some things to customize displaynames and the like.
};

const privateActions = {
	setCorpus: b.commit((state, newState: ModuleRootState) => Object.assign(state, newState), 'setCorpus'),
}

/**
 * Expects the corpus-frontend api to be initialized.
 * Returned promise may contain ApiError if rejected.
 */
const init = () => Promise.all([Api.frontend.getCorpus(), Api.blacklab.getRelations(INDEX_ID)])
	.then(([index, relations]) => normalizeIndex(index, relations))
	.then(corpus => {
		// Set displayname in navbar if it's currently a fallback.
		// (which is when search.xml doesn't specify a displayname)
		const displayNameInNavbar = document.querySelector('.navbar-brand')!;
		if (corpus.displayName && displayNameInNavbar.hasAttribute('data-is-fallback')) {
			displayNameInNavbar.innerHTML = corpus.displayName || corpus.id;
		}

		// We to finish up some state that might be missing.
		if (corpus.documentCount === -1) {
			// Request a sum of all documents in the corpus
			Api.blacklab.getDocs(corpus.id, {
				first: 0,
				number: 0,
				waitfortotal: true
			})
			.request.then(r => {
				corpus.documentCount = r.summary.numberOfDocs;
			});
		}

		// Filter bogus entries from groups (normally doesn't happen, but might happen when customjs interferes with the page).
		corpus.annotationGroups.forEach(g => g.entries = g.entries.filter(id => corpus.annotatedFields[g.annotatedFieldId].annotations[id]));
		corpus.metadataFieldGroups.forEach(g => g.entries = g.entries.filter(id => corpus.metadataFields[id]));

		privateActions.setCorpus({corpus: Object.freeze(corpus)});
	})
	// can throw ApiError, caught in root store init function.


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
