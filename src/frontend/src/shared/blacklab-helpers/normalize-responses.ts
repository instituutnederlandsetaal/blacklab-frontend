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
import { mapReduce } from '@/shared/utils/array-utils';

/** Find the annotation that contains annotationId as on of its subAnnotations. */
function findParentAnnotation(annotatedField: BLTypes.BLAnnotatedField, annotationId: string): string | undefined {
	const annotations = Object.entries(annotatedField.annotations);
	const parent = annotations.find(([, annotation]) => (annotation.subannotations ? annotation.subannotations.includes(annotationId) : false));
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
	return BLTypes.isBLAnnotationV5(annotation) ? annotation.custom?.displayName || annotationId : annotation.displayName || annotationId;
}

function getAnnotationDescription(annotation: BLTypes.BLAnnotation): string {
	return BLTypes.isBLAnnotationV5(annotation) ? annotation.custom?.description || '' : annotation.description || '';
}

function getAnnotationUiType(field: BLTypes.BLAnnotation | NormalizedAnnotation): string {
	if ('id' in field) return (field.uiType || '').trim().toLowerCase();
	return (BLTypes.isBLAnnotationV5(field) ? field.custom?.uiType || '' : field.uiType || '').trim().toLowerCase();
}

function getMetadataDisplayName(field: BLTypes.BLMetadataField, fieldId: string): string {
	return BLTypes.isMetadataFieldV5(field) ? field.custom.displayName || fieldId : field.displayName || fieldId;
}

function getMetadataDescription(field: BLTypes.BLMetadataField): string {
	return BLTypes.isMetadataFieldV5(field) ? field.custom.description || '' : field.description || '';
}

function getMetadataDisplayValues(field: BLTypes.BLMetadataField): Record<string, string> {
	return BLTypes.isMetadataFieldV5(field) ? field.custom.displayValues || {} : field.displayValues || {};
}

function getMetadataUiType(field: BLTypes.BLMetadataField): string {
	return (BLTypes.isMetadataFieldV5(field) ? field.custom.uiType || '' : field.uiType || '').trim().toLowerCase();
}

function getAnnotatedFieldDisplayName(field: BLTypes.BLAnnotatedField, fieldId: string): string {
	return BLTypes.isAnnotatedFieldV5(field) ? field.custom.displayName || fieldId : field.displayName || fieldId;
}

function getAnnotatedFieldDescription(field: BLTypes.BLAnnotatedField): string {
	return BLTypes.isAnnotatedFieldV5(field) ? field.custom.description || '' : field.description || '';
}

function getAnnotatedFieldDisplayOrder(field: BLTypes.BLAnnotatedField): string[] | undefined {
	return BLTypes.isAnnotatedFieldV5(field) ? field.custom.displayOrder : field.displayOrder;
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
	const values = 'id' in field ? field.values : BLTypes.isBLAnnotationV4(field) ? field.values?.map(value => ({ label: value, value, title: null })) : Object.keys(field.terms ?? {}).map(value => ({ label: value, value, title: null }));
	const hasAllValues = values && ('valueListComplete' in field ? !!field.valueListComplete : true);

	if (!uiType) {
		return values?.length ? (hasAllValues ? 'select' : 'combobox') : 'text';
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
	const values = BLTypes.isBLAnnotationV5(annotation) ? Object.keys(annotation.terms ?? {}) : annotation.values;

	return {
		annotatedFieldId,
		caseSensitive: annotation.sensitivity === 'SENSITIVE_AND_INSENSITIVE' || annotation.sensitivity === 'ONLY_SENSITIVE',
		defaultDescription: getAnnotationDescription(annotation),
		defaultDisplayName: getAnnotationDisplayName(annotation, annotationId),
		hasForwardIndex: annotation.hasForwardIndex,
		id: annotationId,
		isInternal: annotation.isInternal,
		isMainAnnotation: annotationId === annotatedField.mainAnnotation,
		offsetsAlternative: annotation.offsetsAlternative,
		subAnnotations: annotation.subannotations,
		parentAnnotationId: findParentAnnotation(annotatedField, annotationId),
		uiType: normalizeAnnotationUIType(annotation),
		values: annotation.valueListComplete && values && values.length > 0 ? values.map(value => ({ label: value, value, title: null })) : undefined,
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
	const annotations: Array<[string, BLTypes.BLAnnotation]> = Object.entries(field.annotations);
	const tokenCount = BLTypes.isAnnotatedFieldV5(field) ? field.count.tokens : field.tokenCount;
	const documentCount = BLTypes.isAnnotatedFieldV5(field) ? field.count.documents : field.documentCount;

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
		hasLengthTokens: false,
		hasXmlTags: !!field.hasXmlTags,
		id: fieldId,
		isAnnotatedField: field.isAnnotatedField ?? true,
		mainAnnotationId: field.mainAnnotation,
		isParallel,
		prefix: parallelFieldParts.prefix,
		version: parallelFieldParts.version,
		tokenCount,
		documentCount,
	};
}

function normalizeAnnotationGroups(blIndex: BLTypes.BLIndexMetadata): NormalizedAnnotationGroup[] {
	const fieldId = blIndex.mainAnnotatedField || Object.keys(blIndex.annotatedFields)[0];
	const field = blIndex.annotatedFields[fieldId];
	const annotationGroups = BLTypes.isBLIndexMetadataV5(blIndex) ? blIndex.custom?.annotationGroups : blIndex.annotationGroups;
	const annotations = field.annotations;

	const seenAnnotations = new Set<string>();

	let remainderGroup: NormalizedAnnotationGroup | undefined;
	const normalized =
		annotationGroups?.[fieldId]?.map<NormalizedAnnotationGroup>(group => {
			const g = {
				id: BLTypes.isAnnotationGroupV5(group) ? group.groupName : group.name,
				annotatedFieldId: fieldId,
				entries: group.annotations.filter(annotationName => {
					// mark seen:
					seenAnnotations.add(annotationName);
					return !!annotations[annotationName];
				}),
				// explicit groups are never the remainder group:
				// even when addRemainingAnnotations is set, we will create a separate remainder group for dangling annotations.
				isRemainderGroup: false,
			};
			if (BLTypes.isAnnotationGroupV5(group) && group.addRemainingAnnotations) remainderGroup ??= g;
			return g;
		}) ?? [];

	// now sort all remaining annots
	const remnantInOrder: string[] = [];
	// first add explicitly sorted ones
	getAnnotatedFieldDisplayOrder(field)?.forEach(id => {
		if (annotations[id]) {
			if (!seenAnnotations.has(id)) {
				remnantInOrder.push(id);
			}
			seenAnnotations.add(id);
		}
	});
	// finally add remaining unseens - in order of displayName
	remnantInOrder.push(
		...Object.keys(annotations)
			.filter(a => !seenAnnotations.has(a))
			.sort((a, b) => getAnnotationDisplayName(annotations[a], a).localeCompare(getAnnotationDisplayName(annotations[b], b))),
	);

	// Now assign groups to those remainders.
	// Find explicit remnant group
	if (remainderGroup) remainderGroup.entries.push(...remnantInOrder);
	else if (remnantInOrder.length) {
		normalized.push({
			id: 'Other',
			annotatedFieldId: fieldId,
			entries: remnantInOrder,
			isRemainderGroup: normalized.length > 0, // only remainder if no explicit groups otherwise.
		});
	}

	return normalized.filter(g => g.entries.length); // remove empty groups.
}

function normalizeMetadataGroups(blIndex: BLTypes.BLIndexMetadata): NormalizedMetadataGroup[] {
	const metadataGroupsNormalized: NormalizedMetadataGroup[] = [];
	const idsNotInGroups = new Set(Object.keys(blIndex.metadataFields));
	const metadataGroups = BLTypes.isBLIndexMetadataV5(blIndex) ? blIndex.custom?.metadataFieldGroups : blIndex.metadataFieldGroups;

	let hasUserDefinedGroup = false;

	// Copy predefined groups, removing nonexistant fields and empty groups
	for (const group of metadataGroups ?? []) {
		const fields = BLTypes.isMetadataGroupV5(group) ? group.fieldNamesInGroup : group.fields;

		const normalizedGroup: NormalizedMetadataGroup = {
			entries: fields.filter(id => blIndex.metadataFields[id] != null),
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
	const tokenCount = BLTypes.isIndexV5(blIndex) ? blIndex.count.tokens : blIndex.tokenCount;
	const documentCount = BLTypes.isIndexV5(blIndex) ? blIndex.count.documents : blIndex.documentCount;

	return {
		description: '',
		displayName: id.split(':')[1] || id,
		documentFormat: blIndex.documentFormat,
		id,
		indexProgress: blIndex.indexProgress || null,
		owner: id.substring(0, id.indexOf(':')) || null,
		status: blIndex.status,
		timeModified: blIndex.timeModified,
		tokenCount: tokenCount || 0,
		documentCount: documentCount || 0,
	};
}

export function normalizeIndex(blIndex: BLTypes.BLIndexMetadata, relations: BLTypes.BLRelationInfo): NormalizedIndex {
	const annotationGroupsNormalized = normalizeAnnotationGroups(blIndex);
	const metadataGroupsNormalized = normalizeMetadataGroups(blIndex);
	const indexId = 'name' in blIndex ? blIndex.name : 'indexName' in blIndex ? blIndex.indexName : 'corpusName' in blIndex ? blIndex.corpusName : undefined;
	if (!indexId) throw new Error('Index metadata is missing an id (name, indexName or corpusName)');
	const annotatedFields: Array<[string, BLTypes.BLAnnotatedField]> = Object.entries(blIndex.annotatedFields);
	const isV5 = BLTypes.isBLIndexMetadataV5(blIndex);
	const fieldInfo = isV5 ? { pidField: blIndex.pidField, titleField: blIndex.custom?.titleField, authorField: blIndex.custom?.authorField, dateField: blIndex.custom?.dateField } : blIndex.fieldInfo;
	const tokenCount = isV5 ? blIndex.count.tokens : blIndex.tokenCount;
	const documentCount = isV5 ? blIndex.count.documents : blIndex.documentCount;
	const description = isV5 ? blIndex.custom?.description : blIndex.description;
	const displayName = isV5 ? blIndex.custom?.displayName : blIndex.displayName;
	const textDirection = isV5 ? blIndex.custom?.textDirection : blIndex.textDirection;

	return {
		annotatedFields: mapReduce(
			annotatedFields.map(([id, field]) => normalizeAnnotatedField(id, field)),
			'id',
		),
		annotationGroups: annotationGroupsNormalized,
		contentViewable: blIndex.contentViewable,
		description: description || '',
		displayName: displayName || getCorpusIdWithoutOwner(indexId),
		// If BlackLab is an old format, this property doesn't exist
		// If BlackLab is new, and the property is still missing, it's 0 (tokenCount and documentCount are always omitted when 0)
		// Encode this in the fallback value, then later request the actual number of documents
		documentCount: documentCount ?? 0,
		documentFormat: blIndex.documentFormat,
		fieldInfo,
		id: indexId,
		metadataFieldGroups: metadataGroupsNormalized,
		metadataFields: mapReduce(
			Object.entries(blIndex.metadataFields).map(([id, field]) => normalizeMetadata(id, field)),
			'id',
		),
		owner: getCorpusOwner(indexId),
		textDirection: textDirection || 'ltr',
		timeModified: blIndex.versionInfo?.timeModified || '',
		tokenCount: tokenCount ?? 0,
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
