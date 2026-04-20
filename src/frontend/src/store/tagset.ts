/**
 * This module contains the corpus info as it's configured in blacklab.
 * We use it for pretty much everything to do with layout:
 * which annotations and filters are available, what is the default annotation (lemma/pos/word/etc...),
 * are the filters subdivided in groups, what is the text direction, and so on.
 */

import type { NormalizedAnnotation, Tagset } from '@/types/apptypes';

import type { CorpusChange } from '@/api/async/logic/corpus/corpus-data-from-id';
import { ref } from 'vue';

type ModuleRootState = Tagset|null;

const state = ref<ModuleRootState>(null);
const getState = () => state.value;

const get = {};

const init = (payload: CorpusChange) => {
	state.value = payload.tagset ?? null;
};

/**
 * Process a tagset: validate it against the corpus, normalize case, and merge values into corpus annotations.
 *
 * This function performs three tasks in one pass per annotation:
 * 1. Validates that all annotations and values referenced in the tagset exist in the corpus
 * 2. Normalizes tagset values to match corpus case-sensitivity settings
 * 3. Merges tagset values and displaynames into corpus annotations, collapsing case variants
 *
 * Case-insensitive matching is used throughout:
 * - If the tagset contains a value (e.g. 'Nou'), and the corpus has differently-cased variants (e.g. 'NOU', 'nou'),
 *   they are collapsed to use the tagset's value as the canonical form with its displayName.
 * - If the corpus has case variants but no tagset match, they remain distinct.
 *
 * @param mainAnnot The main annotation (with uiType 'pos') that the tagset is attached to.
 * @param corpusAnnotations All annotations in the corpus.
 * @param tagset The tagset to process (will be mutated for case normalization).
 */
export function processTagset(mainAnnot: NormalizedAnnotation, corpusAnnotations: Record<string, NormalizedAnnotation>, tagset: Tagset) {
	const mainAnnotationCS = mainAnnot.caseSensitive;

	// Build a case-insensitive lookup for main tagset values (for validating pos references in subannotations)
	const tagsetValuesLower = new Set(Object.keys(tagset.values).map(k => k.toLowerCase()));

	// Validate that the main annotation doesn't reference any subannotations that don't exist
	Object.values(tagset.values).forEach(({value, subAnnotationIds}) => {
		const subAnnotsNotInTagset = subAnnotationIds.filter(id => tagset.subAnnotations[id] == null);
		if (subAnnotsNotInTagset.length) {
			throw new Error(`Value "${value}" declares subAnnotation(s) "${subAnnotsNotInTagset}" that do not exist in the tagset.`);
		}
		const subAnnotsNotInCorpus = subAnnotationIds.filter(subId => corpusAnnotations[subId] == null);
		if (subAnnotsNotInCorpus.length) {
			throw new Error(`Value "${value}" declares subAnnotation(s) "${subAnnotsNotInCorpus}" that do not exist in the corpus.`);
		}
	});

	/**
	 * Process a single annotation: validate, normalize case in tagset, and merge into corpus.
	 */
	function processAnnotation(
		annotationId: string,
		tagsetValues: Array<{value: string, displayName: string, pos?: string[]}>,
		isCaseSensitive: boolean
	) {
		const annotationInCorpus = corpusAnnotations[annotationId];
		if (!annotationInCorpus) {
			console.error(`Annotation "${annotationId}" does not exist in the corpus, but is referenced in the tagset.`);
			return;
		}

		// Build case-insensitive lookup of corpus values for validation
		const corpusValuesLower = new Set(annotationInCorpus.values?.map(v => v.value.toLowerCase()) ?? []);

		if (!annotationInCorpus.values?.length) {
			console.warn(`Annotation "${annotationId}" does not have any known values in the corpus, but is referenced in the tagset.`);
		}

		// Validate and normalize tagset values
		for (const tv of tagsetValues) {
			// Validate: warn if value doesn't exist in corpus
			if (corpusValuesLower.size > 0 && !corpusValuesLower.has(tv.value.toLowerCase())) {
				console.warn(`Annotation "${annotationId}" may have value "${tv.value}" which does not exist in the corpus.`);
			}

			// Validate pos references (for subannotations)
			if (tv.pos) {
				const unknownPosList = tv.pos.filter(pos => !tagsetValuesLower.has(pos.toLowerCase()));
				if (unknownPosList.length > 0) {
					console.warn(`SubAnnotation '${annotationId}' value '${tv.value}' declares unknown main-pos value(s): ${unknownPosList.toString()}`);
				}
				// Normalize pos references if main annotation is case-insensitive
				if (!mainAnnotationCS) {
					tv.pos = tv.pos.map(v => v.toLowerCase());
				}
			}

			// Normalize value case if annotation is case-insensitive
			if (!isCaseSensitive) {
				tv.value = tv.value.toLowerCase();
			}
		}

		// Build case-insensitive lookup from (now normalized) tagset values
		const tagsetByLower: Record<string, {value: string, displayName: string}> = {};
		for (const tv of tagsetValues) {
			tagsetByLower[tv.value.toLowerCase()] = tv;
		}

		// Merge: collapse corpus values to tagset canonical forms where applicable
		const resultValues: Record<string, {value: string, label: string, title: string|null}> = {};

		// Process original corpus values
		if (annotationInCorpus.values) {
			for (const origValue of annotationInCorpus.values) {
				const lowerValue = origValue.value.toLowerCase();
				const tagsetMatch = tagsetByLower[lowerValue];

				if (tagsetMatch) {
					// Collapse to tagset's canonical value
					const canonicalValue = tagsetMatch.value;
					if (!resultValues[canonicalValue]) {
						resultValues[canonicalValue] = {
							value: canonicalValue,
							label: tagsetMatch.displayName || canonicalValue,
							title: origValue.title
						};
					}
				} else {
					// No tagset match - keep original
					if (!resultValues[origValue.value]) {
						resultValues[origValue.value] = {
							value: origValue.value,
							label: origValue.label,
							title: origValue.title
						};
					}
				}
			}
		}

		// Add any tagset values not already present
		for (const tv of tagsetValues) {
			if (!resultValues[tv.value]) {
				resultValues[tv.value] = {
					value: tv.value,
					label: tv.displayName || tv.value,
					title: null
				};
			}
		}

		// Sort: preserve original order where possible, new values at the end
		const originalValues = annotationInCorpus.values;
		annotationInCorpus.values = Object.values(resultValues).sort((a, b) => {
			if (!originalValues) return 0;
			const aIdx = originalValues.findIndex(v => v.value.toLowerCase() === a.value.toLowerCase());
			const bIdx = originalValues.findIndex(v => v.value.toLowerCase() === b.value.toLowerCase());
			return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx);
		});

		// With exhaustive values, we can use a select UI
		if (annotationInCorpus.uiType === 'text') {
			annotationInCorpus.uiType = 'select';
		}
	}

	// Process main annotation and subannotations within the store mutation
	processAnnotation(mainAnnot.id, Object.values(tagset.values), mainAnnotationCS);
	for (const subId in tagset.subAnnotations) {
		const sub = tagset.subAnnotations[subId];
		const subAnnot = corpusAnnotations[sub.id];
		processAnnotation(sub.id, sub.values, subAnnot?.caseSensitive ?? false);
	}
}

const actions = {
	load: () => { console.warn('Manual tagset loading is no longer required. Remove the call to tagset.actions.load() from customJS - instead, place the tagset in ${corpusName}/static/tagset.json'); }
}

export { actions, get, getState, init };
export type { ModuleRootState, Tagset };

