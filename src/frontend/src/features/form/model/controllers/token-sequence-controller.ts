import { toValue } from 'vue';

import {
	createDefaultTokenSequenceToken,
	createTokenSequenceFieldNode,
	resolveTokenSequenceFieldId,
	tokenSequenceLengthBounds,
	type TokenSequenceFieldConfig,
	type TokenSequenceFieldDefinition,
	type TokenSequenceFieldState,
	type TokenSequenceTokenState,
} from '@/features/form/fields/token-sequence-field';
import { getFieldQueryContribution } from '@/features/form/model/compile';
import { combineQueries } from '@/features/form/model/compile/query-artifact';
import { array, object, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, encodeFieldState, restoreFieldState, type FieldControllerProps, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { anyToken, queryFragment, sequence, summary } from '@/features/form/model/types/form-query-ir';

type PersistedToken = { fieldId: string; payload: string };

const persistedTokenCodec = object({
	fieldId: scalar().at('f'),
	payload: scalar().default('').at('v'),
});

function restoreToken(index: number, persisted: PersistedToken, config: FieldControllerProps<TokenSequenceFieldConfig>, runtime: FormRuntimeContext): TokenSequenceTokenState {
	const requestedFieldId = persisted.fieldId;
	const selectedFieldId = resolveTokenSequenceFieldId(config, requestedFieldId);
	if (selectedFieldId !== requestedFieldId) throw new Error(`Cannot restore token ${index + 1} field '${requestedFieldId}' because it is not available.`);

	const field = createTokenSequenceFieldNode(config, index, selectedFieldId);
	const defaultToken = createDefaultTokenSequenceToken(config, runtime, index, selectedFieldId);
	if (!persisted.payload) return defaultToken;
	return {
		fieldId: selectedFieldId,
		fieldState: restoreFieldState(field, persisted.payload, runtime),
	};
}

const tokenSequencePersistenceCodec = array(persistedTokenCodec)
	.transform<TokenSequenceFieldState>({
		encode(state, { config, runtime }) {
			return state.map((token, index) => {
				const field = createTokenSequenceFieldNode(config, index, token.fieldId);
				return {
					fieldId: token.fieldId,
					payload: encodeFieldState(field, token.fieldState, runtime) ?? '',
				};
			});
		},
		decode(tokens, { config, runtime }) {
			const bounds = tokenSequenceLengthBounds(config);
			if (tokens.length < bounds.min || tokens.length > bounds.max) throw new Error(`Cannot restore token sequence length ${tokens.length}; expected ${bounds.min}-${bounds.max}.`);
			return tokens.map((token, index) => restoreToken(index, token, config, runtime));
		},
	})
	.default(({ config, runtime }) => {
		const bounds = tokenSequenceLengthBounds(config);
		return Array.from({ length: bounds.defaultValue }, (_, index) => createDefaultTokenSequenceToken(config, runtime, index));
	});

export const tokenSequenceController = defineFieldController<'token-sequence', TokenSequenceFieldDefinition>({
	kind: 'token-sequence',
	createDefaultState(config, runtime) {
		const bounds = tokenSequenceLengthBounds(config);
		return Array.from({ length: bounds.defaultValue }, (_, index) => createDefaultTokenSequenceToken(config, runtime, index));
	},
	persistence: { key: config => config.persistKey, codec: tokenSequencePersistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, runtime, state) {
		const contributions = state.map((token, index) => {
			const field = createTokenSequenceFieldNode(config, index, token.fieldId);
			return getFieldQueryContribution(field, runtime, token.fieldState);
		});
		const combined = combineQueries(contributions, 'and');
		return queryFragment({
			...combined,
			pattern: sequence(contributions.map(contribution => contribution.pattern ?? anyToken())),
			summaries: [
				summary(toValue(config.lengthDisplayName), state.length.toLocaleString(), this.affectsBlackLabParameters, config.groupId),
				...contributions.flatMap(contribution => contribution.summaries),
			],
		});
	},
});
