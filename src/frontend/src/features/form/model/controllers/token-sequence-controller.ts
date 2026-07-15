import {
	createDefaultTokenSequenceToken,
	createTokenSequenceChildConfig,
	getTokenSequenceChild,
	tokenSequenceLengthBounds,
	type TokenSequenceChildFieldConfig,
	type TokenSequenceFieldConfig,
	type TokenSequenceFieldDefinition,
	type TokenSequenceFieldState,
	type TokenSequenceTokenState,
} from '@/features/form/fields/token-sequence-field';
import { anyToken, combineQueries, queryFragment, queryIR, tokenSequence } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, encodePersistObject, joinPersistValues } from '@/features/form/model/controllers/persistence-codec';
import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';
import { defineFieldController, type EncodedFieldValue, type FieldControllerProps, type FormRuntimeContext, type RestoreFieldResult } from '@/features/form/model/types/form-controllers';

const LENGTH_KEY = 'length';
const TOKEN_KEY_PREFIX = 'token';
const FIELD_ID_KEY = 'field';

type RestoreMessages = {
	warnings: string[];
	errors: string[];
};

function childKeySegment(value: string, label: string): string {
	if (!value) throw new Error(`Cannot encode empty token sequence child ${label}.`);
	return encodeURIComponent(value).replace(/\./g, '%2E');
}

function tokenKey(index: number, key: string): string {
	return `${TOKEN_KEY_PREFIX}.${index}.${key}`;
}

function tokenFieldKey(index: number): string {
	return tokenKey(index, FIELD_ID_KEY);
}

function tokenChildKey(index: number, persistKey: string): string {
	return tokenKey(index, childKeySegment(persistKey, 'persist key'));
}

function nestedEncodedValue(value: EncodedFieldValue | null | undefined): string | undefined {
	if (value == null || value === '') return undefined;
	if (Array.isArray(value)) return value.length ? joinPersistValues(value) : undefined;
	return value;
}

function isRestoreObject<State>(result: RestoreFieldResult<State>): result is { state: State; warnings?: string[]; errors?: string[] } {
	return !!result && typeof result === 'object' && 'state' in result;
}

function restoredChildState<State>(result: RestoreFieldResult<State>, messages: RestoreMessages): State {
	if (!isRestoreObject(result)) return result;
	messages.warnings.push(...(result.warnings ?? []));
	messages.errors.push(...(result.errors ?? []));
	return result.state;
}

function createDefaultState(config: FieldControllerProps<TokenSequenceFieldConfig>, runtime: FormRuntimeContext): TokenSequenceFieldState {
	const bounds = tokenSequenceLengthBounds(config);
	return Array.from({ length: bounds.defaultValue }, (_, index) => createDefaultTokenSequenceToken(config, runtime, index));
}

function normalizeRuntimeState(
	state: TokenSequenceFieldState,
	config: FieldControllerProps<TokenSequenceFieldConfig>,
	runtime: FormRuntimeContext,
): Array<{ child: TokenSequenceChildFieldConfig; token: TokenSequenceTokenState }> {
	const bounds = tokenSequenceLengthBounds(config);
	const runtimeTokens = Array.isArray(state) ? state : [];
	const length = Math.min(bounds.max, Math.max(bounds.min, Array.isArray(state) ? state.length : bounds.defaultValue));
	return Array.from({ length }, (_, index) => {
		const token = runtimeTokens[index];
		const child = getTokenSequenceChild(config, token?.fieldId);
		const validToken = token && token.fieldId === child.id;
		return {
			child,
			token: validToken ? token : createDefaultTokenSequenceToken(config, runtime, index, child.id),
		};
	});
}

function restoredLength(restored: Record<string, string>, config: FieldControllerProps<TokenSequenceFieldConfig>, messages: RestoreMessages): number {
	const bounds = tokenSequenceLengthBounds(config);
	const rawLength = restored[LENGTH_KEY];
	if (rawLength == null) {
		const indices = Object.keys(restored)
			.map(key => key.match(/^token\.(\d+)\./)?.[1])
			.filter((value): value is string => value != null)
			.map(Number);
		if (!indices.length) {
			messages.warnings.push(`Restored token sequence did not contain a valid '${LENGTH_KEY}' value; used the configured default length ${bounds.defaultValue}.`);
			return bounds.defaultValue;
		}
		const inferred = Math.max(...indices) + 1;
		const length = Math.min(bounds.max, Math.max(bounds.min, inferred));
		messages.warnings.push(`Restored token sequence omitted '${LENGTH_KEY}'; inferred length ${length} from its token entries.`);
		return length;
	}

	if (!/^-?\d+$/.test(rawLength)) {
		messages.warnings.push(`Restored token sequence length '${rawLength}' is not an integer; used the configured default length ${bounds.defaultValue}.`);
		return bounds.defaultValue;
	}

	const requested = Number(rawLength);
	const length = Math.min(bounds.max, Math.max(bounds.min, requested));
	if (length !== requested) messages.warnings.push(`Restored token sequence length ${requested} was outside ${bounds.min}-${bounds.max}; used ${length}.`);
	return length;
}

function restoreToken(
	index: number,
	restored: Record<string, string>,
	config: FieldControllerProps<TokenSequenceFieldConfig>,
	runtime: FormRuntimeContext,
	messages: RestoreMessages,
): TokenSequenceTokenState {
	const requestedFieldId = restored[tokenFieldKey(index)] ?? config.defaultFieldId;
	const child = getTokenSequenceChild(config, requestedFieldId);
	if (child.id !== requestedFieldId) messages.warnings.push(`Restored token ${index + 1} field '${requestedFieldId}' is no longer available; used '${child.id}'.`);

	const childConfig = createTokenSequenceChildConfig(config, child, index);
	const persistKey = child.controller.getPersistKey(childConfig, runtime);
	const expectedChildKey = tokenChildKey(index, persistKey);
	const defaultToken = createDefaultTokenSequenceToken(config, runtime, index, child.id);
	const prefix = `${TOKEN_KEY_PREFIX}.${index}.`;
	const unknownKeys = Object.keys(restored).filter(key => key.startsWith(prefix) && key !== tokenFieldKey(index) && key !== expectedChildKey);
	if (unknownKeys.length) messages.warnings.push(`Ignored unsupported restored payload for token ${index + 1}: ${unknownKeys.join(', ')}.`);

	const payload = restored[expectedChildKey];
	if (payload == null) return defaultToken;
	try {
		return {
			fieldId: child.id,
			fieldState: restoredChildState(child.controller.restore(payload, childConfig, runtime), messages),
		};
	} catch (error) {
		messages.errors.push(`Could not restore token ${index + 1} field '${child.id}': ${error instanceof Error ? error.message : String(error)}`);
		return defaultToken;
	}
}

export const tokenSequenceController = defineFieldController<'token-sequence', TokenSequenceFieldDefinition>({
	kind: 'token-sequence',
	createDefaultState,
	getPersistKey: config => config.persistKey,
	affectsBlackLabParameters(config, runtime) {
		const affected = new Set<BlackLabParameter>(['patt']);
		for (const child of config.fields) {
			const childConfig = createTokenSequenceChildConfig(config, child, 0);
			const childAffected =
				typeof child.controller.affectsBlackLabParameters === 'function' ? child.controller.affectsBlackLabParameters(childConfig, runtime) : child.controller.affectsBlackLabParameters;
			for (const parameter of childAffected) affected.add(parameter);
		}
		return [...affected];
	},
	encode(state, config, runtime) {
		const tokens = normalizeRuntimeState(state, config, runtime);
		const values: Record<string, string | null | undefined | boolean> = {
			[LENGTH_KEY]: String(tokens.length),
		};
		for (const [index, { child, token }] of tokens.entries()) {
			const childConfig = createTokenSequenceChildConfig(config, child, index);
			const persistKey = child.controller.getPersistKey(childConfig, runtime);
			values[tokenFieldKey(index)] = child.id;
			values[tokenChildKey(index, persistKey)] = nestedEncodedValue(child.controller.encode(token.fieldState, childConfig, runtime));
		}
		return encodePersistObject(values);
	},
	restore(payload, config, runtime) {
		const restored = decodePersistObject(payload);
		const messages: RestoreMessages = { warnings: [], errors: [] };
		const length = restoredLength(restored, config, messages);
		const state = Array.from({ length }, (_, index) => restoreToken(index, restored, config, runtime, messages));
		return messages.warnings.length || messages.errors.length
			? {
					state,
					warnings: messages.warnings.length ? messages.warnings : undefined,
					errors: messages.errors.length ? messages.errors : undefined,
				}
			: state;
	},
	getQueryContribution(config, runtime, state) {
		const tokens = normalizeRuntimeState(state, config, runtime);
		const contributions = tokens.map(({ child, token }, index) => child.controller.getQueryContribution(createTokenSequenceChildConfig(config, child, index), runtime, token.fieldState));
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
					id: `${config.id}.length`,
					label: config.lengthDisplayName,
					value: String(tokens.length),
				},
				...contributions.flatMap(contribution => contribution.summaries),
			],
		});
	},
});
