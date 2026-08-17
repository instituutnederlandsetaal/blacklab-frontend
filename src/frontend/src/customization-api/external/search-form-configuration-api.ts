/** Application-side implementation of the public pre-construction form API. */

import { searchFormAnnotationControlKey, searchFormIds } from '@/customization-api/shared/form/ids';
import { createSearchFormOverrides, type SearchFormWithinAttribute } from '@/customization-api/shared/form/search-form-overrides';

import type { Corpus, SearchFormConfigurationApi, SearchFormOption, SearchFormSpanFilter } from './external-api';

import { spanFilterId } from '@/shared/blacklab-helpers/span-filters-helper';

function knownAnnotationIds(corpus: Corpus, annotationIds: readonly string[], setting: string): string[] {
	return annotationIds.filter(annotationId => {
		if (corpus.allAnnotationsMap[annotationId]) return true;
		console.warn(`[customizeSearchForm.${setting}] Ignoring unknown annotation '${annotationId}'.`);
		return false;
	});
}

function knownGroupAnnotationIds(corpus: Corpus, annotationIds: readonly string[], setting: string): string[] {
	return knownAnnotationIds(corpus, annotationIds, setting).filter(annotationId => {
		if (corpus.allAnnotationsMap[annotationId].hasForwardIndex) return true;
		console.warn(`[customizeSearchForm.${setting}] Ignoring annotation '${annotationId}' because grouping requires a forward index.`);
		return false;
	});
}

function knownMetadataIds(corpus: Corpus, metadataIds: readonly string[], setting: string): string[] {
	return metadataIds.filter(metadataId => {
		if (corpus.allMetadataFieldsMap[metadataId]) return true;
		console.warn(`[customizeSearchForm.${setting}] Ignoring unknown metadata field '${metadataId}'.`);
		return false;
	});
}

function availableSpanOptions(corpus: Corpus, filter: SearchFormSpanFilter): SearchFormOption[] | undefined {
	if (filter.options) return filter.options.map(option => ({ ...option }));
	const attribute = corpus.relations.spans?.[filter.elementName]?.attributes?.[filter.attributeName];
	return attribute?.valueListComplete ? Object.keys(attribute.values).map(value => ({ value })) : undefined;
}

export function createSearchFormOverrideCollector(corpus: Corpus) {
	const overrides = createSearchFormOverrides();
	const api = {
		corpus,
		setSimpleAnnotation(annotationId) {
			const [known] = knownAnnotationIds(corpus, [annotationId], 'setSimpleAnnotation');
			if (known) overrides.simpleAnnotationId = known;
		},
		setExtendedAnnotations(annotationIds) {
			overrides.extendedAnnotationIds = knownAnnotationIds(corpus, annotationIds, 'setExtendedAnnotations');
		},
		setAnnotationControl(annotationId, control, annotatedFieldId) {
			const annotation = annotatedFieldId ? corpus.allAnnotatedFieldsMap[annotatedFieldId]?.annotations[annotationId] : corpus.allAnnotationsMap[annotationId];
			if (!annotation) {
				console.warn(`[customizeSearchForm.setAnnotationControl] Ignoring unknown annotation '${annotationId}'${annotatedFieldId ? ` in annotated field '${annotatedFieldId}'` : ''}.`);
				return;
			}
			const key = searchFormAnnotationControlKey(annotationId, annotatedFieldId);
			if (control === 'auto') delete overrides.annotationControls[key];
			else overrides.annotationControls[key] = control;
		},
		configureAdvanced(configuration) {
			if (configuration.enabled !== undefined) overrides.advanced.enabled = configuration.enabled;
			if (configuration.annotationIds) overrides.advanced.annotationIds = knownAnnotationIds(corpus, configuration.annotationIds, 'configureAdvanced');
			if (configuration.defaultAnnotationId !== undefined) {
				const [known] = knownAnnotationIds(corpus, [configuration.defaultAnnotationId], 'configureAdvanced');
				if (known) overrides.advanced.defaultAnnotationId = known;
			}
		},
		setMetadataFilters(metadataFieldIds) {
			overrides.metadataFieldIds = knownMetadataIds(corpus, metadataFieldIds, 'setMetadataFilters');
		},
		filterMetadataFields(include) {
			overrides.hiddenMetadataFieldIds = corpus.allMetadataFields.filter(field => !include(field)).map(field => field.id);
		},
		configureWithin(configuration) {
			if (configuration.enabled !== undefined) overrides.within.enabled = configuration.enabled;
			if (configuration.elements) overrides.within.elements = configuration.elements.map(option => ({ ...option }));
			if (configuration.includeElement !== undefined) overrides.within.includeElement = configuration.includeElement;
			if (configuration.includeAttribute !== undefined) overrides.within.includeAttribute = configuration.includeAttribute;
		},
		configureAlignBy(configuration) {
			if (configuration.enabled !== undefined) overrides.alignBy.enabled = configuration.enabled;
			if (configuration.elements) overrides.alignBy.elements = configuration.elements.map(option => ({ ...option }));
			if (configuration.defaultValue !== undefined) overrides.alignBy.defaultValue = configuration.defaultValue;
		},
		configureExplore(configuration) {
			if (configuration.searchAnnotationIds) overrides.explore.searchAnnotationIds = knownAnnotationIds(corpus, configuration.searchAnnotationIds, 'configureExplore');
			if (configuration.defaultSearchAnnotationId !== undefined) overrides.explore.defaultSearchAnnotationId = configuration.defaultSearchAnnotationId;
			if (configuration.groupAnnotationIds) overrides.explore.groupAnnotationIds = knownGroupAnnotationIds(corpus, configuration.groupAnnotationIds, 'configureExplore');
			if (configuration.defaultGroupAnnotationId !== undefined) overrides.explore.defaultGroupAnnotationId = configuration.defaultGroupAnnotationId;
			if (configuration.annotationGroupLabelsVisible !== undefined) overrides.explore.annotationGroupLabelsVisible = configuration.annotationGroupLabelsVisible;
			if (configuration.corpora?.groupMetadataIds) overrides.explore.groupMetadataIds = knownMetadataIds(corpus, configuration.corpora.groupMetadataIds, 'configureExplore');
			if (configuration.corpora?.defaultGroupMetadataId !== undefined) overrides.explore.defaultGroupMetadataId = configuration.corpora.defaultGroupMetadataId;
			if (configuration.corpora?.metadataGroupLabelsVisible !== undefined) overrides.explore.metadataGroupLabelsVisible = configuration.corpora.metadataGroupLabelsVisible;
		},
		configureLexicon({ database }) {
			overrides.lexiconDatabase = database;
		},
		addSpanFilter(filter) {
			const id = spanFilterId(filter.elementName, filter.attributeName);
			const options = availableSpanOptions(corpus, filter);
			const requestedControl = filter.control ?? 'auto';
			const control: SearchFormWithinAttribute['control'] =
				requestedControl === 'range' ? 'range' : requestedControl === 'select' || (requestedControl === 'auto' && options) ? { type: 'select', options: options ?? [] } : 'text';
			const attribute = { ...filter, id, control };
			const existing = overrides.spanFilters.findIndex(current => current.id === id);
			if (existing === -1) overrides.spanFilters.push(attribute);
			else overrides.spanFilters.splice(existing, 1, attribute);
			return searchFormIds.withinFilter(filter.elementName, filter.attributeName);
		},
	} satisfies SearchFormConfigurationApi;
	return { api, overrides };
}
