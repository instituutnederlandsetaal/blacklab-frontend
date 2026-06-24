import type { Ref } from 'vue';

import type { Corpus } from '@/app/state/useCorpusContext';
import type { NormalizedIndex, NormalizedAnnotatedField, NormalizedAnnotation, NormalizedMetadataField } from '@/types/apptypes';

type ModuleRootState = { corpus: NormalizedIndex | null };

const namespace = 'corpus';

function createCorpusStoreAdapter(corpusRef: Ref<Corpus | undefined>) {
	const state = {} as ModuleRootState;

	Object.defineProperty(state, 'corpus', {
		enumerable: true,
		get: () => corpusRef.value ?? null,
		set: (corpus: NormalizedIndex | null) => {
			if (corpus && corpusRef.value) {
				Object.assign(corpusRef.value, corpus);
			}
		},
	});

	// oof, this is a bit of a hack, but it works for now. We can improve this later if needed.
	// eslint-disable no-non-null-asserted-optional-chain
	const get = {
		allAnnotatedFields: (): NormalizedAnnotatedField[] => corpusRef.value?.allAnnotatedFields!,
		allAnnotatedFieldsMap: (): Record<string, NormalizedAnnotatedField> => corpusRef.value?.allAnnotatedFieldsMap!,
		mainAnnotatedField: (): string => corpusRef.value?.mainAnnotatedField!,
		isParallelCorpus: (): boolean => corpusRef.value?.isParallelCorpus!,
		parallelAnnotatedFields: () => corpusRef.value?.parallelAnnotatedFields!,
		parallelAnnotatedFieldsMap: () => corpusRef.value?.parallelAnnotatedFieldsMap!,
		parallelFieldPrefix: (): string => corpusRef.value?.parallelFieldPrefix!,
		allAnnotations: (): NormalizedAnnotation[] => corpusRef.value?.allAnnotations!,
		allAnnotationsMap: (): Record<string, NormalizedAnnotation> => corpusRef.value?.allAnnotationsMap!,
		allMetadataFields: (): NormalizedMetadataField[] => corpusRef.value?.allMetadataFields!,
		allMetadataFieldsMap: (): Record<string, NormalizedMetadataField> => corpusRef.value?.allMetadataFieldsMap!,
		firstMainAnnotation: (): NormalizedAnnotation => corpusRef.value?.firstMainAnnotation!,
		metadataGroups: () => corpusRef.value?.metadataGroups!,
		annotationGroups: () => corpusRef.value?.annotationGroups!,
		textDirection: () => corpusRef.value?.textDirection!,
		hasRelations: (): boolean => corpusRef.value?.hasRelations!,
	};
	// eslint-enable no-non-null-asserted-optional-chain

	const actions = {
		loadTagsetValues: (handler: (state: ModuleRootState) => void) => handler(state),
	};

	return {
		getState: () => state,
		get,
		actions,
		init: () => Promise.resolve(),
		namespace,
	};
}

export { createCorpusStoreAdapter, namespace };
export type { ModuleRootState };
