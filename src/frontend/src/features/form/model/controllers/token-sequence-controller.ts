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
import { anyToken, combineQueries, queryFragment, queryIR, tokenSequence } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, encodePersistObject, joinPersistValues } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type EncodedFieldValue, type FieldControllerProps, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';

const LENGTH_KEY = 'length';
const TOKEN_KEY_PREFIX = 'token';
const FIELD_ID_KEY = 'field';

function tokenKey(index: number, key: string): string {
	return `${TOKEN_KEY_PREFIX}.${index}.${key}`;
}

function tokenFieldKey(index: number): string {
	return tokenKey(index, FIELD_ID_KEY);
}

function tokenChildKey(index: number, persistKey: string): string {
	if (!persistKey) throw new Error('Cannot encode an empty token sequence child persistence key.');
	return tokenKey(index, persistKey);
}

function nestedEncodedValue(value: EncodedFieldValue | null | undefined): string | undefined {
	if (value == null || value === '') return undefined;
	if (Array.isArray(value)) return value.length ? joinPersistValues(value) : undefined;
	return value;
}

function createDefaultState(config: FieldControllerProps<TokenSequenceFieldConfig>, runtime: FormRuntimeContext): TokenSequenceFieldState {
	const bounds = tokenSequenceLengthBounds(config);
	return Array.from({ length: bounds.defaultValue }, (_, index) => createDefaultTokenSequenceToken(config, runtime, index));
}

function restoredLength(restored: Record<string, string>, config: FieldControllerProps<TokenSequenceFieldConfig>): number {
	const bounds = tokenSequenceLengthBounds(config);
	const rawLength = restored[LENGTH_KEY];
	if (rawLength == null || !/^\d+$/.test(rawLength)) throw new Error(`Cannot restore token sequence without a valid '${LENGTH_KEY}'.`);
	const length = Number(rawLength);
	if (length < bounds.min || length > bounds.max) throw new Error(`Cannot restore token sequence length ${length}; expected ${bounds.min}-${bounds.max}.`);
	return length;
}

function restoreToken(index: number, restored: Record<string, string>, config: FieldControllerProps<TokenSequenceFieldConfig>, runtime: FormRuntimeContext): TokenSequenceTokenState {
	const requestedFieldId = restored[tokenFieldKey(index)];
	if (!requestedFieldId) throw new Error(`Cannot restore token ${index + 1} without a selected field.`);
	const selectedFieldId = resolveTokenSequenceFieldId(config, requestedFieldId);
	if (selectedFieldId !== requestedFieldId) throw new Error(`Cannot restore token ${index + 1} field '${requestedFieldId}' because it is not available.`);

	const field = createTokenSequenceFieldNode(config, index, selectedFieldId);
	const persistKey = field.controller.getPersistKey(field, runtime);
	const expectedChildKey = tokenChildKey(index, persistKey);
	const defaultToken = createDefaultTokenSequenceToken(config, runtime, index, selectedFieldId);
	const payload = restored[expectedChildKey];
	if (payload == null) return defaultToken;
	return {
		fieldId: selectedFieldId,
		fieldState: field.controller.restore(payload, field, runtime),
	};
}

export const tokenSequenceController = defineFieldController<'token-sequence', TokenSequenceFieldDefinition>({
	kind: 'token-sequence',
	createDefaultState,
	getPersistKey: config => config.persistKey,
	affectsBlackLabParameters: ['patt'],
	encode(state, config, runtime) {
		const values: Record<string, string | null | undefined | boolean> = {
			[LENGTH_KEY]: String(state.length),
		};
		for (const [index, token] of state.entries()) {
			const field = createTokenSequenceFieldNode(config, index, token.fieldId);
			const persistKey = field.controller.getPersistKey(field, runtime);
			values[tokenFieldKey(index)] = token.fieldId;
			values[tokenChildKey(index, persistKey)] = nestedEncodedValue(field.controller.encode(token.fieldState, field, runtime));
		}
		return encodePersistObject(values);
	},
	restore(payload, config, runtime) {
		const restored = decodePersistObject(payload);
		const state = Array.from({ length: restoredLength(restored, config) }, (_, index) => restoreToken(index, restored, config, runtime));
		const supportedKeys = new Set([LENGTH_KEY]);
		for (const [index, token] of state.entries()) {
			const field = createTokenSequenceFieldNode(config, index, token.fieldId);
			supportedKeys.add(tokenFieldKey(index));
			supportedKeys.add(tokenChildKey(index, field.controller.getPersistKey(field, runtime)));
		}
		const unknownKeys = Object.keys(restored).filter(key => !supportedKeys.has(key));
		if (unknownKeys.length) throw new Error(`Cannot restore token sequence with unsupported keys: ${unknownKeys.join(', ')}.`);
		return state;
	},
	getQueryContribution(config, runtime, state) {
		const contributions = state.map((token, index) => {
			const field = createTokenSequenceFieldNode(config, index, token.fieldId);
			return getFieldQueryContribution(field, runtime, token.fieldState);
		});
		const combined = combineQueries(
			contributions.map(contribution => contribution.query),
			'and',
		);
		return queryFragment({
			query: queryIR({
				...combined,
				pattern: tokenSequence(contributions.map(contribution => contribution.query.pattern ?? anyToken())),
			}),
			summaries: [
				{
					label: config.lengthDisplayName,
					value: String(state.length),
				},
				...contributions.flatMap(contribution => contribution.summaries),
			],
		});
	},
});
