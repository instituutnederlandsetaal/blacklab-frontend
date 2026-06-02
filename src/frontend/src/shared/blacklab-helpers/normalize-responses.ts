import type {
	NormalizedIndex,
	NormalizedAnnotation,
	NormalizedAnnotatedField,
	NormalizedMetadataField,
	NormalizedFormat,
	NormalizedMetadataGroup,
	NormalizedAnnotationGroup,
	NormalizedIndexBase,
} from '@/types/apptypes';
import * as BLTypes from '@/types/blacklabtypes';

import { getParallelFieldParts, PARALLEL_FIELD_SEPARATOR } from '@/shared/blacklab-helpers/parallel-helper';
import { mapReduce } from '@/shared/utils/map-reduce';

/** Find the annotation that contains annotationId as on of its subAnnotations. */
function findParentAnnotation(annotatedField: BLTypes.BLAnnotatedField, annotationId: string): string | undefined {
	const annotations = BLTypes.isAnnotatedFieldV1(annotatedField) ? Object.entries(annotatedField.properties) : Object.entries(annotatedField.annotations);
	const parent: [string, BLTypes.BLAnnotation] | undefined = annotations.find(a => (a[1].subannotations ? a[1].subannotations!.includes(annotationId) : false));
	return parent ? parent[0] : undefined;
}

export const uiTypeSupport: {
	[key: string]: { [key: string]: Array<NormalizedAnnotation['uiType']> };
} = {
	search: {
		simple: ['combobox', 'select', 'lexicon'],
		extended: ['combobox', 'select', 'pos'],
	},
	explore: {
		ngram: ['combobox', 'select'],
	},
};

export function getCorpusOwner(indexId: string): string | null {
	return indexId.substring(0, indexId.indexOf(':')) || null;
}
export function getCorpusIdWithoutOwner(indexId: string): string {
	return indexId.split(':')[1] || indexId;
}

export function getCorrectUiType<T extends NormalizedAnnotation['uiType']>(allowed: T[], actual: T): T {
	return allowed.includes(actual) ? actual : ('text' as any);
}

function getAnnotationDisplayName(annotation: BLTypes.BLAnnotation, annotationId: string): string {
	return annotation.custom?.displayName || annotation.displayName || annotationId;
}

function getAnnotationDescription(annotation: BLTypes.BLAnnotation): string {
	return annotation.custom?.description || annotation.description || '';
}

function getAnnotationUiType(field: BLTypes.BLAnnotation | NormalizedAnnotation): string {
	const customUiType = (field as BLTypes.BLAnnotation).custom?.uiType;
	return (customUiType || field.uiType || '').trim().toLowerCase();
}

function getMetadataDisplayName(field: BLTypes.BLMetadataField, fieldId: string): string {
	return field.custom?.displayName || field.displayName || fieldId;
}

function getMetadataDescription(field: BLTypes.BLMetadataField): string {
	return field.custom?.description || field.description || '';
}

function getMetadataDisplayValues(field: BLTypes.BLMetadataField): Record<string, string> {
	return field.custom?.displayValues || field.displayValues || {};
}

function getMetadataUiType(field: BLTypes.BLMetadataField): string {
	return (field.custom?.uiType || field.uiType || '').trim().toLowerCase();
}

function getAnnotatedFieldDisplayName(field: BLTypes.BLAnnotatedField, fieldId: string): string {
	return field.custom?.displayName || field.displayName || fieldId;
}

function getAnnotatedFieldDescription(field: BLTypes.BLAnnotatedField): string {
	return field.custom?.description || field.description || '';
}

function getAnnotatedFieldDisplayOrder(field: BLTypes.BLAnnotatedField): string[] | undefined {
	if (BLTypes.isAnnotatedFieldV1(field)) return undefined;
	return field.custom?.displayOrder || field.displayOrder;
}

function normalizeMetadataUIType(field: BLTypes.BLMetadataField): NormalizedMetadataField['uiType'] {
	const uiType = getMetadataUiType(field);

	if (!uiType) {
		return Object.keys(field.fieldValues).length > 0 ? (field.valueListComplete ? 'select' : 'combobox') : 'text';
	}

	switch (uiType) {
		case 'autocomplete':
		case 'combobox':
			return 'combobox';
		case 'range':
			return uiType;
		case 'select':
		case 'dropdown':
			return field.valueListComplete ? 'select' : 'combobox';
		case 'checkbox':
		case 'radio':
			return field.valueListComplete ? uiType : 'combobox';
		case 'date':
			return 'date';
		default:
			return 'text';
	}
}

export function normalizeAnnotationUIType(field: BLTypes.BLAnnotation | NormalizedAnnotation): NormalizedAnnotation['uiType'] {
	const uiType = getAnnotationUiType(field);

	// valueListComplete only present on non-normalized annotation
	// if the field is normalized, and we have a values property, we can assume that the list is complete.
	const hasAllValues = field.values && ('valueListComplete' in field ? !!field.valueListComplete : true);

	if (!uiType) {
		return field.values ? (hasAllValues ? 'select' : 'combobox') : 'text';
	}

	switch (uiType) {
		case 'dropdown':
		case 'select':
			return hasAllValues ? 'select' : 'combobox';
		case 'autocomplete':
		case 'combobox':
			return 'combobox';
		case 'lexicon':
		case 'pos':
			return uiType;
		default:
			return 'text';
	}
}

function normalizeAnnotation(annotatedFieldId: string, annotatedField: BLTypes.BLAnnotatedField, annotationId: string, annotation: BLTypes.BLAnnotation): NormalizedAnnotation {
	const mainAnnotationId = BLTypes.isAnnotatedFieldV1(annotatedField) ? annotatedField.mainProperty : annotatedField.mainAnnotation;

	return {
		annotatedFieldId,
		caseSensitive: annotation.sensitivity === 'SENSITIVE_AND_INSENSITIVE' || annotation.sensitivity === 'ONLY_SENSITIVE',
		defaultDescription: getAnnotationDescription(annotation),
		defaultDisplayName: getAnnotationDisplayName(annotation, annotationId),
		hasForwardIndex: annotation.hasForwardIndex,
		id: annotationId,
		isInternal: annotation.isInternal,
		isMainAnnotation: annotationId === mainAnnotationId,
		offsetsAlternative: annotation.offsetsAlternative,
		subAnnotations: annotation.subannotations,
		parentAnnotationId: findParentAnnotation(annotatedField, annotationId),
		uiType: normalizeAnnotationUIType(annotation),
		values: annotation.valueListComplete && annotation.values && annotation.values.length > 0 ? annotation.values.map(v => ({ label: v, value: v, title: null })) : undefined,
	};
}

function normalizeMetadata(fieldId: string, field: BLTypes.BLMetadataField): NormalizedMetadataField {
	const displayValues = getMetadataDisplayValues(field);

	return {
		defaultDescription: getMetadataDescription(field),
		defaultDisplayName: getMetadataDisplayName(field, fieldId),
		id: fieldId,
		uiType: normalizeMetadataUIType(field),
		values: ['select', 'checkbox', 'radio'].includes(normalizeMetadataUIType(field))
			? Object.keys(field.fieldValues)
					.map(value => {
						return {
							value,
							label: displayValues[value] != null ? displayValues[value] : value,
							title: null,
						};
					})
					.sort((a, b) => a.value.localeCompare(b.value))
			: undefined,
	};
}

function normalizeAnnotatedField(fieldId: string, field: BLTypes.BLAnnotatedField): NormalizedAnnotatedField {
	const annotations: Array<[string, BLTypes.BLAnnotation]> = BLTypes.isAnnotatedFieldV1(field) ? Object.entries(field.properties) : Object.entries(field.annotations);
	const mainAnnotationId: string = BLTypes.isAnnotatedFieldV1(field) ? field.mainProperty : field.mainAnnotation;

	const isParallel = fieldId.includes(PARALLEL_FIELD_SEPARATOR);
	const parallelFieldParts = getParallelFieldParts(fieldId);
	return {
		annotations: mapReduce(
			annotations.map(([id, annot]) => normalizeAnnotation(fieldId, field, id, annot)),
			'id',
		),
		defaultDescription: getAnnotatedFieldDescription(field),
		defaultDisplayName: getAnnotatedFieldDisplayName(field, fieldId),
		hasContentStore: field.hasContentStore,
		hasLengthTokens: !!field.hasLengthTokens,
		hasXmlTags: field.hasXmlTags,
		id: fieldId,
		isAnnotatedField: field.isAnnotatedField ?? true,
		mainAnnotationId,
		isParallel,
		prefix: parallelFieldParts.prefix,
		version: parallelFieldParts.version,
		tokenCount: field.tokenCount,
		documentCount: field.documentCount,
	};
}

function normalizeAnnotationGroups(blIndex: BLTypes.BLIndexMetadata): NormalizedAnnotationGroup[] {
	let annotationGroupsNormalized: NormalizedAnnotationGroup[] = [];
	const fieldId = blIndex.mainAnnotatedField || Object.keys(blIndex.annotatedFields)[0];
	const field = blIndex.annotatedFields[fieldId];
	const annotationGroups = blIndex.custom?.annotationGroups || blIndex.annotationGroups;

	const annotations = BLTypes.isAnnotatedFieldV1(field) ? field.properties : field.annotations;
	const annotationNamesNotInGroups = new Set(Object.keys(annotations));

	let hasUserDefinedGroup = false;

	// Copy all predefined groups, removing nonexistant annotations and groups
	if (annotationGroups && annotationGroups[fieldId]) {
		for (const group of annotationGroups[fieldId]) {
			const normalizedGroup: NormalizedAnnotationGroup = {
				annotatedFieldId: fieldId,
				id: group.name,
				entries: group.annotations.filter(annotationName => annotations[annotationName] != null),
				isRemainderGroup: false,
			};
			if (normalizedGroup.entries.length) {
				annotationGroupsNormalized.push(normalizedGroup);
				normalizedGroup.entries.forEach(annotationName => annotationNamesNotInGroups.delete(annotationName));
				hasUserDefinedGroup = true;
			}
		}
	}

	// Add all remaining annotations to the remainder group.
	// First add all explicitly ordered annotations (annotatedField.displayOrder).
	// Finally add everything else at the end, sorted by their displayNames.
	if (annotationNamesNotInGroups.size) {
		const remainingAnnotationsToAdd = new Set(annotationNamesNotInGroups);
		const annotationNamesInRemainderGroup: string[] = [];

		// annotations in displayOrder
		if (!BLTypes.isAnnotatedFieldV1(field) && getAnnotatedFieldDisplayOrder(field)) {
			getAnnotatedFieldDisplayOrder(field)!.forEach(annotationName => {
				if (remainingAnnotationsToAdd.has(annotationName)) {
					remainingAnnotationsToAdd.delete(annotationName);
					annotationNamesInRemainderGroup.push(annotationName);
				}
			});
		}
		// Finally all non-internal annotations without entry in displayOrder
		const sortedFilteredAnnotations = [...remainingAnnotationsToAdd]
			.filter(annotationName => !annotations[annotationName].isInternal) // don't add _relation, punct, etc.
			.sort((a, b) => getAnnotationDisplayName(annotations[a], a).localeCompare(getAnnotationDisplayName(annotations[b], b)));
		annotationNamesInRemainderGroup.push(...sortedFilteredAnnotations);
		// And create the group.
		annotationGroupsNormalized.push({
			annotatedFieldId: fieldId,
			entries: annotationNamesInRemainderGroup,
			id: 'Other',
			// If there was a group defined from the index config, this is indeed the remainder group, otherwise this is just a normal group.
			isRemainderGroup: hasUserDefinedGroup,
		});
	}

	return annotationGroupsNormalized;
}

function normalizeMetadataGroups(blIndex: BLTypes.BLIndexMetadata): NormalizedMetadataGroup[] {
	const metadataGroupsNormalized: NormalizedMetadataGroup[] = [];
	const idsNotInGroups = new Set(Object.keys(blIndex.metadataFields));
	const metadataGroups = blIndex.custom?.metadataFieldGroups || blIndex.metadataFieldGroups;

	let hasUserDefinedGroup = false;

	// Copy predefined groups, removing nonexistant fields and empty groups
	for (const group of metadataGroups ?? []) {
		const normalizedGroup: NormalizedMetadataGroup = {
			entries: group.fields.filter(id => blIndex.metadataFields[id] != null),
			isRemainderGroup: false,
			id: group.name,
		};
		if (normalizedGroup.entries.length) {
			metadataGroupsNormalized.push(normalizedGroup);
			normalizedGroup.entries.forEach(id => idsNotInGroups.delete(id));
			hasUserDefinedGroup = true;
		}
	}

	// Create remainder group
	if (idsNotInGroups.size) {
		metadataGroupsNormalized.push({
			entries: [...idsNotInGroups].sort((a, b) => getMetadataDisplayName(blIndex.metadataFields[a], a).localeCompare(getMetadataDisplayName(blIndex.metadataFields[b], b))),
			// If there was a group defined from the index config, this is indeed the remainder group, otherwise this is just a normal group.
			isRemainderGroup: hasUserDefinedGroup,
			id: 'Metadata',
		});
	}
	return metadataGroupsNormalized;
}

// -------------

export function normalizeIndexBase(blIndex: BLTypes.BLIndex, id: string): NormalizedIndexBase {
	return {
		description: blIndex.description || '',
		displayName: blIndex.displayName || id.split(':')[1] || id,
		documentFormat: blIndex.documentFormat,
		id,
		indexProgress: blIndex.indexProgress || null,
		owner: id.substring(0, id.indexOf(':')) || null,
		status: blIndex.status,
		timeModified: blIndex.timeModified,
		tokenCount: blIndex.count?.tokens || blIndex.tokenCount || 0,
		documentCount: blIndex.count?.documents || blIndex.documentCount || 0,
	};
}

export function normalizeIndex(blIndex: BLTypes.BLIndexMetadata, relations: BLTypes.BLRelationInfo): NormalizedIndex {
	const annotationGroupsNormalized = normalizeAnnotationGroups(blIndex);
	const metadataGroupsNormalized = normalizeMetadataGroups(blIndex);
	const indexId = blIndex.name || blIndex.indexName || '';
	const annotatedFields: Array<[string, BLTypes.BLAnnotatedField]> = Object.entries(blIndex.annotatedFields);
	const custom = blIndex.custom;
	const fieldInfo = custom?.specialFields || blIndex.fieldInfo || (blIndex.pidField ? { pidField: blIndex.pidField } : {});

	return {
		annotatedFields: mapReduce(
			annotatedFields.map(([id, field]) => normalizeAnnotatedField(id, field)),
			'id',
		),
		annotationGroups: annotationGroupsNormalized,
		contentViewable: blIndex.contentViewable,
		description: custom?.description || blIndex.description || '',
		displayName: custom?.displayName || blIndex.displayName || getCorpusIdWithoutOwner(indexId),
		// If BlackLab is an old format, this property doesn't exist
		// If BlackLab is new, and the property is still missing, it's 0 (tokenCount and documentCount are always omitted when 0)
		// Encode this in the fallback value, then later request the actual number of documents
		documentCount: blIndex.documentCount || 0,
		documentFormat: custom?.documentFormat || blIndex.documentFormat,
		fieldInfo,
		id: indexId,
		metadataFieldGroups: metadataGroupsNormalized,
		metadataFields: mapReduce(
			Object.entries(blIndex.metadataFields).map(([id, field]) => normalizeMetadata(id, field)),
			'id',
		),
		owner: getCorpusOwner(indexId),
		textDirection: custom?.textDirection || blIndex.textDirection || 'ltr',
		timeModified: blIndex.timeModified || blIndex.versionInfo?.timeModified || '',
		tokenCount: blIndex.tokenCount || 0,
		status: blIndex.status,
		indexProgress: blIndex.indexProgress || null,
		mainAnnotatedField: blIndex.mainAnnotatedField || Object.keys(blIndex.annotatedFields)[0],
		relations,
	};
}

/**
 * @param id - full id of the format, including userName portion (if applicable)
 * @param format as received from the server
 */
export function normalizeFormat(id: string, format: BLTypes.BLFormat): NormalizedFormat {
	return {
		...format,

		id,
		owner: id.substring(0, id.indexOf(':')) || null,
		shortId: id.substr(id.indexOf(':') + 1),

		displayName: format.displayName || id.substr(id.indexOf(':') + 1),
		helpUrl: format.helpUrl || null,
		description: format.description || null,
	};
}

export function normalizeFormats(formats: BLTypes.BLFormats): NormalizedFormat[] {
	return Object.entries(formats.supportedInputFormats).map(([key, value]) => normalizeFormat(key, value));
}
