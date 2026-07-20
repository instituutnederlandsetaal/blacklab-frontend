/**
 * This module contains the corpus info as it's configured in blacklab.
 * We use it for pretty much everything to do with layout:
 * which annotations and filters are available, what is the default annotation (lemma/pos/word/etc...),
 * are the filters subdivided in groups, what is the text direction, and so on.
 */

import { ref } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { NormalizedAnnotation, Tagset } from '@/types/apptypes';

type ModuleRootState = Tagset | null;

const state = ref<ModuleRootState>(null);
const getState = () => state.value;

const get = {};

const init = (payload: CorpusContext) => {
	state.value = payload.tagset ?? null;
};

type TagsetAnnotation = { displayName?: string; values: Array<{ value: string; displayName: string; pos?: string[] }> };

const usefulName = (name: string | undefined, raw: string) => (name && name !== raw ? name : undefined);

function sameCorpusValues(left: NormalizedAnnotation['values'], right: NonNullable<NormalizedAnnotation['values']>) {
	return left?.length === right.length && left.every((value, index) => value.value === right[index].value && value.label === right[index].label && value.title === right[index].title);
}

function tagsetFromCorpus(main: NormalizedAnnotation, annotations: Record<string, NormalizedAnnotation>): Tagset {
	const subAnnotationIds = [
		...new Set([
			...(main.subAnnotations ?? []),
			...Object.values(annotations)
				.filter(a => a.parentAnnotationId === main.id)
				.map(a => a.id),
		]),
	].filter(id => annotations[id]);
	return {
		values: Object.fromEntries((main.values ?? []).map(({ value, label }) => [value, { value, displayName: usefulName(label, value) ?? value, subAnnotationIds: [...subAnnotationIds] }])),
		subAnnotations: Object.fromEntries(
			subAnnotationIds.map(id => {
				const annotation = annotations[id];
				return [
					id,
					{
						id,
						displayName: usefulName(annotation.defaultDisplayName, id) ?? id,
						values: (annotation.values ?? []).map(({ value, label }) => ({ value, displayName: usefulName(label, value) ?? value })),
					},
				];
			}),
		),
	};
}

/**
 * Return one form-ready tagset.
 *
 * When a configured tagset exists, it is authoritative for the tagset's value
 * membership, order, subannotation structure, and POS constraints. Otherwise the
 * tagset is generated from the corpus POS annotation and its subannotations,
 * preserving their value order.
 *
 * Display names are merged in this order:
 * 1. meaningful corpus annotation/value names (names unequal to their ID/raw value)
 * 2. meaningful configured tagset names, which override corpus names
 * 3. for case-insensitive annotations without an explicit value name, a cased
 *    raw spelling from either source (tagset wins ties) is used as the display name
 * 4. the annotation ID or normalized raw value as the final fallback
 *
 * The resolved names and normalized value casing are written to the returned
 * tagset and back to the matching corpus annotations. Corpus-only values remain
 * available on corpus annotations but are not added to a configured tagset;
 * configured tagset-only values are appended to the corpus annotation values.
 */
export function normalizeTagset(main: NormalizedAnnotation, annotations: Record<string, NormalizedAnnotation>, configured?: Tagset): Tagset {
	const source = configured ?? tagsetFromCorpus(main, annotations);
	const tagset: Tagset = {
		values: Object.fromEntries(Object.entries(source.values).map(([key, value]) => [key, { ...value, subAnnotationIds: [...value.subAnnotationIds] }])),
		subAnnotations: Object.fromEntries(
			Object.entries(source.subAnnotations).map(([key, annotation]) => [key, { ...annotation, values: annotation.values.map(value => ({ ...value, ...(value.pos ? { pos: [...value.pos] } : {}) })) }]),
		),
	};

	for (const { value, subAnnotationIds } of Object.values(tagset.values)) {
		const unknown = subAnnotationIds.filter(id => !tagset.subAnnotations[id] || !annotations[id]);
		if (unknown.length) throw new Error(`Value "${value}" declares unknown subAnnotation(s) "${unknown}".`);
	}

	const merge = (annotation: NormalizedAnnotation, tagAnnotation: TagsetAnnotation) => {
		const corpusValues = annotation.values ?? [];
		const names = new Map<string, string>();
		const inferredNames = new Map<string, string>();
		for (const value of corpusValues) {
			const key = value.value.toLowerCase();
			const name = usefulName(value.label, value.value);
			if (name) names.set(key, name);
			else if (!annotation.caseSensitive && value.value !== key) inferredNames.set(key, value.value);
		}
		for (const value of tagAnnotation.values) {
			const key = value.value.toLowerCase();
			const name = usefulName(value.displayName, value.value);
			if (name) names.set(key, name);
			else if (!annotation.caseSensitive && value.value !== key) inferredNames.set(key, value.value);
			value.value = annotation.caseSensitive ? value.value : key;
		}

		const tagValues = new Map(tagAnnotation.values.map(value => [value.value.toLowerCase(), value]));
		const merged = new Map<string, NonNullable<NormalizedAnnotation['values']>[number]>();
		for (const value of corpusValues) {
			const key = value.value.toLowerCase();
			const canonical = tagValues.get(key)?.value ?? value.value;
			if (!merged.has(canonical)) merged.set(canonical, { value: canonical, label: names.get(key) ?? inferredNames.get(key) ?? canonical, title: value.title });
		}
		for (const value of tagAnnotation.values) {
			const key = value.value.toLowerCase();
			value.displayName = names.get(key) ?? inferredNames.get(key) ?? value.value;
			if (!merged.has(value.value)) merged.set(value.value, { value: value.value, label: value.displayName, title: null });
		}
		const mergedValues = [...merged.values()];
		if (!sameCorpusValues(annotation.values, mergedValues)) annotation.values = mergedValues;
		if (annotation.uiType === 'text') annotation.uiType = 'select';

		const displayName = usefulName(tagAnnotation.displayName, annotation.id) ?? usefulName(annotation.defaultDisplayName, annotation.id) ?? annotation.id;
		annotation.defaultDisplayName = tagAnnotation.displayName = displayName;
	};

	merge(main, { values: Object.values(tagset.values) });
	const mainValues = new Map(Object.values(tagset.values).map(value => [value.value.toLowerCase(), value.value]));
	for (const sub of Object.values(tagset.subAnnotations)) {
		const annotation = annotations[sub.id];
		if (!annotation) continue;
		for (const value of sub.values) value.pos = value.pos?.map(pos => mainValues.get(pos.toLowerCase()) ?? pos);
		merge(annotation, sub);
	}
	return tagset;
}

const actions = {
	load: () => {
		console.warn('Manual tagset loading is no longer required. Remove the call to tagset.actions.load() from customJS - instead, place the tagset in ${corpusName}/static/tagset.json');
	},
};

export { actions, get, getState, init };
export type { ModuleRootState, Tagset };
