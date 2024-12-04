import { computed, reactive } from 'vue';
import type { NormalizedAnnotatedField, NormalizedAnnotatedFieldParallel, NormalizedAnnotation, NormalizedAnnotationGroup, NormalizedIndex, NormalizedMetadataField, NormalizedMetadataGroup } from '@/types/apptypes';
import { mapReduce } from '@/utils';

export function corpus(corpus: NormalizedIndex) {
	corpus = reactive(corpus);

	const get = {
		/** List of annotated fields */
		allAnnotatedFields: computed((): NormalizedAnnotatedField[] => Object.values(corpus.annotatedFields)),

		/** Map of annotated fields */
		allAnnotatedFieldsMap: computed(():Record<string, NormalizedAnnotatedField> => corpus.annotatedFields),

		/** Main annotated field name */
		mainAnnotatedField: computed((): string => corpus.mainAnnotatedField),

		/** Is this a parallel corpus? */
		isParallelCorpus: computed((): boolean => get.allAnnotatedFields.value.some(f => f.isParallel)),

		parallelAnnotatedFields: computed((): NormalizedAnnotatedFieldParallel[] => {
			return get.allAnnotatedFields.value.filter((f: NormalizedAnnotatedField): f is NormalizedAnnotatedFieldParallel => f.isParallel);
		}),

		parallelAnnotatedFieldsMap: computed((): Record<string, NormalizedAnnotatedFieldParallel> => {
			return mapReduce(get.parallelAnnotatedFields.value, 'id');
		}),

		/** If this is a parallel corpus, what's the parallel field prefix?
		 *  (e.g. "contents" if there's fields "contents__en" and "contents__nl")
		 *  There is only ever one.
		 */
		parallelFieldPrefix: computed((): string => { return get.parallelAnnotatedFields.value[0]?.prefix ?? ''; }),

		/** All annotations, without duplicates and in no specific order */
		allAnnotations: computed((): NormalizedAnnotation[] => Object.values(corpus.annotatedFields[corpus.mainAnnotatedField].annotations ?? {})),
		allAnnotationsMap: computed((): Record<string, NormalizedAnnotation> => mapReduce(get.allAnnotations.value, 'id')),

		allMetadataFields: computed((): NormalizedMetadataField[] => Object.values(corpus.metadataFields || {})),
		allMetadataFieldsMap: computed((): Record<string, NormalizedMetadataField> => corpus.metadataFields ?? {}),

		// TODO there can be multiple main annotations if there are multiple annotatedFields
		// the ui needs to respect this (probably render more extensive results?)
		firstMainAnnotation: () => get.allAnnotations.value.find((f: NormalizedAnnotation) => f.isMainAnnotation)!,

		/**
		 * Returns all metadatagroups from the indexstructure, unless there are no metadatagroups defined.
		 * In that case a single generated group "metadata" is returned, containing all metadata fields.
		 * If groups are defined, fields not in any group are omitted.
		 */
		metadataGroups: computed((): Array<NormalizedMetadataGroup&{fields: NormalizedMetadataField[]}> => corpus.metadataFieldGroups.map((g: NormalizedMetadataGroup) => ({
			...g,
			fields: g.entries.map((id: string) => corpus.metadataFields[id])
		})) ?? []),

		/**
		 * Returns all annotationGroups from the indexstructure.
		 * May contain internal annotations if groups were defined through indexconfig.yaml.
		 */
		annotationGroups: computed((): Array<NormalizedAnnotationGroup&{fields: NormalizedAnnotation[]}> => corpus.annotationGroups.map((g: NormalizedAnnotationGroup) => ({
			...g,
			fields: g.entries.map((id: string) => corpus.annotatedFields[g.annotatedFieldId].annotations[id]),
		})) ?? []),

		textDirection: computed(() => corpus.textDirection ?? 'ltr'),

		hasRelations: computed(() => corpus.relations.relations != null),
	};


	return { get };
}