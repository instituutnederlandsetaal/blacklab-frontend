// oxlint-disable-next-line vue/prefer-import-from-vue -- pauseTracking/resetTracking are not exported by this Vue package entrypoint.
import { markRaw, pauseTracking, resetTracking } from '@vue/reactivity';
import { computed, type ComputedRef, type ObjectPlugin, type Ref } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import type { Corpus } from '@/app/state/useCorpusContext';
import { annotationPosController, annotationSelectController, annotationTextController, FormBuilder, parallelController, type FormFieldNode, type FormRuntimeContext } from '@/features/form';
import type { ParallelFieldState } from '@/features/form/model/controllers/parallel-controller';
import type { PatternMode } from '@/features/search/model/form/pattern-state';
import type { NormalizedAnnotation, Tagset } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import type { Translate } from '@/shared/i18n';
import useInjectable from '@/shared/utils/useInjectable';

import AnnotationPosField from '@/features/form/fields/AnnotationPosField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

const SEARCH_FORM_ID_PREFIX = 'search.';

type CreateSearchFormSystemOptions = {
	blacklabApi: BlackLabApi;
	corpus: Ref<Corpus | undefined>;
	tagset: Ref<Tagset | undefined>;
	translate: Translate;
};

const [_searchFormSystemKey, provideSearchFormSystem, useSearchFormSystem] = useInjectable<ComputedRef<FormBuilder | null>>('searchFormSystem');

function createAnnotationField(
	builder: FormBuilder,
	nodeId: string,
	annotation: NormalizedAnnotation,
	corpus: Corpus,
	tagset: Tagset | undefined,
	blacklabApi: BlackLabApi,
	translate: Translate,
): FormFieldNode {
	const displayName = computed(() => translate.$tAnnotDisplayName(annotation));
	const description = computed(() => translate.$tAnnotDescription(annotation));
	const textDirection = annotation.isMainAnnotation ? corpus.textDirection : undefined;

	if (annotation.uiType === 'pos' && tagset) {
		return builder.newField(nodeId, annotationPosController, AnnotationPosField, {
			annotation,
			showQueryPreview: true,
			subAnnotations: Object.fromEntries(
				(annotation.subAnnotations ?? [])
					.map(subAnnotationId => [subAnnotationId, corpus.allAnnotatedFieldsMap[annotation.annotatedFieldId]?.annotations[subAnnotationId]])
					.filter((entry): entry is [string, NormalizedAnnotation] => !!entry[1]),
			),
			tagset,
		});
	}

	if ((annotation.uiType === 'select' || annotation.uiType === 'combobox') && annotation.values?.length) {
		return builder.newField(nodeId, annotationSelectController, SelectField, {
			annotationId: annotation.id,
			description,
			displayName,
			multiple: true,
			options: annotation.values,
			textDirection,
		});
	}

	return builder.newField(nodeId, annotationTextController, TextField, {
		annotationId: annotation.id,
		autocomplete:
			annotation.uiType === 'combobox' && annotation.annotatedFieldId ? (term: string) => blacklabApi.getTermAutocomplete(corpus.id, annotation.annotatedFieldId, annotation.id, term) : undefined,
		caseSensitive: annotation.caseSensitive,
		description,
		displayName,
		textDirection,
		variant: 'large',
	});
}

function getSimpleSearchAnnotation(corpus: Corpus): NormalizedAnnotation {
	const simpleAnnotationId = UIStore.getState().search.simple.searchAnnotationId;
	const annotatedFieldId = corpus.isParallelCorpus ? corpus.parallelAnnotatedFields[0]?.id : corpus.mainAnnotatedField;
	const sourceField = annotatedFieldId ?? corpus.mainAnnotatedField;
	const annotation = corpus.allAnnotatedFieldsMap[sourceField]?.annotations[simpleAnnotationId] || corpus.firstMainAnnotation;
	return {
		...annotation,
		annotatedFieldId: corpus.isParallelCorpus ? '' : sourceField,
	};
}

function createSearchFormDefinition(corpus: Corpus, tagset: Tagset | undefined, blacklabApi: BlackLabApi, translate: Translate): FormBuilder {
	const context: FormRuntimeContext = {
		corpus: {
			indexId: corpus.id,
			textDirection: corpus.textDirection,
		},
		translate,
	};
	const builder = new FormBuilder(context);
	const annotation = getSimpleSearchAnnotation(corpus);
	const form = builder.newForm(getNewSearchFormId('simple'), ContainerRenderer, {
		title: computed(() => translate.$t('search.simple.heading')),
	});

	if (corpus.isParallelCorpus) {
		const childConfig = {
			annotationId: annotation.id,
			caseSensitive: false,
			description: computed(() => translate.$tAnnotDescription(annotation)),
			displayName: computed(() => translate.$tAnnotDisplayName(annotation)),
			textDirection: annotation.isMainAnnotation ? corpus.textDirection : undefined,
			variant: 'large' as const,
		};
		const field = builder.newField('search.simple.parallel', parallelController, ParallelField, {
			alignByOptions: UIStore.getState()
				.search.shared.alignBy.elements.map(option => option.value)
				.filter((value): value is string => typeof value === 'string'),
			child: {
				id: 'query',
				controller: annotationTextController,
				component: markRaw(TextField),
				config: childConfig,
			},
			fieldOptions: corpus.parallelAnnotatedFields,
		});
		form.addChildren(field);

		const state = builder.state.state.value[field.id] as ParallelFieldState;
		state.source = corpus.parallelAnnotatedFields[0]?.id ?? null;
	} else {
		form.addChildren(createAnnotationField(builder, 'search.simple.annotation', annotation, corpus, tagset, blacklabApi, translate));
	}

	return builder;
}

type SearchFormSystemPlugin = ObjectPlugin & {
	definition: ComputedRef<FormBuilder | null>;
};

const createSearchFormSystem = (options: CreateSearchFormSystemOptions): SearchFormSystemPlugin => {
	const definition = computed(() => {
		const corpus = options.corpus.value;
		const tagset = options.tagset.value;
		if (!corpus) return null;

		// FIXME: this is a hack!
		// we're creating the form definition in a computed,
		// but the form definition is also mutable, and keeps internal (reactive) state (the form state)
		// This means that we technically return a mutable object from a computed
		// Additionally, the form was ending up in it own reactive dependencies,
		// which means it creates an infinite computed loop if we don't suspend tracking while creating the form definition.
		// All in all, poorly designed, and we really should work to separate out definition from state and runtime component graph
		pauseTracking();
		try {
			return createSearchFormDefinition(corpus, tagset, options.blacklabApi, options.translate);
		} finally {
			resetTracking();
		}
	});
	return {
		install: app => provideSearchFormSystem(app, definition),
		definition,
	};
};

export function hasNewSearchFormForPattern(definition: FormBuilder | null | undefined, patternMode: PatternMode): boolean {
	return !!definition?.getForm(getNewSearchFormId(patternMode));
}

export function getNewSearchFormId(patternMode: PatternMode): string {
	return `${SEARCH_FORM_ID_PREFIX}${patternMode}`;
}

export { useSearchFormSystem, createSearchFormSystem };
