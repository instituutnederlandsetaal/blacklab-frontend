import type {
	NormalizedIndex,
	NormalizedAnnotation,
	NormalizedAnnotatedField,
	NormalizedMetadataField,
	NormalizedFormat,
	NormalizedMetadataGroup,
	NormalizedAnnotationGroup,
	NormalizedIndexBase,
	NormalizedBlacklabServer,
} from '@/types/apptypes';
import * as BLTypes from '@/types/blacklabtypes';

import { getParallelFieldParts, PARALLEL_FIELD_SEPARATOR } from '@/shared/blacklab-helpers/parallel-helper';
import { mapReduce } from '@/shared/utils/array-utils';

function getCorpusOwner(indexId: string): string | null {
	return indexId.substring(0, indexId.indexOf(':')) || null;
}
function getCorpusIdWithoutOwner(indexId: string): string {
	return indexId.split(':')[1] || indexId;
}

function normalizeMetadataUIType(fieldValues: Record<string, number | string>, valueListComplete: boolean, configuredUiType?: string): NormalizedMetadataField['uiType'] {
	const uiType = (configuredUiType || '').trim().toLowerCase();

	if (!uiType) {
		return Object.keys(fieldValues).length > 0 ? (valueListComplete ? 'select' : 'combobox') : 'text';
	}

	switch (uiType) {
		case 'autocomplete':
		case 'combobox':
			return 'combobox';
		case 'range':
			return uiType;
		case 'select':
		case 'dropdown':
			return valueListComplete ? 'select' : 'combobox';
		case 'checkbox':
		case 'radio':
			return valueListComplete ? uiType : 'combobox';
		case 'date':
			return 'date';
		default:
			return 'text';
	}
}

export function normalizeAnnotationUIType(field: BLTypes.BLAnnotation | BLTypes.BLAnnotationV4 | NormalizedAnnotation): NormalizedAnnotation['uiType'] {
	const uiType =
		'id' in field ? (field.uiType || '').trim().toLowerCase() : BLTypes.isBLAnnotationV5(field) ? (field.custom?.uiType || '').trim().toLowerCase() : (field.uiType || '').trim().toLowerCase();

	const values =
		'id' in field
			? field.values
			: BLTypes.isBLAnnotationV5(field)
				? Object.keys(field.terms ?? {}).map(value => ({ label: value, value, title: null }))
				: field.values?.map(value => ({ label: value, value, title: null }));
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

function normalizeIndexBaseV4(blIndex: BLTypes.BLIndexV4, id: string): NormalizedIndexBase {
	return {
		description: '',
		displayName: getCorpusIdWithoutOwner(id),
		documentFormat: blIndex.documentFormat,
		id,
		indexProgress: blIndex.indexProgress || null,
		owner: getCorpusOwner(id),
		status: blIndex.status,
		timeModified: blIndex.timeModified,
		tokenCount: blIndex.tokenCount || 0,
		documentCount: blIndex.documentCount || 0,
	};
}

function normalizeIndexBaseV5(blIndex: BLTypes.BLIndex, id: string): NormalizedIndexBase {
	return {
		description: '',
		displayName: getCorpusIdWithoutOwner(id),
		documentFormat: blIndex.documentFormat,
		id,
		indexProgress: blIndex.indexProgress || null,
		owner: getCorpusOwner(id),
		status: blIndex.status,
		timeModified: blIndex.timeModified,
		tokenCount: blIndex.count.tokens || 0,
		documentCount: blIndex.count.documents || 0,
		docVersions: blIndex.count.docVersions,
	};
}

/** Normalize a BlackLab v4 or v5 index summary. */
export function normalizeIndexBase(blIndex: BLTypes.BLIndex | BLTypes.BLIndexV4, id: string): NormalizedIndexBase {
	return BLTypes.isIndexV5(blIndex) ? normalizeIndexBaseV5(blIndex, id) : normalizeIndexBaseV4(blIndex, id);
}

export function normalizeServerInfo(server: BLTypes.BLServer | BLTypes.BLServerV4): NormalizedBlacklabServer {
	const baseIndices = BLTypes.isServerV5(server) ? Object.entries(server.corpora) : Object.entries(server.indices);
	return {
		...server,
		corpora: Object.fromEntries(baseIndices.map(([id, index]) => [id, normalizeIndexBase(index, id)])),
		// @ts-ignore remove legacy property in case it was present on the server object
		indices: undefined,
	};
}

// V4 corpus metadata normalization

function normalizeAnnotationV4(annotatedFieldId: string, annotatedField: BLTypes.BLAnnotatedFieldV4, annotationId: string, annotation: BLTypes.BLAnnotationV4): NormalizedAnnotation {
	const values = annotation.values;
	return {
		annotatedFieldId,
		caseSensitive: annotation.sensitivity === 'SENSITIVE_AND_INSENSITIVE' || annotation.sensitivity === 'ONLY_SENSITIVE',
		defaultDescription: annotation.description || '',
		defaultDisplayName: annotation.displayName || annotationId,
		hasForwardIndex: annotation.hasForwardIndex,
		id: annotationId,
		isInternal: annotation.isInternal,
		isMainAnnotation: annotationId === annotatedField.mainAnnotation,
		offsetsAlternative: annotation.offsetsAlternative,
		subAnnotations: annotation.subannotations,
		parentAnnotationId: Object.entries(annotatedField.annotations).find(([, candidate]) => candidate.subannotations?.includes(annotationId))?.[0],
		uiType: normalizeAnnotationUIType(annotation),
		values: annotation.valueListComplete && values && values.length > 0 ? values.map(value => ({ label: value, value, title: null })) : undefined,
	};
}

function normalizeMetadataV4(fieldId: string, field: BLTypes.BLMetadataFieldV4): NormalizedMetadataField {
	const displayValues = field.displayValues || {};
	const uiType = normalizeMetadataUIType(field.fieldValues, field.valueListComplete, field.uiType);

	return {
		defaultDescription: field.description || '',
		defaultDisplayName: field.displayName || fieldId,
		id: fieldId,
		uiType,
		values: ['select', 'checkbox', 'radio'].includes(uiType)
			? Object.keys(field.fieldValues)
					.map(value => ({
						value,
						label: displayValues[value] != null ? displayValues[value] : value,
						title: null,
					}))
					.sort((a, b) => a.value.localeCompare(b.value))
			: undefined,
	};
}

function normalizeAnnotatedFieldV4(fieldId: string, field: BLTypes.BLAnnotatedFieldV4): NormalizedAnnotatedField {
	const isParallel = fieldId.includes(PARALLEL_FIELD_SEPARATOR);
	const parallelFieldParts = getParallelFieldParts(fieldId);
	return {
		annotations: mapReduce(
			Object.entries(field.annotations).map(([id, annot]) => normalizeAnnotationV4(fieldId, field, id, annot)),
			'id',
		),
		defaultDescription: field.description || '',
		defaultDisplayName: field.displayName || fieldId,
		hasContentStore: field.hasContentStore,
		hasLengthTokens: false,
		hasXmlTags: !!field.hasXmlTags,
		id: fieldId,
		isAnnotatedField: field.isAnnotatedField ?? true,
		mainAnnotationId: field.mainAnnotation,
		isParallel,
		prefix: parallelFieldParts.prefix,
		version: parallelFieldParts.version,
		tokenCount: field.tokenCount,
		documentCount: field.documentCount,
	};
}

function normalizeAnnotationGroupsV4(blIndex: BLTypes.BLIndexMetadataV4): NormalizedAnnotationGroup[] {
	const fieldId = blIndex.mainAnnotatedField || Object.keys(blIndex.annotatedFields)[0];
	const field = blIndex.annotatedFields[fieldId];
	const annotations = field.annotations;
	const seenAnnotations = new Set<string>();

	const normalized =
		blIndex.annotationGroups?.[fieldId]?.map<NormalizedAnnotationGroup>(group => ({
			id: group.name,
			annotatedFieldId: fieldId,
			entries: group.annotations.filter(annotationName => {
				seenAnnotations.add(annotationName);
				return !!annotations[annotationName];
			}),
			isRemainderGroup: false,
		})) ?? [];

	const remnantInOrder = getRemnantAnnotations(field.displayOrder, annotations, seenAnnotations, annotationId => annotations[annotationId].displayName || annotationId);
	if (remnantInOrder.length) {
		normalized.push({
			id: 'Other',
			annotatedFieldId: fieldId,
			entries: remnantInOrder,
			isRemainderGroup: normalized.length > 0,
		});
	}

	return normalized.filter(g => g.entries.length);
}

function normalizeMetadataGroupsV4(blIndex: BLTypes.BLIndexMetadataV4): NormalizedMetadataGroup[] {
	const metadataGroupsNormalized: NormalizedMetadataGroup[] = [];
	const idsNotInGroups = new Set(Object.keys(blIndex.metadataFields));
	let hasUserDefinedGroup = false;

	for (const group of blIndex.metadataFieldGroups ?? []) {
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

	if (idsNotInGroups.size) {
		metadataGroupsNormalized.push({
			entries: [...idsNotInGroups].sort((a, b) => (blIndex.metadataFields[a].displayName || a).localeCompare(blIndex.metadataFields[b].displayName || b)),
			isRemainderGroup: hasUserDefinedGroup,
			id: 'Metadata',
		});
	}
	return metadataGroupsNormalized;
}

function normalizeIndexV4(blIndex: BLTypes.BLIndexMetadataV4, relations: BLTypes.BLRelationInfo): NormalizedIndex {
	const indexId = blIndex.indexName;
	return {
		...normalizeIndexBaseV4(
			{
				status: blIndex.status,
				documentFormat: blIndex.documentFormat,
				timeModified: blIndex.versionInfo?.timeModified || '',
				indexProgress: blIndex.indexProgress,
				tokenCount: blIndex.tokenCount,
				documentCount: blIndex.documentCount,
			},
			indexId,
		),
		annotatedFields: mapReduce(
			Object.entries(blIndex.annotatedFields).map(([id, field]) => normalizeAnnotatedFieldV4(id, field)),
			'id',
		),
		annotationGroups: normalizeAnnotationGroupsV4(blIndex),
		contentViewable: blIndex.contentViewable,
		description: blIndex.description || '',
		displayName: blIndex.displayName || getCorpusIdWithoutOwner(indexId),
		fieldInfo: blIndex.fieldInfo,
		metadataFieldGroups: normalizeMetadataGroupsV4(blIndex),
		metadataFields: mapReduce(
			Object.entries(blIndex.metadataFields).map(([id, field]) => normalizeMetadataV4(id, field)),
			'id',
		),
		textDirection: blIndex.textDirection || 'ltr',
		mainAnnotatedField: blIndex.mainAnnotatedField || Object.keys(blIndex.annotatedFields)[0],
		relations,
	};
}

// V5 corpus metadata normalization

function normalizeAnnotationV5(annotatedFieldId: string, annotatedField: BLTypes.BLAnnotatedField, annotationId: string, annotation: BLTypes.BLAnnotation): NormalizedAnnotation {
	const values = Object.keys(annotation.terms ?? {});
	return {
		annotatedFieldId,
		caseSensitive: annotation.sensitivity === 'SENSITIVE_AND_INSENSITIVE' || annotation.sensitivity === 'ONLY_SENSITIVE',
		defaultDescription: annotation.custom?.description || '',
		defaultDisplayName: annotation.custom?.displayName || annotationId,
		hasForwardIndex: annotation.hasForwardIndex,
		id: annotationId,
		isInternal: annotation.isInternal,
		isMainAnnotation: annotationId === annotatedField.mainAnnotation,
		offsetsAlternative: annotation.offsetsAlternative,
		subAnnotations: annotation.subannotations,
		parentAnnotationId: Object.entries(annotatedField.annotations).find(([, candidate]) => candidate.subannotations?.includes(annotationId))?.[0],
		uiType: normalizeAnnotationUIType(annotation),
		values: annotation.valueListComplete && values.length > 0 ? values.map(value => ({ label: value, value, title: null })) : undefined,
	};
}

function normalizeMetadataV5(fieldId: string, field: BLTypes.BLMetadataField): NormalizedMetadataField {
	const displayValues = field.custom?.displayValues || {};
	const uiType = normalizeMetadataUIType(field.fieldValues, field.valueListComplete, field.custom?.uiType);

	return {
		defaultDescription: field.custom?.description || '',
		defaultDisplayName: field.custom?.displayName || fieldId,
		id: fieldId,
		uiType,
		values: ['select', 'checkbox', 'radio'].includes(uiType)
			? Object.keys(field.fieldValues)
					.map(value => ({
						value,
						label: displayValues[value] != null ? displayValues[value] : value,
						title: null,
					}))
					.sort((a, b) => a.value.localeCompare(b.value))
			: undefined,
	};
}

function normalizeAnnotatedFieldV5(fieldId: string, field: BLTypes.BLAnnotatedField): NormalizedAnnotatedField {
	const isParallel = fieldId.includes(PARALLEL_FIELD_SEPARATOR);
	const parallelFieldParts = getParallelFieldParts(fieldId);
	return {
		annotations: mapReduce(
			Object.entries(field.annotations).map(([id, annot]) => normalizeAnnotationV5(fieldId, field, id, annot)),
			'id',
		),
		defaultDescription: field.custom?.description || '',
		defaultDisplayName: field.custom?.displayName || fieldId,
		hasContentStore: field.hasContentStore,
		hasLengthTokens: false,
		hasXmlTags: !!field.hasXmlTags,
		id: fieldId,
		isAnnotatedField: field.isAnnotatedField ?? true,
		mainAnnotationId: field.mainAnnotation,
		isParallel,
		prefix: parallelFieldParts.prefix,
		version: parallelFieldParts.version,
		tokenCount: field.count.tokens,
		documentCount: field.count.documents,
	};
}

function normalizeAnnotationGroupsV5(blIndex: BLTypes.BLIndexMetadata): NormalizedAnnotationGroup[] {
	const fieldId = blIndex.mainAnnotatedField || Object.keys(blIndex.annotatedFields)[0];
	const field = blIndex.annotatedFields[fieldId];
	const annotations = field.annotations;
	const seenAnnotations = new Set<string>();
	let remainderGroup: NormalizedAnnotationGroup | undefined;

	const normalized =
		blIndex.custom?.annotationGroups?.[fieldId]?.map<NormalizedAnnotationGroup>(group => {
			const normalizedGroup = {
				id: group.groupName,
				annotatedFieldId: fieldId,
				entries: group.annotations.filter(annotationName => {
					seenAnnotations.add(annotationName);
					return !!annotations[annotationName];
				}),
				isRemainderGroup: false,
			};
			if (group.addRemainingAnnotations) remainderGroup ??= normalizedGroup;
			return normalizedGroup;
		}) ?? [];

	const remnantInOrder = getRemnantAnnotations(field.custom?.displayOrder, annotations, seenAnnotations, annotationId => annotations[annotationId].custom?.displayName || annotationId);
	if (remainderGroup) remainderGroup.entries.push(...remnantInOrder);
	else if (remnantInOrder.length) {
		normalized.push({
			id: 'Other',
			annotatedFieldId: fieldId,
			entries: remnantInOrder,
			isRemainderGroup: normalized.length > 0,
		});
	}

	return normalized.filter(g => g.entries.length);
}

function normalizeMetadataGroupsV5(blIndex: BLTypes.BLIndexMetadata): NormalizedMetadataGroup[] {
	const metadataGroupsNormalized: NormalizedMetadataGroup[] = [];
	const idsNotInGroups = new Set(Object.keys(blIndex.metadataFields));
	let hasUserDefinedGroup = false;
	let remainderGroup: NormalizedMetadataGroup | undefined;

	for (const group of blIndex.custom?.metadataFieldGroups ?? []) {
		const normalizedGroup: NormalizedMetadataGroup = {
			entries: group.fieldNamesInGroup.filter(id => blIndex.metadataFields[id] != null),
			isRemainderGroup: false,
			id: group.name,
		};
		if (group.addRemainingFields) remainderGroup ??= normalizedGroup;
		if (normalizedGroup.entries.length || group.addRemainingFields) {
			metadataGroupsNormalized.push(normalizedGroup);
			normalizedGroup.entries.forEach(id => idsNotInGroups.delete(id));
			hasUserDefinedGroup = true;
		}
	}

	if (idsNotInGroups.size) {
		const remaining = [...idsNotInGroups].sort((a, b) => (blIndex.metadataFields[a].custom?.displayName || a).localeCompare(blIndex.metadataFields[b].custom?.displayName || b));
		if (remainderGroup) remainderGroup.entries.push(...remaining);
		else {
			metadataGroupsNormalized.push({
				entries: remaining,
				isRemainderGroup: hasUserDefinedGroup,
				id: 'Metadata',
			});
		}
	}
	return metadataGroupsNormalized;
}

function normalizeIndexV5(blIndex: BLTypes.BLIndexMetadata, relations: BLTypes.BLRelationInfo): NormalizedIndex {
	const indexId = blIndex.corpusName;
	return {
		...normalizeIndexBaseV5(
			{
				status: blIndex.status,
				documentFormat: blIndex.documentFormat,
				timeModified: blIndex.versionInfo?.timeModified || '',
				indexProgress: blIndex.indexProgress,
				count: blIndex.count,
			},
			indexId,
		),
		annotatedFields: mapReduce(
			Object.entries(blIndex.annotatedFields).map(([id, field]) => normalizeAnnotatedFieldV5(id, field)),
			'id',
		),
		annotationGroups: normalizeAnnotationGroupsV5(blIndex),
		contentViewable: blIndex.contentViewable,
		description: blIndex.custom?.description || '',
		displayName: blIndex.custom?.displayName || getCorpusIdWithoutOwner(indexId),
		fieldInfo: {
			pidField: blIndex.pidField,
			titleField: blIndex.custom?.titleField,
			authorField: blIndex.custom?.authorField,
			dateField: blIndex.custom?.dateField,
		},
		metadataFieldGroups: normalizeMetadataGroupsV5(blIndex),
		metadataFields: mapReduce(
			Object.entries(blIndex.metadataFields).map(([id, field]) => normalizeMetadataV5(id, field)),
			'id',
		),
		textDirection: blIndex.custom?.textDirection || 'ltr',
		mainAnnotatedField: blIndex.mainAnnotatedField || Object.keys(blIndex.annotatedFields)[0],
		relations,
	};
}

function getRemnantAnnotations<TAnnotation extends BLTypes.BLAnnotation | BLTypes.BLAnnotationV4>(
	displayOrder: string[] | undefined,
	annotations: Record<string, TAnnotation>,
	seenAnnotations: Set<string>,
	getDisplayName: (annotationId: string) => string,
): string[] {
	const remnantInOrder: string[] = [];

	displayOrder?.forEach(id => {
		if (annotations[id]) {
			if (!seenAnnotations.has(id)) {
				remnantInOrder.push(id);
			}
			seenAnnotations.add(id);
		}
	});

	remnantInOrder.push(
		...Object.keys(annotations)
			.filter(a => !seenAnnotations.has(a))
			.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
	);
	return remnantInOrder;
}

/** Normalize complete BlackLab v4 or v5 corpus metadata. */
export function normalizeIndex(blIndex: BLTypes.BLIndexMetadata | BLTypes.BLIndexMetadataV4, relations: BLTypes.BLRelationInfo): NormalizedIndex {
	return BLTypes.isBLIndexMetadataV5(blIndex) ? normalizeIndexV5(blIndex, relations) : normalizeIndexV4(blIndex, relations);
}

/**
 * @param id - full id of the format, including userName portion (if applicable)
 * @param format as received from the server
 */
export function normalizeFormat(id: string, format: BLTypes.BLFormat): NormalizedFormat {
	return {
		...format,

		id,
		owner: getCorpusOwner(id),
		shortId: id.substr(id.indexOf(':') + 1),

		displayName: format.displayName || id.substr(id.indexOf(':') + 1),
		helpUrl: format.helpUrl || null,
		description: format.description || null,
	};
}
