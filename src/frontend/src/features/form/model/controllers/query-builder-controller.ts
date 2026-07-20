import { toValue } from 'vue';

import { createDefaultCqlQueryBuilderData, isCqlAttributeData, isCqlAttributeGroupData } from '@/features/cql-query-builder/model';
import type { CqlAnnotationCombinator, CqlAttributeData, CqlAttributeGroupData, CqlGroupEntry } from '@/features/cql-query-builder/model';
import type { QueryBuilderFieldConfig, QueryBuilderFieldDefinition, QueryBuilderFieldState } from '@/features/form/fields/query-builder-field';
import { anyToken, compileQueryIR, queryFragment, queryIR, repeat, token, tokenSequence, xmlTag } from '@/features/form/model/compile/query-artifact';
import { array, bool, lazy, number, object, scalar, variant, type PersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';
import { booleanExpr, type BooleanType, type CqlPattern, type TokenPredicate } from '@/features/form/model/types/form-query';

import { findOption } from '@/shared/utils/options';

const CODEC_VERSION = '2';

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

function validateRepeatBounds(token: QueryBuilderFieldState['tokens'][number]): string | undefined {
	const { minRepeats, maxRepeats } = token.properties;
	for (const [name, value] of [
		['minimum', minRepeats],
		['maximum', maxRepeats],
	] as const) {
		if (!Number.isNaN(value) && (!Number.isInteger(value) || value < 0)) return `Querybuilder repeat ${name} must be a non-negative integer.`;
	}
	if (!Number.isNaN(minRepeats) && !Number.isNaN(maxRepeats) && minRepeats > maxRepeats) return 'Querybuilder repeat minimum cannot exceed its maximum.';
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

let nextRestoredId = 0;
function restoredId(prefix: string): string {
	nextRestoredId += 1;
	return `${prefix}_restored_${nextRestoredId}`;
}

const comparatorCodec = scalar().mapped({ '=': 'e', '!=': 'n', startsWith: 's', endsWith: 'd' });
const operatorCodec = scalar().mapped({ '&': 'a', '|': 'o' });

const attributeCodec = object({
	annotationId: scalar().at('a'),
	comparator: comparatorCodec.default('=').at('c'),
	values: array(scalar()).default(['']).at('v'),
	caseSensitive: bool().default(false).at('s'),
}).transform<CqlAttributeData>({
	encode: attribute => ({
		annotationId: attribute.annotationId,
		comparator: attribute.comparator,
		values: attribute.values.filter(value => value !== ''),
		caseSensitive: attribute.caseSensitive,
	}),
	decode: attribute => ({ ...attribute, id: restoredId('attr') }),
});

const entryCodec: PersistenceCodec<CqlGroupEntry> = lazy(() =>
	variant<CqlGroupEntry>(
		{
			a: attributeCodec,
			g: groupCodec,
		},
		entry => (isCqlAttributeData(entry) ? 'a' : 'g'),
	),
);

const groupCodec: PersistenceCodec<CqlAttributeGroupData> = lazy(() =>
	object({
		operator: operatorCodec.default('&').at('o'),
		entries: array(entryCodec).default([]).at('e'),
	}).transform<CqlAttributeGroupData>({
		encode: group => ({ operator: group.operator, entries: group.entries }),
		decode: group => ({ ...group, id: restoredId('group') }),
	}),
);

const repeatCodec = number().default(1).omitWhen(Number.isNaN);
const tokenCodec = object({
	optional: bool().default(false).at('o'),
	minRepeats: repeatCodec.at('n'),
	maxRepeats: repeatCodec.at('x'),
	beginOfSentence: bool().default(false).at('b'),
	endOfSentence: bool().default(false).at('e'),
	rootAttributeGroup: groupCodec.at('g'),
}).transform<QueryBuilderFieldState['tokens'][number]>({
	encode: token => ({ ...token.properties, rootAttributeGroup: token.rootAttributeGroup }),
	decode: token => ({
		id: restoredId('token'),
		properties: {
			optional: token.optional,
			minRepeats: token.minRepeats,
			maxRepeats: token.maxRepeats,
			beginOfSentence: token.beginOfSentence,
			endOfSentence: token.endOfSentence,
		},
		rootAttributeGroup: token.rootAttributeGroup,
	}),
});

const queryBuilderPersistenceCodec = object({
	version: scalar().refine(value => (value === CODEC_VERSION ? undefined : `Cannot restore querybuilder value with unsupported version '${value}'.`)).at('v'),
	tokens: array(tokenCodec).default([]).at('t'),
})
	.transform<QueryBuilderFieldState>({
		encode: state => ({ version: CODEC_VERSION, tokens: state.tokens }),
		decode: state => ({ tokens: state.tokens }),
	})
	.default(({ config }) => createDefaultState(config))
	.omitWhen(state => !stateToPattern(state))
	.refine((state, { config }) => {
		for (const token of state.tokens) {
			const invalidRepeat = validateRepeatBounds(token);
			if (invalidRepeat) return invalidRepeat;
			const unavailable = findUnavailableAnnotation(token.rootAttributeGroup, config);
			if (unavailable) return `Cannot restore querybuilder annotation '${unavailable}' because it is not available in the current form.`;
		}
	});

export const queryBuilderController = defineFieldController<'cql-query-builder', QueryBuilderFieldDefinition>({
	kind: 'cql-query-builder',
	createDefaultState,
	persistence: { key: () => 'query', codec: queryBuilderPersistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, runtime, state) {
		const pattern = stateToPattern(state);
		const query = queryIR({ pattern });
		const cql = compileQueryIR(query).patt;
		return queryFragment(query, cql ? { label: toValue(config.displayName) ?? runtime.translate.$t('search.advanced.queryBuilder'), value: cql } : null);
	},
});
