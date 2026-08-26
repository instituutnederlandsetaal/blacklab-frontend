import { toValue } from 'vue';

import { createDefaultCqlQueryBuilderData, isCqlAttributeData } from '@/features/cql-query-builder/model';
import type { CqlAttributeData, CqlAttributeGroupData, CqlGroupEntry } from '@/features/cql-query-builder/model';
import type { QueryBuilderFieldConfig, QueryBuilderFieldDefinition, QueryBuilderFieldState } from '@/features/form/fields/query-builder-field';
import { compileCql } from '@/features/form/model/compile/query-artifact';
import { array, bool, lazy, number, object, scalar, variant, type PersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';
import { annotation, anyToken, booleanNode, repeat, sequence, xmlTag, type CqlAnnotationNode } from '@/features/form/model/types/form-query-ir';

import { findOption } from '@/shared/utils/options';

const CODEC_VERSION = '2';

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

function attributeToPredicate(attribute: CqlAttributeData): CqlAnnotationNode | null {
	const values = attribute.values.filter(value => value !== '');
	let value = values.join('|');
	if (attribute.comparator === 'startsWith') value = `${value}.*`;
	if (attribute.comparator === 'endsWith') value = `.*${value}`;
	if (!value) return null;
	return annotation(attribute.annotationId, 'regex', value, {
		operator: attribute.comparator === '!=' ? '!=' : '=',
		caseSensitive: attribute.caseSensitive || undefined,
	});
}

function groupEntryToPredicate(entry: CqlGroupEntry): CqlAnnotationNode | null {
	return isCqlAttributeData(entry) ? attributeToPredicate(entry) : groupToPredicate(entry);
}

function groupToPredicate(group: CqlAttributeGroupData): CqlAnnotationNode | null {
	const children = group.entries.map(groupEntryToPredicate).filter((child): child is CqlAnnotationNode => child != null);
	if (!children.length) return null;
	if (children.length === 1) return children[0];
	return booleanNode(group.operator === '|' ? 'or' : 'and', ...children);
}

function hasRepeat(properties: QueryBuilderFieldState['tokens'][number]['properties']): boolean {
	const { minRepeats, maxRepeats, optional } = properties;
	const bothUnset = Number.isNaN(minRepeats) && Number.isNaN(maxRepeats);
	if (bothUnset) return optional;
	return optional || minRepeats !== 1 || maxRepeats !== 1;
}

function tokenToPatternParts(builderToken: QueryBuilderFieldState['tokens'][number]) {
	const predicate = groupToPredicate(builderToken.rootAttributeGroup);
	const hasTokenBody = predicate || hasRepeat(builderToken.properties);
	if (!hasTokenBody && !builderToken.properties.beginOfSentence && !builderToken.properties.endOfSentence) return [];

	const body = predicate ?? anyToken();
	const repeated = hasRepeat(builderToken.properties)
		? repeat({
				child: body,
				minRepeats: builderToken.properties.minRepeats,
				maxRepeats: builderToken.properties.maxRepeats,
				optional: builderToken.properties.optional,
			})
		: body;
	return [builderToken.properties.beginOfSentence ? xmlTag('s') : null, repeated, builderToken.properties.endOfSentence ? xmlTag('s', true) : null];
}

/** Compile a complete query-builder state through the shared per-token conversion. */
function stateToPattern(state: QueryBuilderFieldState) {
	return sequence(state.tokens.flatMap(tokenToPatternParts));
}

let nextRestoredId = 0;
/** Allocate unique IDs for nodes reconstructed from persistence payloads. */
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
	version: scalar()
		.refine(value => (value === CODEC_VERSION ? undefined : `Cannot restore querybuilder value with unsupported version '${value}'.`))
		.at('v'),
	tokens: array(tokenCodec).default([]).at('t'),
})
	.transform<QueryBuilderFieldState>({
		encode: state => ({ version: CODEC_VERSION, tokens: state.tokens }),
		decode: state => ({ tokens: state.tokens }),
	})
	.default(({ config }) => createDefaultCqlQueryBuilderData(config.options.defaultAnnotationId))
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
	createDefaultState: config => createDefaultCqlQueryBuilderData(config.options.defaultAnnotationId),
	persistence: { key: () => 'query', codec: queryBuilderPersistenceCodec },
	outputs: ['patt'],
	collect(_config, _runtime, state, emit) {
		const pattern = stateToPattern(state);
		if (pattern) emit('patt', pattern);
	},
	summarize(config, runtime, state, emit) {
		const pattern = stateToPattern(state);
		const cql = pattern && compileCql(pattern);
		if (cql) emit({ label: toValue(config.displayName) ?? runtime.translate.$t('search.advanced.queryBuilder'), value: cql });
	},
});
