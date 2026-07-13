// oxlint-disable-next-line vue/prefer-import-from-vue -- pauseTracking/resetTracking are not exported by this Vue package entrypoint.
import { markRaw, pauseTracking, resetTracking } from '@vue/reactivity';
import { computed, type ComputedRef, type ObjectPlugin, type Ref } from 'vue';

import type { Corpus } from '@/app/state/useCorpusContext';
import {
	annotationPosController,
	annotationSelectController,
	annotationTextController,
	DateField,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
	FormBuilder,
	parallelController,
	RangeField,
	type FormFieldNode,
	type FormRuntimeContext,
	withinController,
} from '@/features/form';
import { createLexiconLookup } from '@/features/form/fields/generic/lexicon-field';
import type { ParallelFieldState } from '@/features/form/model/controllers/parallel-controller';
import type { PatternMode } from '@/features/search/model/form/pattern-state';
import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import { createSearchFormTotalsFactory } from '@/features/search/model/search-form-totals';
import type { NormalizedAnnotation, NormalizedMetadataField, Tagset } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { debugLog } from '@/shared/debug/debug';
import type { Translate } from '@/shared/i18n';
import useInjectable from '@/shared/utils/useInjectable';

import AnnotationPosField from '@/features/form/fields/AnnotationPosField.vue';
import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import LexiconField from '@/features/form/fields/generic/LexiconField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import WithinField from '@/features/form/fields/WithinField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

const SEARCH_FORM_ID_PREFIX = 'search.';

type CreateSearchFormSystemOptions = {
	blacklabApi: BlackLabApi;
	configuration: Ref<SearchFormConfiguration>;
	corpus: Ref<Corpus | undefined>;
	tagset: Ref<Tagset | undefined>;
	translate: Translate;
};

const [_searchFormSystemKey, provideSearchFormSystem, useSearchFormSystem] = useInjectable<ComputedRef<FormBuilder | null>>('searchFormSystem');

function toSafeHtmlId(value: string): string {
	return value.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'group';
}

function createAnnotationTextField(
	builder: FormBuilder,
	nodeId: string,
	annotation: NormalizedAnnotation,
	corpus: Corpus,
	blacklabApi: BlackLabApi,
	translate: Translate,
	isSimpleSearch?: boolean,
	groupId?: string,
): FormFieldNode {
	return builder.newField(nodeId, annotationTextController, TextField, {
		annotationId: annotation.id,
		autocomplete: annotation.uiType !== 'text' ? (term: string) => blacklabApi.getTermAutocomplete(corpus.id, annotation.annotatedFieldId, annotation.id, term) : undefined,
		caseSensitive: annotation.caseSensitive,
		description: computed(() => translate.$tAnnotDescription(annotation)),
		displayName: computed(() => translate.$tAnnotDisplayName(annotation)),
		groupId,
		textDirection: annotation.isMainAnnotation ? corpus.textDirection : undefined,
		variant: isSimpleSearch ? ['large', 'simple'] : undefined,
	});
}

function createAnnotationField(
	builder: FormBuilder,
	nodeId: string,
	annotation: NormalizedAnnotation,
	corpus: Corpus,
	tagset: Tagset | undefined,
	blacklabApi: BlackLabApi,
	configuration: SearchFormConfiguration,
	translate: Translate,
	groupId?: string,
): FormFieldNode {
	const displayName = computed(() => translate.$tAnnotDisplayName(annotation));
	const description = computed(() => translate.$tAnnotDescription(annotation));
	const textDirection = annotation.isMainAnnotation ? corpus.textDirection : undefined;

	if (annotation.uiType === 'pos') {
		if (!tagset) {
			debugLog('form-setup', 'No tagset provided for POS field, but annotation requires it. Falling back to autocomplete.', { annotation, corpus });
			return createAnnotationTextField(builder, nodeId, annotation, corpus, blacklabApi, translate, false, groupId);
		}

		return builder.newField(nodeId, annotationPosController, AnnotationPosField, {
			annotation,
			groupId,
			showQueryPreview: true,
			subAnnotations: Object.fromEntries(
				(annotation.subAnnotations ?? [])
					.map(subAnnotationId => [subAnnotationId, corpus.allAnnotatedFieldsMap[annotation.annotatedFieldId]?.annotations[subAnnotationId]])
					.filter((entry): entry is [string, NormalizedAnnotation] => !!entry[1]),
			),
			tagset,
		});
	} else if (annotation.uiType === 'select' || annotation.uiType === 'combobox') {
		if (!annotation.values?.length) {
			return createAnnotationTextField(builder, nodeId, annotation, corpus, blacklabApi, translate, false, groupId);
		}
		return builder.newField(nodeId, annotationSelectController, SelectField, {
			annotationId: annotation.id,
			description,
			displayName,
			groupId,
			multiple: true,
			options: annotation.values,
			textDirection,
		});
	} else if (annotation.uiType === 'lexicon') {
		return builder.newField(nodeId, annotationTextController, LexiconField, {
			annotationId: annotation.id,
			description,
			displayName,
			groupId,
			lookup: createLexiconLookup({
				database: configuration.lexiconDatabase,
				getTermFrequencies: async values => {
					const response = await blacklabApi.getTermFrequencies(corpus.id, annotation.id, values);
					return response.termFreq;
				},
			}),
			textDirection,
		});
	} else {
		return createAnnotationTextField(builder, nodeId, annotation, corpus, blacklabApi, translate, false, groupId);
	}
}

function createWithinField(builder: FormBuilder, corpus: Corpus, configuration: SearchFormConfiguration, translate: Translate): FormFieldNode | null {
	const spans = corpus.relations?.spans;
	if (!configuration.within.enabled || !spans || !Object.keys(spans).length) return null;

	const configuredElements = configuration.within.elements.filter(option => !option.value || spans[option.value]);
	const elements = configuredElements.length
		? configuredElements
		: Object.keys(spans)
				.sort((left, right) => translate.$tSpanDisplayName({ value: left, label: left }).localeCompare(translate.$tSpanDisplayName({ value: right, label: right })))
				.map(value => ({ value, label: value }));
	const options = (elements.some(option => !option.value) ? elements : [{ value: '' }, ...elements]).map(option => ({
		...option,
		attributes: option.value
			? Object.keys(spans[option.value]?.attributes ?? {})
					.sort((left, right) => translate.$tSpanAttributeDisplay(option.value, left).localeCompare(translate.$tSpanAttributeDisplay(option.value, right)))
					.map(attribute => ({
						value: attribute,
						label: attribute,
					}))
			: [],
	}));

	return builder.newField('shared.within', withinController, WithinField, { options });
}

function createFilterField(builder: FormBuilder, nodeId: string, field: NormalizedMetadataField, corpus: Corpus, blacklabApi: BlackLabApi, translate: Translate, groupId?: string): FormFieldNode {
	const common = {
		description: computed(() => translate.$tMetaDescription(field)),
		displayName: computed(() => translate.$tMetaDisplayName(field)),
		groupId,
		metadataFieldId: field.id,
		textDirection: corpus.textDirection,
	};

	if (field.uiType === 'checkbox' && field.values?.length) {
		return builder.newField(nodeId, filterCheckboxController, CheckboxField, {
			...common,
			options: field.values,
		});
	}
	if (field.uiType === 'radio' && field.values?.length) {
		return builder.newField(nodeId, filterRadioController, RadioField, {
			...common,
			options: field.values,
		});
	}
	if ((field.uiType === 'select' || field.uiType === 'combobox') && field.values?.length) {
		return builder.newField(nodeId, filterSelectController, SelectField, {
			...common,
			multiple: true,
			options: field.values,
		});
	}
	if (field.uiType === 'date') {
		return builder.newField(nodeId, filterDateController, DateField, { ...common, range: true });
	}
	if (field.uiType === 'range') {
		return builder.newField(nodeId, filterRangeController, RangeField, {
			...common,
			inputType: 'number',
		});
	}

	return builder.newField(nodeId, filterTextController, TextField, {
		...common,
		autocomplete: field.uiType !== 'text' ? (term: string) => blacklabApi.getMetadataAutocomplete(corpus.id, field.id, term) : undefined,
	});
}

function createSharedFilters(
	builder: FormBuilder,
	corpus: Corpus,
	configuration: SearchFormConfiguration,
	blacklabApi: BlackLabApi,
	translate: Translate,
): ReturnType<FormBuilder['newContainer']> | null {
	const filterIds = configuration.metadataFieldIds;
	const groups = corpus.metadataGroups
		.map(group => ({
			fields: group.fields.filter((field): field is NormalizedMetadataField => !!field && filterIds.includes(field.id)),
			group,
		}))
		.filter(({ fields }) => fields.length);

	if (!groups.length) return null;

	const tabs = builder.newContainer('shared.filters', ContainerRenderer, {
		// title: computed(() => translate.$t('filter.heading')),
		variant: ['tabs', 'tab-badges'],
	});

	for (const { fields, group } of groups) {
		const tab = builder.newContainer(`${tabs.id}.${toSafeHtmlId(group.id)}`, ContainerRenderer, {
			title: computed(() => translate.$tMetaGroupName(group) || group.id),
		});
		for (const field of fields) {
			const nodeId = `${tab.id}.${toSafeHtmlId(field.id)}`;
			const node = builder.getField(nodeId) ?? createFilterField(builder, nodeId, field, corpus, blacklabApi, translate, group.id);
			tab.addChildren(node);
		}
		tabs.addChildren(tab);
	}

	return builder.newContainer('shared.filters.wrapper', ContainerRenderer, {}).addChildren(
		builder.newView('shared.filters.heading', HeadingView, {
			title: computed(() => translate.$t('filter.heading')),
		}),
		tabs,
		builder.newView('shared.filters.summary', SummaryView, {
			createTotals: createSearchFormTotalsFactory(corpus, blacklabApi),
			summaryType: 'filter',
		}),
	);
}

function createExtendedAnnotationTabs(
	builder: FormBuilder,
	corpus: Corpus,
	tagset: Tagset | undefined,
	configuration: SearchFormConfiguration,
	blacklabApi: BlackLabApi,
	translate: Translate,
): ReturnType<FormBuilder['newContainer']> | null {
	const annotationIds = configuration.extendedAnnotationIds;
	const groups = corpus.annotationGroups
		.filter(group => group.annotatedFieldId === corpus.mainAnnotatedField)
		.map(group => ({
			annotations: group.entries
				.map(annotationId => corpus.allAnnotationsMap[annotationId])
				.filter((annotation): annotation is NormalizedAnnotation => !!annotation && !annotation.isInternal && annotationIds.includes(annotation.id)),
			group,
		}))
		.filter(({ annotations }) => annotations.length);

	if (!groups.length) return null;

	const populateTab = (tab: ReturnType<FormBuilder['newContainer']>, annotations: NormalizedAnnotation[], groupId?: string) => {
		for (const annotation of annotations) {
			const nodeId = `${tab.id}.${toSafeHtmlId(annotation.id)}`;
			const node = builder.getField(nodeId) ?? createAnnotationField(builder, nodeId, annotation, corpus, tagset, blacklabApi, configuration, translate, groupId);
			tab.addChildren(node);
		}
	};

	if (groups.length === 1) {
		const group = groups[0];
		const single = builder.newContainer('search.extended.annotations', ContainerRenderer, {
			variant: 'list',
		});
		populateTab(single, group.annotations, group.group.id);
		return single;
	}

	const tabs = builder.newContainer('search.extended.annotations', ContainerRenderer, {
		variant: 'tabs',
	});

	for (const { annotations, group } of groups) {
		const tab = builder.newContainer(`${tabs.id}.${toSafeHtmlId(group.id)}`, ContainerRenderer, {
			title: computed(() => translate.$tAnnotGroupName(group)),
			variant: 'list',
		});
		populateTab(tab, annotations, group.id);
		tabs.addChildren(tab);
	}

	return tabs;
}

function getSimpleSearchAnnotation(corpus: Corpus, configuration: SearchFormConfiguration): NormalizedAnnotation {
	const simpleAnnotationId = configuration.simpleAnnotationId;
	const annotatedFieldId = corpus.isParallelCorpus ? corpus.parallelAnnotatedFields[0]?.id : corpus.mainAnnotatedField;
	const sourceField = annotatedFieldId ?? corpus.mainAnnotatedField;
	const annotation = corpus.allAnnotatedFieldsMap[sourceField]?.annotations[simpleAnnotationId] || corpus.firstMainAnnotation;
	return {
		...annotation,
		annotatedFieldId: corpus.isParallelCorpus ? '' : sourceField,
	};
}

function createSearchFormDefinition(corpus: Corpus, tagset: Tagset | undefined, configuration: SearchFormConfiguration, blacklabApi: BlackLabApi, translate: Translate): FormBuilder {
	const context: FormRuntimeContext = {
		corpus: {
			indexId: corpus.id,
			textDirection: corpus.textDirection,
		},
		translate,
	};
	const builder = new FormBuilder(context);
	const annotation = getSimpleSearchAnnotation(corpus, configuration);
	const sharedWithin = createWithinField(builder, corpus, configuration, translate);
	const sharedFilters = createSharedFilters(builder, corpus, configuration, blacklabApi, translate);
	const form = builder.newForm(getNewSearchFormId('simple'), ContainerRenderer, {
		title: computed(() => translate.$t('search.simple.heading')),
		variant: sharedFilters ? 'columns' : undefined,
	});
	const simpleQuery = builder.newContainer('search.simple.query.wrapper', ContainerRenderer, { variant: 'list' });

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
			alignByOptions: configuration.alignBy.enabled ? configuration.alignBy.elements : [],
			defaultAlignBy: configuration.alignBy.defaultValue || null,
			child: {
				id: 'query',
				controller: annotationTextController,
				component: markRaw(TextField),
				config: childConfig,
			},
			fieldOptions: corpus.parallelAnnotatedFields,
		});
		simpleQuery.addChildren(field);

		const state = builder.state.state.value[field.id] as ParallelFieldState;
		state.source = corpus.parallelAnnotatedFields[0]?.id ?? null;
	} else {
		simpleQuery.addChildren(createAnnotationField(builder, 'search.simple.annotation', annotation, corpus, tagset, blacklabApi, configuration, translate));
	}
	form.addChildren(simpleQuery, sharedFilters);

	const extendedForm = builder.newForm(getNewSearchFormId('extended'), ContainerRenderer, {
		// title: computed(() => translate.$t('search.extended.heading')),
		variant: 'columns',
	});
	extendedForm.addChildren(
		builder.newContainer('search.extended.query.wrapper', ContainerRenderer, { variant: 'list' }).addChildren(
			// builder.newView('search.extended.heading', HeadingView, {
			// 	title: computed(() => translate.$t('search.heading')),
			// }),
			createExtendedAnnotationTabs(builder, corpus, tagset, configuration, blacklabApi, translate),
			sharedWithin,
		),
		sharedFilters,
	);

	return builder;
}

type SearchFormSystemPlugin = ObjectPlugin & {
	definition: ComputedRef<FormBuilder | null>;
};

const createSearchFormSystem = (options: CreateSearchFormSystemOptions): SearchFormSystemPlugin => {
	const definition = computed(() => {
		const corpus = options.corpus.value;
		const tagset = options.tagset.value;
		const configuration = options.configuration.value;
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
			return createSearchFormDefinition(corpus, tagset, configuration, options.blacklabApi, options.translate);
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
