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
import { combineCqlPatterns } from '@/features/form/model/compile/query-artifact';
import { array, object, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, encodeFieldState, gatherOutput, restoreFieldState, type FieldControllerProps, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { anyToken, isCqlPatternNode, sequence, summary } from '@/features/form/model/types/form-query-ir';

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

/** Build a fresh token and child-state array for each default request. */
function createDefaultState(config: FieldControllerProps<TokenSequenceFieldConfig>, runtime: FormRuntimeContext): TokenSequenceFieldState {
	return Array.from({ length: tokenSequenceLengthBounds(config).defaultValue }, (_, index) => createDefaultTokenSequenceToken(config, runtime, index));
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
	.default(({ config, runtime }) => createDefaultState(config, runtime));

export const tokenSequenceController = defineFieldController<'token-sequence', TokenSequenceFieldDefinition>({
	kind: 'token-sequence',
	createDefaultState,
	persistence: { key: config => config.persistKey, codec: tokenSequencePersistenceCodec },
	outputs: ['patt'],
	collect(config, runtime, state, emit) {
		const patterns = state.map((token, index) => {
			const field = createTokenSequenceFieldNode(config, index, token.fieldId);
			return combineCqlPatterns(gatherOutput(field, token.fieldState, runtime, 'patt', isCqlPatternNode), 'and') ?? anyToken();
		});
		const pattern = sequence(patterns);
		if (pattern) emit('patt', pattern);
	},
	summarize(config, runtime, state, emit) {
		const length = summary(toValue(config.lengthDisplayName), state.length.toLocaleString(), undefined, config.groupId);
		if (length) emit(length);
		state.forEach((token, index) => {
			const field = createTokenSequenceFieldNode(config, index, token.fieldId);
			field.controller.summarize?.(field, runtime, token.fieldState, emit);
		});
	},
});
