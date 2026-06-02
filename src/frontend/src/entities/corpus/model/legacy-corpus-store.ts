/**
 * Legacy adapter around CorpusContext for existing search-era consumers.
 * New code should prefer useCurrentCorpus()/useCurrentCorpusData() directly where practical.
 */

import { ref } from 'vue';

import type { CorpusContext } from '@/entities/corpus/model/corpus-context';
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
	indexId: (): string => state.value?.id as string,
	corpus: (): NormalizedIndex => state.value!,
	allAnnotatedFields: (): NormalizedAnnotatedField[] => (state.value ? Object.values(state.value.annotatedFields) : []),
	allAnnotatedFieldsMap: (): Record<string, NormalizedAnnotatedField> => (state.value ? state.value.annotatedFields : {}),
	mainAnnotatedField: (): string => state.value?.mainAnnotatedField ?? 'contents',
	isParallelCorpus: (): boolean => get.allAnnotatedFields().some(f => f.isParallel),
	parallelAnnotatedFields: (): NormalizedAnnotatedFieldParallel[] => get.allAnnotatedFields().filter((f): f is NormalizedAnnotatedFieldParallel => f.isParallel),
	parallelAnnotatedFieldsMap: (): Record<string, NormalizedAnnotatedFieldParallel> => mapReduce(get.parallelAnnotatedFields(), 'id'),
	parallelFieldPrefix: (): string => get.parallelAnnotatedFields()[0]?.prefix ?? '',
	allAnnotations: (): NormalizedAnnotation[] => (state.value ? Object.values(state.value.annotatedFields[state.value.mainAnnotatedField].annotations) : []),
	allAnnotationsMap: (): Record<string, NormalizedAnnotation> => mapReduce(get.allAnnotations(), 'id'),
	allMetadataFields: (): NormalizedMetadataField[] => (state.value ? Object.values(state.value.metadataFields) : []),
	allMetadataFieldsMap: (): Record<string, NormalizedMetadataField> => (state.value ? state.value.metadataFields : {}),
	firstMainAnnotation: (): NormalizedAnnotation => get.allAnnotations().find(f => f.isMainAnnotation)!,
	metadataGroups: (): Array<NormalizedMetadataGroup & { fields: NormalizedMetadataField[] }> =>
		state.value
			? state.value.metadataFieldGroups.map(g => ({
					...g,
					fields: g.entries.map(id => state.value!.metadataFields[id]),
				}))
			: [],
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

const actions = {
	reset: () => {
		state.value = undefined;
	},
};

const init = (payload: CorpusContext) => {
	state.value = payload.index;
};

export { actions, get, getState, init };
export type { ModuleRootState };
