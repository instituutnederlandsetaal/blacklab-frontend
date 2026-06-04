import { computed } from 'vue';

import type { CorpusContext, FilledCorpusContext } from '@/entities/corpus/model/corpus-context';
import {
	FormBuilder,
	annotationPosController,
	annotationSelectController,
	annotationTextController,
	expertQueryController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
	parallelController,
	type FormRuntimeContext,
	type FormSystemDefinition,
	withinController,
} from '@/features/form';
import type { TextFieldUiConfig } from '@/features/form/fields/generic/text-field';
import type { NormalizedAnnotation, NormalizedIndex, NormalizedMetadataField, Tagset } from '@/types/apptypes';

import { runSearchFormCustomizations } from './search-form-customizations';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import type { Translate } from '@/shared/i18n';

import AnnotationPosField from '@/features/form/fields/AnnotationPosField.vue';
import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import DateField from '@/features/form/fields/generic/DateField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import RangeField from '@/features/form/fields/generic/RangeField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import WithinField from '@/features/form/fields/WithinField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import ContainerRendererFilters from '@/features/form/ui/ContainerRendererFilters.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

/** Create a valid HTML id from a string. Replacing whitespace with dashes and removing leading or trailing dashes */
function toSafeHtmlId(value: string) {
	return value.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'group';
}

function createParallelField(builder: FormBuilder, corpus: CorpusContext, translate: Translate) {
	const index = corpus.index;
	if (!index) return null;

	const parallelFields = Object.values(index.annotatedFields)
		.filter(f => f.isParallel)
		.sort((left, right) => translate.$tAnnotatedFieldDisplayName(left).localeCompare(translate.$tAnnotatedFieldDisplayName(right)));
	if (!parallelFields.length) return null;

	const alignByOptions = Object.keys(index.relations.relations ?? {})
		.filter(relationClass => relationClass.startsWith('al__'))
		.flatMap(relationClass => Object.keys(index.relations.relations?.[relationClass] ?? {}))
		.filter((value, position, values) => values.indexOf(value) === position)
		.sort((left, right) => left.localeCompare(right));

	return builder.newField('shared.parallel', parallelController, ParallelField, {
		alignByOptions,
		sourceOptions: parallelFields,
		targetOptions: parallelFields,
		// variant: 'large',
	});
}

function createWithinField(builder: FormBuilder, corpus: CorpusContext, translate: Translate) {
	const spans = corpus.index?.relations.spans;
	if (!spans || !Object.keys(spans).length) return null;

	const options = [
		{ value: '' },
		...Object.keys(spans)
			.sort((left, right) => translate.$tSpanDisplayName({ value: left, label: left }).localeCompare(translate.$tSpanDisplayName({ value: right, label: right })))
			.map(spanName => ({
				value: spanName,
				label: spanName,
				attributes: Object.keys(spans[spanName]?.attributes ?? {})
					.sort((left, right) => translate.$tSpanAttributeDisplay(spanName, left).localeCompare(translate.$tSpanAttributeDisplay(spanName, right)))
					.map(attribute => ({
						value: attribute,
						label: attribute,
					})),
			})),
	];

	return builder.newField('shared.within', withinController, WithinField, { options });
}

function createAnnotationField(builder: FormBuilder, nodeId: string, annotation: NormalizedAnnotation, corpus: { index: NormalizedIndex; tagset?: Tagset }, translate: Translate, groupId?: string) {
	const displayName = computed(() => translate.$tAnnotDisplayName(annotation));
	const description = computed(() => translate.$tAnnotDescription(annotation));
	const textDirection = corpus.index.textDirection;

	if (annotation.uiType === 'pos') {
		if (corpus.tagset) {
			return builder.newField(nodeId, annotationPosController, AnnotationPosField, {
				annotation,
				groupId,
				showQueryPreview: true,
				subAnnotations: Object.fromEntries(
					(annotation.subAnnotations ?? [])
						.map(subAnnotationId => [subAnnotationId, corpus.index.annotatedFields[annotation.annotatedFieldId].annotations[subAnnotationId]])
						.filter((entry): entry is [string, NormalizedAnnotation] => !!entry[1]),
				),
				tagset: corpus.tagset,
			});
		}
	} else if (annotation.uiType === 'select' || annotation.uiType === 'combobox') {
		if (annotation.values?.length) {
			return builder.newField(nodeId, annotationSelectController, SelectField, {
				annotationId: annotation.id,
				description,
				displayName,
				groupId,
				multiple: true,
				options: annotation.values,
				textDirection,
			});
		}
	} else if (annotation.uiType === 'lexicon') {
		// todo
	}

	// leftover types, text, autocomplete, unhandled specifics because of missing config (options, tagset)
	// all degrate to autocomplete.
	// TODO add support for radio/checkbox annotations?
	return builder.newField(nodeId, annotationTextController, TextField, {
		annotationId: annotation.id,
		caseSensitive: annotation.caseSensitive,
		description,
		displayName,
		groupId,
		textDirection,
	});
}

function createFilterField(
	builder: FormBuilder,
	nodeId: string,
	indexId: string,
	field: NormalizedMetadataField,
	translate: Translate,
	groupId?: string,
	textDirection?: 'ltr' | 'rtl',
	api?: BlackLabApi,
) {
	const common = {
		description: computed(() => translate.$tMetaDescription(field)),
		displayName: computed(() => translate.$tMetaDisplayName(field)),
		groupId,
		metadataFieldId: field.id,
		textDirection,
	};

	if (field.uiType === 'checkbox') {
		if (field.values?.length) {
			return builder.newField(nodeId, filterCheckboxController, CheckboxField, {
				...common,
				options: field.values,
			});
		}
	} else if (field.uiType === 'radio') {
		if (field.values?.length) {
			return builder.newField(nodeId, filterRadioController, RadioField, {
				...common,
				options: field.values,
			});
		}
	} else if (field.uiType === 'select' || field.uiType === 'combobox') {
		if (field.values?.length) {
			return builder.newField(nodeId, filterSelectController, SelectField, {
				...common,
				multiple: true,
				options: field.values,
			});
		}
	} else if (field.uiType === 'date') {
		return builder.newField(nodeId, filterDateController, DateField, { ...common, range: true });
	} else if (field.uiType === 'range') {
		return builder.newField(nodeId, filterRangeController, RangeField, {
			...common,
			inputType: 'number',
		});
	}

	if (field.uiType !== 'text' && field.uiType !== 'combobox') {
		console.warn(`Unsupported filter type ${field.uiType} for metadata field ${field.id}, falling back to autocomplete.`);
	}
	// Insert the autocomplete function
	if (field.uiType !== 'text' && api) {
		(common as TextFieldUiConfig).autocomplete = term => api.getMetadataAutocomplete(indexId, field.id, term);
	}

	// Default fallback and text/atocomplete fields
	// Though, should probably return an autocomplete version?
	return builder.newField(nodeId, filterTextController, TextField, common);
}

/**
 * Build the root filter container. Including the 'filter by...' heading.
 * Does not attach the filters to the node graph yet, that way we can reuse the same filters for multiple forms by inserting them multiple times.
 */
function createSharedFilters(builder: FormBuilder, index: NormalizedIndex, translate: Translate) {
	const groups = index.metadataFieldGroups
		.map(group => ({
			// Remove bogus entries, there was a moment when BlackLab let through configs specifying nonexistent fields
			fields: group.entries.map(fieldId => index.metadataFields[fieldId]).filter((field): field is NormalizedMetadataField => !!field),
			group,
		}))
		// Remove empty groups
		.filter(({ fields }) => fields.length);
	// TODO return a single component that's just a message that no filters are available.
	// Like in the old days.
	if (!groups?.length) return null;

	const tabs = builder.newContainer('shared.filters', ContainerRendererFilters, {
		variant: 'tabs',
		title: computed(() => translate.$t(`filter.heading`)),
	});

	for (const { fields, group } of groups) {
		const tab = tabs.addContainer(`${tabs.id}.${toSafeHtmlId(group.id)}`, ContainerRenderer, {
			title: computed(() => translate.$tMetaGroupName(group.id) || group.id),
		});
		for (const field of fields) {
			const nodeId = `${tab.id}.${toSafeHtmlId(field.id)}`;
			// See if the node already exists, because filters might be present in more than one tab.
			const node = builder.getField(nodeId) ?? createFilterField(builder, nodeId, index.id, field, translate, group.id, index.textDirection);
			tab.addChildren(node);
		}
	}

	const rootFilterContainer = builder.newContainer('shared.filters.wrapper', ContainerRenderer, {}).addChildren(
		builder.newView('shared.filters.heading', HeadingView, {
			title: computed(() => translate.$t(`filter.heading`)),
		}),
		tabs,
		builder.newView('shared.filters.summary', SummaryView, {
			showRaw: true,
		}),
	);

	return rootFilterContainer;
}

/**
 * Create the annotation widgets for the extended search form, grouped in tabs if there are annotation groups defined for the main annotated field.
 * Does not attach the annotations to the node graph yet.
 */
function createAnnotationTabs(builder: FormBuilder, corpus: { index: NormalizedIndex; tagset?: Tagset }, translate: Translate) {
	const mainField = corpus.index.annotatedFields[corpus.index.mainAnnotatedField];
	const groups = corpus.index.annotationGroups
		.filter(group => group.annotatedFieldId === corpus.index.mainAnnotatedField)
		.map(group => ({
			annotations: group.entries.map(annotationId => mainField.annotations[annotationId]).filter(a => !a.isInternal),
			group,
		}))
		.filter(({ annotations }) => annotations.length);

	function populateTab(tab: ReturnType<FormBuilder['newContainer']>, annotations: NormalizedAnnotation[], groupId?: string) {
		for (const annotation of annotations) {
			const nodeId = `${tab.id}.${toSafeHtmlId(annotation.id)}`;
			const node = builder.getField(nodeId) ?? createAnnotationField(builder, nodeId, annotation, corpus, translate, groupId);
			tab.addChildren(node);
		}
	}

	// If there's only one group, we can skip the tabs and just show the annotations directly
	if (groups.length === 1) {
		const group = groups[0];
		const single = builder.newContainer(`extended.annotations`, ContainerRenderer, {
			variant: 'list',
		});
		populateTab(single, group.annotations, group.group.id);
		return single;
	}

	const tabs = builder.newContainer(`extended.annotations`, ContainerRenderer, {
		variant: 'small-tabs',
		title: computed(() => translate.$t(`search.extended.annotations`)),
	});

	for (const { annotations, group } of groups) {
		const tab = tabs.addContainer(`extended.annotations.${toSafeHtmlId(group.id)}`, ContainerRenderer, {
			variant: 'list',
			title: computed(() => translate.$tAnnotGroupName(group)),
		});
		populateTab(tab, annotations, group.id);
	}

	return tabs;
}

function verifyIndexPresent(corpus: CorpusContext): asserts corpus is FilledCorpusContext {
	if (!corpus.index) {
		throw new Error('Corpus index is required to build the search form definition.');
	}
}

export function createSearchFormDefinition(
	corpus: CorpusContext,
	translate: Translate,
): {
	context: FormRuntimeContext;
	definition: FormSystemDefinition;
	rootId: string;
} {
	verifyIndexPresent(corpus);
	const index = corpus.index;

	const builder = new FormBuilder();
	const context: FormRuntimeContext = {
		corpus: index,
		translate,
	};

	const root = builder.newContainer('root', ContainerRenderer, { variant: 'tabs' });
	const searchTab = root.addContainer('search', ContainerRenderer, {
		variant: 'tabs',
		title: computed(() => translate.$t(`search.heading`)),
	});
	root.addContainer('explore', ContainerRenderer, {
		variant: 'tabs',
		title: computed(() => translate.$t(`explore.heading`)),
	});

	const sharedFilters = createSharedFilters(builder, index, translate);
	const sharedParallel = createParallelField(builder, corpus, translate);
	const sharedWithin = createWithinField(builder, corpus, translate);

	// TODO use customized annot
	const simpleField = index.annotatedFields[index.mainAnnotatedField].annotations[index.annotatedFields[index.mainAnnotatedField].mainAnnotationId];
	if (!simpleField) {
		throw new Error(`Main annotation ${index.annotatedFields[index.mainAnnotatedField].mainAnnotationId} is missing from ${index.mainAnnotatedField}.`);
	}

	searchTab
		.addForm('search.simple', ContainerRenderer, {
			variant: 'list',
			title: computed(() => translate.$t(`search.simple.heading`)),
		})
		.addChildren(createAnnotationField(builder, 'search.simple.annotation', simpleField, corpus, translate));

	const extendedSearchForm = searchTab.addForm('search.extended', ContainerRenderer, {
		title: computed(() => translate.$t(`search.extended.heading`)),
		variant: 'columns',
	});
	extendedSearchForm.addContainer('search.extended.query', ContainerRenderer, {}).addChildren(
		builder.newContainer('search.extended.query.wrapper', ContainerRenderer, { variant: 'list' }).addChildren(
			builder.newView('search.heading', HeadingView, {
				title: computed(() => translate.$t(`search.heading`)),
			}),
			createAnnotationTabs(builder, corpus, translate),
			sharedParallel,
			sharedWithin,
		),
		sharedFilters,
	);

	// TODO querybuilder
	// const advancedSearchForm = searchTab.

	const expertSearchForm = searchTab.addForm('search.expert', ContainerRenderer, {
		title: computed(() => translate.$t(`search.expert.heading`)),
		variant: 'columns',
	});
	expertSearchForm
		.addContainer('search.expert.query', ContainerRenderer, {})
		.addView('search.expert.query.heading', HeadingView, {
			title: computed(() => translate.$t(`search.expert.corpusQueryLanguage`)),
		})
		.addField('search.expert.querybox', expertQueryController, RawCqlField, {})
		.addChildren(sharedParallel, sharedWithin);
	expertSearchForm.addChildren(sharedFilters);

	runSearchFormCustomizations({
		builder,
		context,
		corpus,
		root,
	});

	return {
		context,
		definition: builder.build(),
		rootId: root.id,
	};
}
