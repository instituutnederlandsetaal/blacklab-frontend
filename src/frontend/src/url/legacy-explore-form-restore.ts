import type { Corpus } from '@/app/state/useCorpusContext';
import { getTokenSequenceChild, type TokenSequenceFieldConfig, type TokenSequenceFieldState } from '@/features/form/fields/token-sequence-field';
import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import { getAllNodes } from '@/features/form/model/form-utils';
import { FORM_QUERY_PREFIX } from '@/features/form/model/persistence';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';
import type { HistoryEntry } from '@/features/history/model/query-history-state';

import { getPatternStringExplore } from '@/shared/blacklab-helpers/pattern-utils';
import { optionValues, type Options } from '@/shared/utils/options';

type LegacyExploreRestoreState = Pick<HistoryEntry, 'explore' | 'filters' | 'interface' | 'patterns' | 'view'>;
type QueryRecord = Record<string, unknown>;

const NGRAM_FORM_ID = 'explore.ngram';
const NGRAM_GROUP_FIELD_ID = 'explore.ngram.group-by';
const NGRAM_TOKENS_FIELD_ID = 'explore.ngram.tokens';
const FREQUENCY_FORM_ID = 'explore.frequency';
const FREQUENCY_ANNOTATION_FIELD_ID = 'explore.frequency.annotation';

function firstString(value: unknown): string | null {
	const values = Array.isArray(value) ? value : [value];
	return values.find((item): item is string => typeof item === 'string' && !!item) ?? null;
}

function scalarString(value: unknown): string {
	return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function hasScopedFormState(query: QueryRecord): boolean {
	return Object.keys(query).some(key => key.startsWith(FORM_QUERY_PREFIX));
}

function canonicalPattern(query: QueryRecord): string | null {
	return firstString(query.patt) ?? firstString(query.query);
}

function normalizeNgramPattern(value: string): string {
	// The legacy serializer concatenated tokens, while the query IR separates them
	// with spaces. Only normalize whitespace at token boundaries; whitespace inside
	// a quoted token value remains significant.
	return value.trim().replace(/\]\s+\[/g, '][');
}

function groupedAnnotationId(restored: LegacyExploreRestoreState): string | null {
	if (restored.view.groupBy.length !== 1) return null;
	const group = restored.view.groupBy[0];
	return group.startsWith('hit:') && group.length > 4 ? group.slice(4) : null;
}

function optionsContain(field: FormFieldNode, value: string): boolean {
	const options = (field as FormFieldNode & { options?: Options }).options;
	return !!options && optionValues(options).includes(value);
}

function addEncodedField(output: QueryRecord, definition: FormBuilder, field: FormFieldNode, state: unknown): boolean {
	try {
		const encoded = field.controller.encode(state, field, definition.context);
		if (encoded == null || encoded === '' || (Array.isArray(encoded) && !encoded.length)) return false;
		const persistKey = field.controller.getPersistKey(field, definition.context);
		output[`${FORM_QUERY_PREFIX}${persistKey}`] = encoded;
		return true;
	} catch {
		return false;
	}
}

function createNgramTokenState(field: FormFieldNode, restored: LegacyExploreRestoreState): TokenSequenceFieldState | null {
	const config = field as FormFieldNode & TokenSequenceFieldConfig;
	const legacy = restored.explore.ngram;
	if (!Number.isInteger(legacy.size) || legacy.size < config.minLength || legacy.size > config.maxLength || legacy.tokens.length < legacy.size) return null;

	const state: TokenSequenceFieldState = [];
	for (const token of legacy.tokens.slice(0, legacy.size)) {
		const child = getTokenSequenceChild(config, token.id);
		if (child.id !== token.id && token.value) return null;
		state.push({
			fieldId: child.id,
			fieldState:
				child.controller.kind === 'ngram-token-select'
					? token.value
						? [token.value]
						: []
					: {
							value: token.value,
							caseSensitive: false,
						},
		});
	}
	return state;
}

function isCanonicalNgram(query: QueryRecord, restored: LegacyExploreRestoreState, corpus: Corpus): boolean {
	const pattern = canonicalPattern(query);
	if (!pattern) return false;
	try {
		const represented = getPatternStringExplore('ngram', restored.explore, corpus.allAnnotationsMap);
		return !!represented && normalizeNgramPattern(represented) === normalizeNgramPattern(pattern);
	} catch {
		return false;
	}
}

function legacyFilterState(controllerKind: string, value: unknown): unknown {
	if (value == null) return undefined;
	switch (controllerKind) {
		case 'metadata-filter-text':
		case 'metadata-filter-autocomplete':
			return typeof value === 'string' ? { value, caseSensitive: false } : undefined;
		case 'metadata-filter-checkbox':
			if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
			if (typeof value === 'object')
				return Object.entries(value)
					.filter(([, selected]) => !!selected)
					.map(([option]) => option);
			return undefined;
		case 'metadata-filter-radio':
			return typeof value === 'string' ? value : undefined;
		case 'metadata-filter-select':
			return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
		case 'metadata-filter-range':
			return typeof value === 'object' && value && ('low' in value || 'high' in value)
				? {
						low: scalarString((value as { low?: unknown }).low),
						high: scalarString((value as { high?: unknown }).high),
						mode: (value as { mode?: unknown }).mode === 'permissive' ? 'permissive' : 'strict',
					}
				: undefined;
		case 'metadata-filter-date':
			return typeof value === 'object' && value && 'startDate' in value ? value : undefined;
		default:
			return undefined;
	}
}

function addRepresentableFilters(output: QueryRecord, definition: FormBuilder, formId: string, restored: LegacyExploreRestoreState): void {
	const form = definition.getForm(formId);
	if (!form) return;
	for (const field of getAllNodes(form, 'field')) {
		if (!field.controller.kind.startsWith('metadata-filter-')) continue;
		const persistKey = field.controller.getPersistKey(field, definition.context);
		const legacy = restored.filters[persistKey];
		if (!legacy) continue;
		const state = legacyFilterState(field.controller.kind, legacy.value);
		if (state !== undefined) addEncodedField(output, definition, field, state);
	}
}

function canonicalSource(query: QueryRecord, restored: LegacyExploreRestoreState, corpus: Corpus): string | null {
	const requested = firstString(query.searchfield) ?? firstString(query.searchField) ?? firstString(query.field) ?? restored.patterns.shared.source;
	return requested && corpus.parallelAnnotatedFieldsMap[requested] ? requested : null;
}

function addRepresentableSource(output: QueryRecord, definition: FormBuilder, formId: string, query: QueryRecord, restored: LegacyExploreRestoreState, corpus: Corpus): void {
	const sourceField = definition.getField(`${formId}.source`);
	const source = canonicalSource(query, restored, corpus);
	if (sourceField && source && optionsContain(sourceField, source)) addEncodedField(output, definition, sourceField, [source]);
}

function createNgramScopedState(definition: FormBuilder, query: QueryRecord, restored: LegacyExploreRestoreState, corpus: Corpus): QueryRecord | null {
	if (!definition.getForm(NGRAM_FORM_ID) || !isCanonicalNgram(query, restored, corpus)) return null;
	const groupField = definition.getField(NGRAM_GROUP_FIELD_ID);
	const tokensField = definition.getField(NGRAM_TOKENS_FIELD_ID);
	const annotationId = groupedAnnotationId(restored);
	if (!groupField || !tokensField || !annotationId || !optionsContain(groupField, annotationId)) return null;
	const tokenState = createNgramTokenState(tokensField, restored);
	if (!tokenState) return null;

	const output: QueryRecord = { [`${FORM_QUERY_PREFIX}form`]: NGRAM_FORM_ID };
	if (!addEncodedField(output, definition, groupField, [annotationId]) || !addEncodedField(output, definition, tokensField, tokenState)) return null;
	const compiledPattern = compileQueryIR(tokensField.controller.getQueryContribution(tokensField, definition.context, tokenState).query).patt;
	if (!compiledPattern) return null;
	// Prevent restoreFormState from treating the legacy no-space token serialization
	// as an unrepresentable raw override. The recognition check above established
	// that this is the same n-gram; retain the new compiler's canonical spelling.
	output.patt = compiledPattern;
	addRepresentableFilters(output, definition, NGRAM_FORM_ID, restored);
	addRepresentableSource(output, definition, NGRAM_FORM_ID, query, restored, corpus);
	return output;
}

function createFrequencyScopedState(definition: FormBuilder, query: QueryRecord, restored: LegacyExploreRestoreState, corpus: Corpus): QueryRecord | null {
	if (!definition.getForm(FREQUENCY_FORM_ID) || canonicalPattern(query)?.trim() !== '[]') return null;
	const annotationField = definition.getField(FREQUENCY_ANNOTATION_FIELD_ID);
	const annotationId = groupedAnnotationId(restored);
	if (!annotationField || !annotationId || !optionsContain(annotationField, annotationId)) return null;

	const output: QueryRecord = { [`${FORM_QUERY_PREFIX}form`]: FREQUENCY_FORM_ID };
	if (!addEncodedField(output, definition, annotationField, [annotationId])) return null;
	output.patt = '[]';
	addRepresentableFilters(output, definition, FREQUENCY_FORM_ID, restored);
	addRepresentableSource(output, definition, FREQUENCY_FORM_ID, query, restored, corpus);
	return output;
}

/**
 * Upgrade a canonical legacy Explore URL to the scoped values understood by the
 * new n-gram/frequency forms. Existing `f.*` state always remains authoritative.
 */
export function withLegacyExploreFormState(definition: FormBuilder, query: QueryRecord, restored: LegacyExploreRestoreState, corpus: Corpus): QueryRecord {
	if (hasScopedFormState(query) || restored.interface.form !== 'explore') return query;
	const scoped =
		restored.interface.exploreMode === 'ngram'
			? createNgramScopedState(definition, query, restored, corpus)
			: restored.interface.exploreMode === 'frequency'
				? createFrequencyScopedState(definition, query, restored, corpus)
				: null;
	return scoped ? { ...query, ...scoped } : query;
}

export type { LegacyExploreRestoreState };
