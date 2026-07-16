import { toValue } from 'vue';

import { createDefaultCqlQueryBuilderData, isCqlAttributeData, isCqlAttributeGroupData } from '@/features/cql-query-builder/model';
import type { CqlAnnotationCombinator, CqlAttributeData, CqlAttributeGroupData, CqlGroupEntry } from '@/features/cql-query-builder/model';
import type { QueryBuilderFieldConfig, QueryBuilderFieldDefinition, QueryBuilderFieldState } from '@/features/form/fields/query-builder-field';
import { anyToken, compileQueryIR, queryFragment, queryIR, repeat, token, tokenSequence, xmlTag } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, encodePersistObject, joinPersistValues, splitPersistValue } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';
import { booleanExpr, type BooleanType, type CqlPattern, type TokenPredicate } from '@/features/form/model/types/form-query';

import { findOption } from '@/shared/utils/options';

const CODEC_VERSION = '1';
const ENTRY_ATTRIBUTE_PREFIX = 'a:';
const ENTRY_GROUP_PREFIX = 'g:';

function createDefaultState(config: QueryBuilderFieldConfig): QueryBuilderFieldState {
	return createDefaultCqlQueryBuilderData(config.options.defaultAnnotationId);
}

function findUnavailableAnnotation(group: CqlAttributeGroupData, config: QueryBuilderFieldConfig): string | null {
	for (const entry of group.entries) {
		if (isCqlAttributeData(entry)) {
			if (!findOption(config.options.annotationOptions, entry.annotationId)) return entry.annotationId;
		} else {
			const unavailable = findUnavailableAnnotation(entry, config);
			if (unavailable) return unavailable;
		}
	}
	return null;
}

function operatorToBoolean(operator: CqlAnnotationCombinator): BooleanType {
	return operator === '|' ? 'or' : 'and';
}

function comparatorValue(attribute: CqlAttributeData): string {
	const values = attribute.values.filter(value => value !== '');
	const value = values.join('|');
	if (attribute.comparator === 'startsWith') return `${value}.*`;
	if (attribute.comparator === 'endsWith') return `.*${value}`;
	return value;
}

function attributeToPredicate(attribute: CqlAttributeData): TokenPredicate | null {
	const value = comparatorValue(attribute);
	if (!value) return null;
	return {
		type: 'predicate',
		match: 'regex',
		annotation: attribute.annotationId,
		value,
		operator: attribute.comparator === '!=' ? '!=' : '=',
		caseMode: attribute.caseSensitive ? 'sensitive' : 'default',
	};
}

function groupEntryToPredicate(entry: CqlGroupEntry): TokenPredicate | null {
	if (isCqlAttributeData(entry)) return attributeToPredicate(entry);
	if (isCqlAttributeGroupData(entry)) return groupToPredicate(entry);
	return null;
}

function groupToPredicate(group: CqlAttributeGroupData): TokenPredicate | null {
	const children = group.entries.map(groupEntryToPredicate).filter((child): child is TokenPredicate => child != null);
	if (!children.length) return null;
	if (children.length === 1) return children[0];
	return booleanExpr(operatorToBoolean(group.operator), ...children);
}

function hasRepeat(properties: QueryBuilderFieldState['tokens'][number]['properties']): boolean {
	const { minRepeats, maxRepeats, optional } = properties;
	const bothUnset = Number.isNaN(minRepeats) && Number.isNaN(maxRepeats);
	if (bothUnset) return optional;
	return optional || minRepeats !== 1 || maxRepeats !== 1;
}

function tokenToPattern(builderToken: QueryBuilderFieldState['tokens'][number]): CqlPattern | null {
	const predicate = groupToPredicate(builderToken.rootAttributeGroup);
	const hasTokenBody = predicate || hasRepeat(builderToken.properties);
	if (!hasTokenBody && !builderToken.properties.beginOfSentence && !builderToken.properties.endOfSentence) return null;

	const body = predicate ? token(predicate)! : anyToken();
	const repeated = hasRepeat(builderToken.properties) ? repeat(body, builderToken.properties.minRepeats, builderToken.properties.maxRepeats, builderToken.properties.optional) : body;
	return tokenSequence([builderToken.properties.beginOfSentence ? xmlTag('s') : null, repeated, builderToken.properties.endOfSentence ? xmlTag('s', true) : null]);
}

function stateToPattern(state: QueryBuilderFieldState): CqlPattern | null {
	return tokenSequence(state.tokens.map(tokenToPattern));
}

function encodeAttribute(attribute: CqlAttributeData): string {
	return encodePersistObject({
		a: attribute.annotationId,
		cmp: attribute.comparator !== '=' ? attribute.comparator : undefined,
		v: attribute.values.length ? joinPersistValues(attribute.values, ';') : undefined,
		cs: attribute.caseSensitive,
	})!;
}

function encodeGroup(group: CqlAttributeGroupData): string {
	return encodePersistObject({
		op: group.operator !== '&' ? group.operator : undefined,
		e: group.entries.length ? joinPersistValues(group.entries.map(encodeEntry), ';') : undefined,
	})!;
}

function encodeEntry(entry: CqlGroupEntry): string {
	if (isCqlAttributeData(entry)) return `${ENTRY_ATTRIBUTE_PREFIX}${encodeAttribute(entry)}`;
	return `${ENTRY_GROUP_PREFIX}${encodeGroup(entry)}`;
}

function encodeToken(token: QueryBuilderFieldState['tokens'][number]): string {
	return encodePersistObject({
		o: token.properties.optional,
		min: token.properties.minRepeats !== 1 ? String(token.properties.minRepeats) : undefined,
		max: token.properties.maxRepeats !== 1 ? String(token.properties.maxRepeats) : undefined,
		b: token.properties.beginOfSentence,
		e: token.properties.endOfSentence,
		g: encodeGroup(token.rootAttributeGroup),
	})!;
}

function parseNumber(value: string | undefined, fallback: number): number {
	if (value == null || value === '') return fallback;
	const parsed = Number(value);
	return Number.isNaN(parsed) ? fallback : parsed;
}

let nextRestoredId = 0;
function restoredId(prefix: string): string {
	nextRestoredId += 1;
	return `${prefix}_restored_${nextRestoredId}`;
}

function decodeAttribute(encoded: string, defaultAnnotationId: string): CqlAttributeData {
	const restored = decodePersistObject(encoded);
	return {
		id: restoredId('attr'),
		annotationId: restored.a || defaultAnnotationId,
		comparator: restored.cmp === '!=' || restored.cmp === 'startsWith' || restored.cmp === 'endsWith' ? restored.cmp : '=',
		values: restored.v != null ? splitPersistValue(restored.v, ';') : [''],
		caseSensitive: restored.cs === '1',
	};
}

function decodeGroup(encoded: string, defaultAnnotationId: string): CqlAttributeGroupData {
	const restored = decodePersistObject(encoded);
	return {
		id: restoredId('group'),
		operator: restored.op === '|' ? '|' : '&',
		entries: restored.e ? splitPersistValue(restored.e, ';').map(entry => decodeEntry(entry, defaultAnnotationId)) : [],
	};
}

function decodeEntry(encoded: string, defaultAnnotationId: string): CqlGroupEntry {
	if (encoded.startsWith(ENTRY_ATTRIBUTE_PREFIX)) return decodeAttribute(encoded.slice(ENTRY_ATTRIBUTE_PREFIX.length), defaultAnnotationId);
	if (encoded.startsWith(ENTRY_GROUP_PREFIX)) return decodeGroup(encoded.slice(ENTRY_GROUP_PREFIX.length), defaultAnnotationId);
	throw new Error('Cannot restore querybuilder entry with unsupported type.');
}

function decodeToken(encoded: string, defaultAnnotationId: string): QueryBuilderFieldState['tokens'][number] {
	const restored = decodePersistObject(encoded);
	return {
		id: restoredId('token'),
		properties: {
			optional: restored.o === '1',
			minRepeats: parseNumber(restored.min, 1),
			maxRepeats: parseNumber(restored.max, 1),
			beginOfSentence: restored.b === '1',
			endOfSentence: restored.e === '1',
		},
		rootAttributeGroup: restored.g ? decodeGroup(restored.g, defaultAnnotationId) : { id: restoredId('group'), operator: '&', entries: [] },
	};
}

function encodeState(state: QueryBuilderFieldState): string | null {
	if (!stateToPattern(state)) return null;
	return encodePersistObject({
		v: CODEC_VERSION,
		t: joinPersistValues(state.tokens.map(encodeToken), ';'),
	});
}

function restoreState(payload: string | string[], config: QueryBuilderFieldConfig): QueryBuilderFieldState {
	const restored = decodePersistObject(payload);
	if (restored.v !== CODEC_VERSION) throw new Error(`Cannot restore querybuilder value with unsupported version '${restored.v ?? ''}'.`);
	const state = {
		tokens: restored.t ? splitPersistValue(restored.t, ';').map(token => decodeToken(token, config.options.defaultAnnotationId)) : [],
	};
	for (const token of state.tokens) {
		const unavailable = findUnavailableAnnotation(token.rootAttributeGroup, config);
		if (unavailable) throw new Error(`Cannot restore querybuilder annotation '${unavailable}' because it is not available in the current form.`);
	}
	return state;
}

export const queryBuilderController = defineFieldController<'cql-query-builder', QueryBuilderFieldDefinition>({
	kind: 'cql-query-builder',
	createDefaultState,
	getPersistKey: () => 'query',
	affectsBlackLabParameters: ['patt'],
	encode: encodeState,
	restore: restoreState,
	getQueryContribution(config, runtime, state) {
		const pattern = stateToPattern(state);
		const query = queryIR({ pattern });
		const cql = compileQueryIR(query).patt;
		return queryFragment(query, cql ? { label: toValue(config.displayName) ?? runtime.translate.$t('search.advanced.queryBuilder'), value: cql } : null);
	},
});
