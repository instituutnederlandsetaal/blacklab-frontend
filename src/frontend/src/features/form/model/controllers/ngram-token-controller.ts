import type { SelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { createDefaultSelectFieldState } from '@/features/form/fields/generic/select-field';
import type { TextFieldDefinition } from '@/features/form/fields/generic/text-field';
import { createDefaultTextFieldState } from '@/features/form/fields/generic/text-field';
import { queryFragment, token } from '@/features/form/model/compile/query-artifact';
import { decodePersistSingleSelection, singleEncodedValue, unknownOptionWarnings } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig } from '@/features/form/model/types/form-controllers';
import type { TokenPredicate } from '@/features/form/model/types/form-query';

import { findOption } from '@/shared/utils/options';
import { escapeRegex } from '@/shared/utils/string-utils';

export type NgramTokenControllerConfig = {
	annotationId: string;
	/** Stable and unique within the containing form. */
	persistKey: string;
};

export type NgramTokenTextControllerConfig = FieldControllerConfig<TextFieldDefinition, NgramTokenControllerConfig>;
export type NgramTokenSelectControllerConfig = FieldControllerConfig<
	SelectFieldDefinition,
	NgramTokenControllerConfig & {
		/**
		 * Escape pipes and wildcard characters as literals. This is true for a
		 * legacy select annotation, but false when a POS annotation happens to be
		 * rendered with a SelectField.
		 */
		escapeWildcards?: boolean;
	}
>;

/**
 * Build one legacy Explore n-gram token without going through the regular
 * annotation controller's tokenization or implicit case-insensitive flag.
 */
function legacyNgramToken(annotationId: string, value: string, escapeWildcards: boolean) {
	const predicate: TokenPredicate = {
		type: 'predicate',
		match: 'regex',
		annotation: annotationId,
		value: escapeRegex(value, {
			escapePipes: escapeWildcards,
			escapeWildcards,
			escapeQuotes: true,
		}),
		caseMode: 'default',
	};
	return token(predicate);
}

/** One TextField/LexiconField value contributes at most one CQL token. */
export const ngramTokenTextController = defineFieldController<'ngram-token-text', TextFieldDefinition, NgramTokenControllerConfig>({
	kind: 'ngram-token-text',
	createDefaultState: createDefaultTextFieldState,
	getPersistKey: config => config.persistKey,
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		return state.value || null;
	},
	restore(payload) {
		return {
			value: singleEncodedValue(payload, 'n-gram token value'),
			caseSensitive: false,
		};
	},
	getQueryContribution(config, _runtime, state) {
		if (!state.value) return queryFragment();
		return queryFragment(legacyNgramToken(config.annotationId, state.value, false));
	},
});

/** One single-choice SelectField value contributes at most one CQL token. */
export const ngramTokenSelectController = defineFieldController<'ngram-token-select', SelectFieldDefinition, NgramTokenControllerConfig & { escapeWildcards?: boolean }>({
	kind: 'ngram-token-select',
	createDefaultState: createDefaultSelectFieldState,
	getPersistKey: config => config.persistKey,
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		return state.find(Boolean) ?? null;
	},
	restore(payload, config) {
		const value = decodePersistSingleSelection(payload);
		if (!value) return [];
		if (findOption(config.options, value)) return [value];
		return {
			state: [],
			warnings: unknownOptionWarnings([value], config.options),
		};
	},
	getQueryContribution(config, _runtime, state) {
		const value = state.find(Boolean);
		if (!value) return queryFragment();
		return queryFragment(legacyNgramToken(config.annotationId, value, config.escapeWildcards !== false));
	},
});
