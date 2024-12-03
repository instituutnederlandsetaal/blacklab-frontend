import type {NormalizedIndex, NormalizedAnnotation, NormalizedAnnotatedField, NormalizedMetadataField, NormalizedFormat, NormalizedMetadataGroup, NormalizedAnnotationGroup, NormalizedIndexBase} from '@/types/apptypes';
import * as BLTypes from '@/types/blacklabtypes';
import { getParallelFieldParts, mapReduce, PARALLEL_FIELD_SEPARATOR } from '@/utils';

/** Find the annotation that contains annotationId as on of its subAnnotations. */
function findParentAnnotation(annotatedField: BLTypes.BLAnnotatedField, annotationId: string): string|undefined {
	const annotations = BLTypes.isAnnotatedFieldV1(annotatedField) ? Object.entries(annotatedField.properties) : Object.entries(annotatedField.annotations);
	const parent: [string, BLTypes.BLAnnotation]|undefined = annotations.find(a => a[1].subannotations ? a[1].subannotations!.includes(annotationId) : false);
	return parent ? parent[0] : undefined;
}

function normalizeMetadataUIType(field: BLTypes.BLMetadataField): NormalizedMetadataField['uiType'] {
	const uiType = field.uiType.trim().toLowerCase();

	if (!uiType) {
		return Object.keys(field.fieldValues).length > 0 ? field.valueListComplete ? 'select' : 'combobox' : 'text';
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
		default: return 'text';
	}
}

function normalizeAnnotationUIType(field: BLTypes.BLAnnotation): NormalizedAnnotation['uiType'] {
	const uiType = field.uiType.trim().toLowerCase();

	if (!uiType) {
		return field.values ? field.valueListComplete ? 'select' : 'combobox' : 'text';
	}

	switch (uiType) {
		case 'dropdown':
		case 'select':
			return field.values && field.valueListComplete ? 'select' : 'combobox';
		case 'autocomplete':
		case 'combobox':
			return 'combobox';
		case 'lexicon':
		case 'pos':
			return uiType;
		default: return 'text';
	}
}

function normalizeAnnotation(annotatedField: BLTypes.BLAnnotatedField, annotationId: string, annotation: BLTypes.BLAnnotation): NormalizedAnnotation{
	const annotatedFieldId = annotatedField.fieldName;
	const mainAnnotationId = BLTypes.isAnnotatedFieldV1(annotatedField) ? annotatedField.mainProperty : annotatedField.mainAnnotation;

	return {
		annotatedFieldId,
		caseSensitive: annotation.sensitivity === 'SENSITIVE_AND_INSENSITIVE',
		defaultDescription: annotation.description,
		defaultDisplayName: annotation.displayName || annotationId,
		hasForwardIndex: annotation.hasForwardIndex,
		id: annotationId,
		isInternal: annotation.isInternal,
		isMainAnnotation: annotationId === mainAnnotationId,
		offsetsAlternative: annotation.offsetsAlternative,
		subAnnotations: annotation.subannotations,
		parentAnnotationId: findParentAnnotation(annotatedField, annotationId),
		uiType: normalizeAnnotationUIType(annotation),
		values: annotation.valueListComplete && annotation.values && annotation.values.length > 0 ? annotation.values.map(v => ({label: v, value: v, title: null})) : undefined,
	};
}

function normalizeMetadata(field: BLTypes.BLMetadataField): NormalizedMetadataField {
	return {
		defaultDescription: field.description,
		defaultDisplayName: field.displayName || field.fieldName,
		id: field.fieldName,
		uiType: normalizeMetadataUIType(field),
		values: ['select', 'checkbox', 'radio'].includes(normalizeMetadataUIType(field)) ? Object.keys(field.fieldValues).map(value => {
			return {
				value,
				label: field.displayValues[value] != null ? field.displayValues[value] : value,
				title: null
			};
		}).sort((a, b) => a.value.localeCompare(b.value)) : undefined,
	};
}

function normalizeAnnotatedField(field: BLTypes.BLAnnotatedField): NormalizedAnnotatedField {
	const annotations: Array<[string, BLTypes.BLAnnotation]> = BLTypes.isAnnotatedFieldV1(field) ? Object.entries(field.properties) : Object.entries(field.annotations);
	const mainAnnotationId: string = BLTypes.isAnnotatedFieldV1(field) ? field.mainProperty : field.mainAnnotation;

	const isParallel = field.fieldName.includes(PARALLEL_FIELD_SEPARATOR);
	const parallelFieldParts = getParallelFieldParts(field.fieldName);
	return {
		annotations: mapReduce(annotations.map(([id, annot]) => normalizeAnnotation(field, id, annot)), 'id'),
		defaultDescription: field.description,
		defaultDisplayName: field.displayName,
		hasContentStore: field.hasContentStore,
		hasLengthTokens: field.hasLengthTokens,
		hasXmlTags: field.hasXmlTags,
		id: field.fieldName,
		isAnnotatedField: field.isAnnotatedField,
		mainAnnotationId,
		isParallel,
		prefix: parallelFieldParts.prefix,
		version: parallelFieldParts.version,
	};
}

function normalizeAnnotationGroups(blIndex: BLTypes.BLIndexMetadata): NormalizedAnnotationGroup[] {
	let annotationGroupsNormalized: NormalizedAnnotationGroup[] = [];
	const fieldId = blIndex.mainAnnotatedField || Object.keys(blIndex.annotatedFields)[0];
	const field = blIndex.annotatedFields[fieldId];

	const annotations = BLTypes.isAnnotatedFieldV1(field) ? field.properties : field.annotations;
	const annotationNamesNotInGroups = new Set(Object.keys(annotations));

	let hasUserDefinedGroup = false;

	// Copy all predefined groups, removing nonexistant annotations and groups
	if (blIndex.annotationGroups && blIndex.annotationGroups[fieldId]) {
		for (const group of blIndex.annotationGroups[fieldId]) {
			const normalizedGroup: NormalizedAnnotationGroup = {
				annotatedFieldId: fieldId,
				id: group.name,
				entries: group.annotations.filter(annotationName => annotations[annotationName] != null),
				isRemainderGroup: false
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
		if (!BLTypes.isAnnotatedFieldV1(field) && field.displayOrder) {
			field.displayOrder.forEach(annotationName => {
				if (remainingAnnotationsToAdd.has(annotationName)) {
					remainingAnnotationsToAdd.delete(annotationName);
					annotationNamesInRemainderGroup.push(annotationName);
				}
			});
		}
		// Finally all non-internal annotations without entry in displayOrder
		const sortedFilteredAnnotations = [...remainingAnnotationsToAdd]
			.filter(annotationName => !annotations[annotationName].isInternal) // don't add _relation, punct, etc.
			.sort((a, b) => annotations[a].displayName.localeCompare(annotations[b].displayName));
		annotationNamesInRemainderGroup.push(...sortedFilteredAnnotations);
		// And create the group.
		annotationGroupsNormalized.push({
			annotatedFieldId: fieldId,
			entries: annotationNamesInRemainderGroup,
			id: 'Other',
			// If there was a group defined from the index config, this is indeed the remainder group, otherwise this is just a normal group.
			isRemainderGroup: hasUserDefinedGroup
		});
	}

	return annotationGroupsNormalized;
}

function normalizeMetadataGroups(blIndex: BLTypes.BLIndexMetadata): NormalizedMetadataGroup[] {
	const metadataGroupsNormalized: NormalizedMetadataGroup[] = [];
	const idsNotInGroups = new Set(Object.keys(blIndex.metadataFields));

	let hasUserDefinedGroup = false;

	// Copy predefined groups, removing nonexistant fields and empty groups
	for (const group of blIndex.metadataFieldGroups) {
		const normalizedGroup: NormalizedMetadataGroup = {
			entries: group.fields.filter(id => blIndex.metadataFields[id] != null),
			isRemainderGroup: false,
			id: group.name
		};
		if (normalizedGroup.entries.length) {
			metadataGroupsNormalized.push(normalizedGroup);
			normalizedGroup.entries.forEach(id => idsNotInGroups.delete(id));
			hasUserDefinedGroup = true;
		}
	}

	// Create remainder group
	if(idsNotInGroups.size) {
		metadataGroupsNormalized.push({
			entries: [...idsNotInGroups].sort((a, b) => blIndex.metadataFields[a].displayName.localeCompare(blIndex.metadataFields[b].displayName)),
			// If there was a group defined from the index config, this is indeed the remainder group, otherwise this is just a normal group.
			isRemainderGroup: hasUserDefinedGroup,
			id: 'Metadata'
		});
	}
	return metadataGroupsNormalized;
}

// -------------

export function normalizeIndexBase(blIndex: BLTypes.BLIndex, id: string): NormalizedIndexBase {
	return {
		description: blIndex.description || "",
		displayName: blIndex.displayName || id.split(':')[1] || id,
		documentFormat: blIndex.documentFormat,
		id,
		indexProgress: blIndex.indexProgress || null,
		owner: id.substring(0, id.indexOf(':')) || null,
		status: blIndex.status,
		timeModified: blIndex.timeModified,
		tokenCount: blIndex.tokenCount || 0,
		documentCount: blIndex.documentCount || 0
	}
}

export function normalizeIndex(blIndex: BLTypes.BLIndexMetadata, relations: BLTypes.BLRelationInfo): NormalizedIndex {
	const annotationGroupsNormalized = normalizeAnnotationGroups(blIndex);
	const metadataGroupsNormalized = normalizeMetadataGroups(blIndex);
	const annotatedFields: BLTypes.BLAnnotatedField[] = Object.values(blIndex.annotatedFields);

	return {
		annotatedFields: mapReduce(annotatedFields.map(normalizeAnnotatedField), 'id'),
		annotationGroups: annotationGroupsNormalized,
		contentViewable: blIndex.contentViewable,
		description: blIndex.description,
		displayName: blIndex.displayName,
		// If BlackLab is an old format, this property doesn't exist
		// If BlackLab is new, and the property is still missing, it's 0 (tokenCount and documentCount are always omitted when 0)
		// Encode this in the fallback value, then later request the actual number of documents
		documentCount: blIndex.documentCount,
		documentFormat: blIndex.documentFormat,
		fieldInfo: blIndex.fieldInfo,
		id: blIndex.indexName,
		metadataFieldGroups: metadataGroupsNormalized,
		metadataFields: mapReduce(Object.values(blIndex.metadataFields).map(normalizeMetadata), 'id'),
		owner: blIndex.indexName.substring(0, blIndex.indexName.indexOf(':')) || null,
		textDirection: blIndex.textDirection,
		timeModified: blIndex.versionInfo.timeModified,
		tokenCount: blIndex.tokenCount || 0,
		status: blIndex.status,
		indexProgress: blIndex.indexProgress || null,
		mainAnnotatedField: blIndex.mainAnnotatedField || Object.keys(blIndex.annotatedFields)[0],
		relations
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
	return Object.entries(formats.supportedInputFormats)
	.map(([key, value]) => normalizeFormat(key, value));
}
