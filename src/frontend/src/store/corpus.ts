/**
 * This module contains the corpus info as it's configured in blacklab.
 * We use it for pretty much everything to do with layout:
 * which annotations and filters are available, what is the default annotation (lemma/pos/word/etc...),
 * are the filters subdivided in groups, what is the text direction, and so on.
 */

import { getStoreBuilder } from 'vuex-typex';
import { RootState } from '@/store/';

import { NormalizedAnnotatedField, NormalizedAnnotatedFieldParallel, NormalizedAnnotation, NormalizedAnnotationGroup, NormalizedIndex, NormalizedMetadataField, NormalizedMetadataGroup } from '@/types/apptypes';
import { mapReduce } from '@/utils';
import { CorpusChange } from '@/store/async-loaders';

type ModuleRootState = NormalizedIndex|null;

const namespace = 'corpus';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, null);
const getState = b.state();

const get = {
	/**
	 * Util for when you're in a component where you are sure the corpus is loaded
	 * @deprecated this is an antipattern. Instead we should use the regular getters.
	 */
	corpus: b.read((state): NormalizedIndex => state!, 'corpus'),

	/** Get the indexId. Available before index has fully loaded. */
	// @ts-ignore
	indexId: b.read<string|null>((state, getters, rootState, rootGetters) => rootGetters.indexId, 'indexId'),

	/** List of annotated fields */
	allAnnotatedFields: b.read((state): NormalizedAnnotatedField[] =>
		state ? Object.values(state.annotatedFields) : []
	, 'allAnnotatedFields'),

	/** Map of annotated fields */
	allAnnotatedFieldsMap: b.read((state): Record<string, NormalizedAnnotatedField> =>
		state ? state.annotatedFields : {}
	, 'allAnnotatedFieldsMap'),

	/** Main annotated field name */
	mainAnnotatedField: b.read((state): string =>
		state ? state.mainAnnotatedField : 'contents'
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
		state ? Object.values(state.annotatedFields[state.mainAnnotatedField].annotations) : [], 'allAnnotations'),

	allAnnotationsMap: b.read((): Record<string, NormalizedAnnotation> => mapReduce(get.allAnnotations(), 'id'), 'allAnnotationsMap'),

	allMetadataFields: b.read((state): NormalizedMetadataField[] => state ? Object.values(state.metadataFields) : [], 'allMetadataFields'),
	allMetadataFieldsMap: b.read((state): Record<string, NormalizedMetadataField> => state ? state.metadataFields : {}, 'allMetadataFieldsMap'),

	// TODO there can be multiple main annotations if there are multiple annotatedFields
	// the ui needs to respect this (probably render more extensive results?)
	firstMainAnnotation: () => get.allAnnotations().find(f => f.isMainAnnotation)!,

	/**
	 * Returns all metadatagroups from the indexstructure, unless there are no metadatagroups defined.
	 * In that case a single generated group "metadata" is returned, containing all metadata fields.
	 * If groups are defined, fields not in any group are omitted.
	 */
	metadataGroups: b.read((state): Array<NormalizedMetadataGroup&{fields: NormalizedMetadataField[]}> =>
		state ? state.metadataFieldGroups.map(g => ({
			...g,
			fields: g.entries.map(id => state.metadataFields[id])
		})) : [], 'metadataGroups'),

	/**
	 * Returns all annotationGroups from the indexstructure.
	 * May contain internal annotations if groups were defined through indexconfig.yaml.
	 */
	annotationGroups: b.read((state): Array<NormalizedAnnotationGroup&{fields: NormalizedAnnotation[]}> =>
		state ? state.annotationGroups.map(g => ({
			...g,
			fields: g.entries.map(id => state.annotatedFields[g.annotatedFieldId].annotations[id]),
		})) : [], 'annotationGroups'),

	textDirection: b.read(state => state ? state.textDirection : 'ltr', 'getTextDirection'),
	hasRelations: b.read(state => state ? state.relations.relations != null : false, 'hasRelations'),
};

const actions = {
};

const init = b.dispatch(({state, rootState}, payload: CorpusChange) => rootState.corpus = payload.index ?? null, 'corpus_init');

export {
	actions, get, getState,
	// Root store needs to monitor loading state so it can properly initialize other parts of the app.
	init,
	ModuleRootState,
	namespace,
	NormalizedAnnotatedField,
	NormalizedAnnotation,
	NormalizedIndex,
	NormalizedMetadataField
};

