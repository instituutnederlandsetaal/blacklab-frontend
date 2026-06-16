import type { ModuleRootState } from '@/pages/search/config/ui-customization-store';
import type { NormalizedAnnotation, NormalizedAnnotationGroup, NormalizedIndex, NormalizedMetadataField, NormalizedMetadataGroup } from '@/types/apptypes';

export type SearchUiConfig = {
	search: {
		simple: {
			searchAnnotationId: string;
		};
		extended: {
			searchAnnotationIds: string[];
		};
		advanced: {
			enabled: boolean;
			searchAnnotationIds: string[];
			defaultSearchAnnotationId: string;
		};
		shared: {
			searchMetadataIds: string[];
		};
	};
	explore: {
		/** Default selection in Group documents by metadata" (Corpora tab), available options are defined by results.shared.groupMetadataIds */
		defaultGroupMetadataId: string;
		groupMetadataIds: string[];
	};
};

type SearchUiDeclarations = Pick<ModuleRootState, 'search' | 'explore' | 'results'>;

type MainAnnotationGroup = NormalizedAnnotationGroup & { annotatedFieldId: string };

function unique(ids: string[]): string[] {
	return ids.filter((id, index) => ids.indexOf(id) === index);
}

function warnInvalidIds(kind: string, ids: string[], known: Record<string, unknown>) {
	for (const id of ids) {
		if (!known[id]) console.warn(`[resolveSearchUiConfig] Ignoring unknown ${kind} '${id}'.`);
	}
}

function validIds<T extends NormalizedAnnotation | NormalizedMetadataField>(ids: string[], known: Record<string, T>, kind: string, predicate: (value: T) => boolean = () => true): string[] {
	const deduped = unique(ids);
	warnInvalidIds(kind, deduped, known);
	return deduped.filter(id => known[id] && predicate(known[id]));
}

function defaultAnnotationIds(groups: MainAnnotationGroup[], annotations: Record<string, NormalizedAnnotation>): string[] {
	return groups.flatMap((group, index) => {
		if (!group.isRemainderGroup) return group.entries.filter(id => annotations[id]);

		const hasNonRemainderGroup = index > 0;
		if (hasNonRemainderGroup) return [];
		return group.entries.filter(id => annotations[id]?.isInternal === false);
	});
}

function defaultMetadataIds(groups: NormalizedMetadataGroup[], fields: Record<string, NormalizedMetadataField>): string[] {
	return groups.flatMap((group, index) => {
		if (!group.isRemainderGroup) return group.entries.filter(id => fields[id]);

		const hasNonRemainderGroup = index > 0;
		return hasNonRemainderGroup ? [] : group.entries.filter(id => fields[id]);
	});
}

function configuredOrDefault(ids: string[], fallback: string[]): string[] {
	return ids.length ? ids : fallback;
}

/**
 * Interop/backward compat
 * Take the (unvalidated) UI store state, and the index,
 * and return a validated simple configuration object that we can use.
 *
 * @param index
 * @param declarations A completely unvalidated subset of the UI customization store state. Treat this as bogus values, though the shape is what it says on the tin.
 * @returns
 */
export function resolveSearchUiConfig(index: NormalizedIndex, declarations?: SearchUiDeclarations): SearchUiConfig {
	const mainField = index.annotatedFields[index.mainAnnotatedField];
	if (!mainField) throw new Error(`Main annotated field '${index.mainAnnotatedField}' is missing.`);

	const annotations = mainField.annotations;
	const annotationGroups = index.annotationGroups.filter((group): group is MainAnnotationGroup => group.annotatedFieldId === index.mainAnnotatedField);
	const metadataFields = index.metadataFields;

	const mainAnnotation = annotations[mainField.mainAnnotationId] ?? Object.values(annotations).find(annotation => annotation.isMainAnnotation) ?? Object.values(annotations)[0];
	if (!mainAnnotation) throw new Error(`Main annotated field '${index.mainAnnotatedField}' has no annotations.`);

	const defaultSearchAnnotations = defaultAnnotationIds(annotationGroups, annotations);
	const fallbackSearchAnnotations = defaultSearchAnnotations.length ? defaultSearchAnnotations : [mainAnnotation.id];
	const fallbackMetadata = defaultMetadataIds(index.metadataFieldGroups, metadataFields);
	const search = declarations?.search;

	const extendedAnnotationIds = configuredOrDefault(validIds(search?.extended.searchAnnotationIds ?? [], annotations, 'annotation'), fallbackSearchAnnotations);
	const advancedAnnotationIds = configuredOrDefault(validIds(search?.advanced.searchAnnotationIds ?? [], annotations, 'annotation'), fallbackSearchAnnotations);
	const metadataIds = configuredOrDefault(validIds(search?.shared.searchMetadataIds ?? [], metadataFields, 'metadata field'), fallbackMetadata);

	let defaultAdvancedAnnotationId = search?.advanced.defaultSearchAnnotationId;
	if (defaultAdvancedAnnotationId && !advancedAnnotationIds.includes(defaultAdvancedAnnotationId)) {
		console.warn(`[resolveSearchUiConfig] Default querybuilder annotation '${defaultAdvancedAnnotationId}' is not available; using '${advancedAnnotationIds[0] ?? mainAnnotation.id}' instead.`);
		defaultAdvancedAnnotationId = undefined;
	}

	function firstValidAnnotation(...ids: (string | undefined)[]): string {
		for (const id of ids) {
			if (id && annotations[id]) return id;
		}
		throw new Error(`None of the following annotation ids were valid: ${ids.join(', ')}`);
	}
	function firstValidMetadata(...ids: (string | undefined)[]): string {
		for (const id of ids) {
			if (id && metadataFields[id]) return id;
		}
		throw new Error(`None of the following metadata field ids were valid: ${ids.join(', ')}`);
	}

	return {
		search: {
			simple: {
				searchAnnotationId: firstValidAnnotation(declarations?.search.simple.searchAnnotationId, mainAnnotation.id),
			},
			extended: {
				searchAnnotationIds: extendedAnnotationIds,
			},
			advanced: {
				enabled: search?.advanced.enabled ?? true,
				searchAnnotationIds: advancedAnnotationIds,
				defaultSearchAnnotationId: firstValidAnnotation(declarations?.search.advanced.defaultSearchAnnotationId, advancedAnnotationIds[0], mainAnnotation.id),
			},
			shared: {
				searchMetadataIds: metadataIds,
			},
		},
		explore: {
			defaultGroupMetadataId: firstValidMetadata(...(declarations?.results.shared.groupMetadataIds ?? []), metadataIds[0]),
			groupMetadataIds: configuredOrDefault(validIds(declarations?.results.shared.groupMetadataIds ?? [], metadataFields, 'metadata field'), metadataIds),
		},
	};
}
