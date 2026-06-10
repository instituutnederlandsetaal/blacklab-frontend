/**
 * Legacy adapter around CorpusContext for existing search-era consumers.
 * New code should prefer useCurrentCorpus()/useCurrentCorpusData() directly where practical.
 */

import { computed, reactive, toRef, type MaybeRefOrGetter } from 'vue';

import type { NormalizedAnnotatedFieldParallel, NormalizedAnnotation, NormalizedAnnotationGroup, NormalizedIndex, NormalizedMetadataField, NormalizedMetadataGroup } from '@/types/apptypes';

import useInjectable from '@/shared/lib/vue/useInjectable';
import { mapReduce } from '@/shared/utils/map-reduce';

export default function createLegacyCorpusStore(_index: MaybeRefOrGetter<NormalizedIndex | null>) {
	const index = toRef(_index);
	const indexId = computed(() => index.value?.id ?? '');
	const allAnnotatedFields = computed(() => Object.values(index.value?.annotatedFields ?? {}));
	const allAnnotatedFieldsMap = computed(() => index.value?.annotatedFields ?? {});
	const mainAnnotatedField = computed(() => index.value?.annotatedFields[index.value?.mainAnnotatedField ?? '']);
	const isParallelCorpus = computed(() => allAnnotatedFields.value.some(f => f.isParallel));
	const parallelAnnotatedFields = computed(() => allAnnotatedFields.value.filter((f): f is NormalizedAnnotatedFieldParallel => f.isParallel));
	const parallelAnnotatedFieldsMap = computed(() => mapReduce(parallelAnnotatedFields.value, 'id'));
	const parallelFieldPrefix = computed(() => parallelAnnotatedFields.value[0]?.prefix ?? '');
	const allAnnotations = computed(() => Object.values(mainAnnotatedField.value?.annotations ?? {}));
	const allAnnotationsMap = computed(() => mainAnnotatedField.value?.annotations ?? {});

	const allMetadataFields = computed(() => Object.values(index.value?.metadataFields ?? {}));
	const allMetadataFieldsMap = computed(() => index.value?.metadataFields ?? {});
	const firstMainAnnotation = computed(() => allAnnotations.value.find(f => f.isMainAnnotation));
	const metadataGroups = computed<Array<NormalizedMetadataGroup & { fields: NormalizedMetadataField[] }>>(
		() =>
			index.value?.metadataFieldGroups.map(g => ({
				...g,
				fields: g.entries.map(id => index.value!.metadataFields[id]),
			})) ?? [],
	);
	const annotationGroups = computed<Array<NormalizedAnnotationGroup & { fields: NormalizedAnnotation[] }>>(
		() =>
			index.value?.annotationGroups.map(g => ({
				...g,
				fields: g.entries.map(id => index.value!.annotatedFields[g.annotatedFieldId].annotations[id]),
			})) ?? [],
	);
	const textDirection = computed(() => index.value?.textDirection ?? 'ltr');
	const hasRelations = computed(() => index.value?.relations.relations != null);

	return reactive({
		index,
		indexId,
		allAnnotatedFields,
		allAnnotatedFieldsMap,
		mainAnnotatedField,
		isParallelCorpus,
		parallelAnnotatedFields,
		parallelAnnotatedFieldsMap,
		parallelFieldPrefix,
		allAnnotations,
		allAnnotationsMap,
		allMetadataFields,
		allMetadataFieldsMap,
		firstMainAnnotation,
		metadataGroups,
		annotationGroups,
		textDirection,
		hasRelations,
	});
}

type LegacyCorpusStore = ReturnType<typeof createLegacyCorpusStore>;

const [_legacyCorpusStoreInjectionKey, provideLegacyCorpusStore, useLegacyCorpusStore] = useInjectable<LegacyCorpusStore>('legacyCorpusStore');

export { createLegacyCorpusStore, provideLegacyCorpusStore, useLegacyCorpusStore };
export type { LegacyCorpusStore };
