/**
 * This module contains the corpus info as it's configured in blacklab.
 * We use it for pretty much everything to do with layout:
 * which annotations and filters are available, what is the default annotation (lemma/pos/word/etc...),
 * are the filters subdivided in groups, what is the text direction, and so on.
 */

import { ref } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import type {
	NormalizedAnnotatedField,
	NormalizedAnnotatedFieldParallel,
	NormalizedAnnotation,
	NormalizedAnnotationGroup,
	NormalizedIndex,
	NormalizedMetadataField,
	NormalizedMetadataGroup,
} from '@/types/apptypes';

import { mapReduce } from '@/shared/utils/map-reduce';

type ModuleRootState = NormalizedIndex | undefined;

const state = ref<NormalizedIndex>();
const getState = (): ModuleRootState => state.value;

const get = {
	/**
	 * Util for when you're in a component where you are sure the corpus is loaded
	 * TODO also add a version on the root store that can return undefined properly,
	 * and use that in non-corpus scoped components instead of this.
	 */
	indexId: (): string => state.value?.id as string,

	/**
	 * Util for when you're in a component where you are sure the corpus is loaded
	 * @deprecated this is an antipattern. Instead we should use the regular getters and provide some empty defaults for when the corpus isn't loaded yet.
	 */
	corpus: (): NormalizedIndex => state.value!,

	/** List of annotated fields */
	allAnnotatedFields: (): NormalizedAnnotatedField[] => (state.value ? Object.values(state.value.annotatedFields) : []),

	/** Map of annotated fields */
	allAnnotatedFieldsMap: (): Record<string, NormalizedAnnotatedField> => (state.value ? state.value.annotatedFields : {}),

	/** Main annotated field name */
	mainAnnotatedField: (): string => state.value?.mainAnnotatedField ?? 'contents',

	/** Is this a parallel corpus? */
	isParallelCorpus: (): boolean => get.allAnnotatedFields().some(f => f.isParallel),

	parallelAnnotatedFields: (): NormalizedAnnotatedFieldParallel[] => get.allAnnotatedFields().filter((f): f is NormalizedAnnotatedFieldParallel => f.isParallel),

	parallelAnnotatedFieldsMap: (): Record<string, NormalizedAnnotatedFieldParallel> => mapReduce(get.parallelAnnotatedFields(), 'id'),

	/** If this is a parallel corpus, what's the parallel field prefix?
	 *  (e.g. "contents" if there's fields "contents__en" and "contents__nl")
	 *  There is only ever one.
	 */
	parallelFieldPrefix: (): string => get.parallelAnnotatedFields()[0]?.prefix ?? '',

	/** All annotations, without duplicates and in no specific order */
	allAnnotations: (): NormalizedAnnotation[] => (state.value ? Object.values(state.value.annotatedFields[state.value.mainAnnotatedField].annotations) : []),

	allAnnotationsMap: (): Record<string, NormalizedAnnotation> => mapReduce(get.allAnnotations(), 'id'),

	allMetadataFields: (): NormalizedMetadataField[] => (state.value ? Object.values(state.value.metadataFields) : []),
	allMetadataFieldsMap: (): Record<string, NormalizedMetadataField> => (state.value ? state.value.metadataFields : {}),

	firstMainAnnotation: (): NormalizedAnnotation => get.allAnnotations().find(f => f.isMainAnnotation)!,

	/**
	 * Returns all metadatagroups from the indexstructure, unless there are no metadatagroups defined.
	 * In that case a single generated group "metadata" is returned, containing all metadata fields.
	 * If groups are defined, fields not in any group are omitted.
	 */
	metadataGroups: (): Array<NormalizedMetadataGroup & { fields: NormalizedMetadataField[] }> =>
		state.value
			? state.value.metadataFieldGroups.map(g => ({
					...g,
					fields: g.entries.map(id => state.value!.metadataFields[id]),
				}))
			: [],
	/**
	 * Returns all annotationGroups from the indexstructure.
	 * May contain internal annotations if groups were defined through indexconfig.yaml.
	 */
	annotationGroups: (): Array<NormalizedAnnotationGroup & { fields: NormalizedAnnotation[] }> =>
		state.value
			? state.value.annotationGroups.map(g => ({
					...g,
					fields: g.entries.map(id => state.value!.annotatedFields[g.annotatedFieldId].annotations[id]),
				}))
			: [],

	textDirection: () => state.value?.textDirection ?? 'ltr',
	hasRelations: () => state.value?.relations.relations != null,
};

const actions = {};

const init = (payload: CorpusContext) => (state.value = payload.index);

export { actions, get, getState, init };
export type { ModuleRootState, NormalizedAnnotatedField, NormalizedAnnotation, NormalizedIndex, NormalizedMetadataField };
