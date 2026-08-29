import {
	booleanNode,
	type BooleanType,
	type CqlAnnotationNode,
	type CqlPatternNode,
	type CqlWrapperNode,
	isBooleanNode,
	type LuceneNode,
	type PredicateTextNode,
	type PredicateValueNode,
	rawCql,
	sequence,
	simplifyBooleanNode,
	textPredicate,
} from '@/features/form/model/types/form-query-ir';
import type { QueryCombineMode } from '@/features/form/model/types/form-shape';

import { parenQueryPartParallel } from '@/shared/blacklab-helpers/cql/bcql-pattern-helpers';
import { getParallelFieldParts } from '@/shared/blacklab-helpers/parallel-helper';
import { escapeLucene, escapeRegex } from '@/shared/utils/string-utils';

type CqlAnnotationLeaf = Extract<CqlAnnotationNode, { type: 'cql-annotation' }>;
type CqlWithinWrapper = Extract<CqlWrapperNode, { type: 'cql-within' }>;
type CqlWrapperWithAttributes = Extract<CqlWrapperNode, { attributes: Record<string, unknown> }>;
type LuceneLeaf = Extract<LuceneNode, { type: 'lucene-field' }>;
type WrapperAttribute = CqlWithinWrapper['attributes'][string];

// Pipeline
// =========================================================================================================================

export function compileCql(pattern: CqlPatternNode): string | null {
	const extracted = extractWrappers(pattern);
	return emitCqlWithWrappers(simplifyCql(extracted.pattern), simplifyWrappers(extracted.wrappers));
}

/** Lower semantic Lucene IR to BlackLab's filter parameter syntax. */
export function compileFilter(filter: LuceneNode): string | null {
	const simplified = simplifyFilter(filter);
	return simplified ? emitRequiredFilter(simplified) : null;
}

export function combineCqlPatterns(patterns: CqlPatternNode[], combine: QueryCombineMode = 'and'): CqlPatternNode | null {
	if (combine === 'sequence') return sequence(patterns);
	return booleanNode(combine, patterns) as CqlPatternNode | null;
}

// Simplify
// =========================================================================================================================

type ExtractedCql = { pattern: CqlPatternNode | null; wrappers: CqlWrapperNode[] };

function extractWrappers(pattern: CqlPatternNode | null): ExtractedCql {
	if (!pattern) return { pattern: null, wrappers: [] };
	if (pattern.type === 'cql-within' || pattern.type === 'cql-containing') return { pattern: null, wrappers: [pattern] };
	if (isBooleanNode<CqlPatternNode>(pattern)) {
		const children = pattern.children.map(extractWrappers);
		return {
			pattern: booleanNode(pattern.type, children.map(child => child.pattern).filter(isNonNull)) as CqlPatternNode | null,
			wrappers: children.flatMap(child => child.wrappers),
		};
	}
	if (pattern.type === 'cql-sequence') {
		const children = pattern.children.map(extractWrappers);
		return {
			pattern: sequence(children.map(child => child.pattern).filter(isNonNull)),
			wrappers: children.flatMap(child => child.wrappers),
		};
	}
	if (pattern.type === 'cql-parallel') {
		const source = extractWrappers(pattern.source);
		const targets = pattern.targets.map(target => ({ target, extracted: extractWrappers(target.pattern) }));
		return {
			pattern: {
				...pattern,
				source: source.pattern,
				targets: targets.map(({ target, extracted }) => ({ ...target, pattern: extracted.pattern })),
			},
			wrappers: [...source.wrappers, ...targets.flatMap(({ extracted }) => extracted.wrappers)],
		};
	}
	return { pattern, wrappers: [] };
}

/**
 * Multiple 'within' clauses require some specific logic to avoid generating inverted clauses,
 * e.g. "within <parent/> within <child/>" would never return anything,
 * so distinct elements are emitted using the order-independent "overlap" operator.
 */
function simplifyWrappers(wrappers: CqlWrapperNode[]): CqlWrapperNode[] {
	const within = new Map<string, CqlWithinWrapper>();
	for (const wrapper of wrappers) {
		if (wrapper.type !== 'cql-within' || !wrapper.element) continue;
		const existing = within.get(wrapper.element);
		within.set(wrapper.element, {
			...wrapper,
			attributes: { ...existing?.attributes, ...wrapper.attributes },
		});
	}

	return [...wrappers.filter(wrapper => wrapper.type === 'cql-containing' && wrapper.element), ...within.values()].map(wrapper => ({
		...wrapper,
		attributes: simplifyWrapperAttributes(wrapper.attributes),
	}));
}

function simplifyWrapperAttributes(attributes: CqlWrapperWithAttributes['attributes']): CqlWrapperWithAttributes['attributes'] {
	return Object.fromEntries(
		Object.entries(attributes)
			.map(([name, value]) => [name, simplifyWrapperAttribute(value)] as const)
			.filter((entry): entry is readonly [string, WrapperAttribute] => entry[1] != null),
	);
}

function simplifyWrapperAttribute(value: WrapperAttribute): WrapperAttribute | null {
	if (!isBooleanNode<PredicateValueNode>(value)) return simplifyPredicateValue(value);
	return simplifyBooleanNode(
		value,
		simplifyPredicateValue,
		(operator, leaf) => (operator === 'or' && leaf.valueType !== 'range' && leaf.valueType !== 'regex' ? 'value' : null),
		leaves => mergeTextValues(leaves as PredicateTextNode[]),
	);
}

function simplifyPredicateValue(value: PredicateValueNode): PredicateValueNode | null {
	if (value.valueType === 'range') return value;
	return value.value.trim() ? value : null;
}

function simplifyCql(pattern: CqlPatternNode | null): CqlPatternNode | null {
	if (!pattern) return null;
	if (isCqlAnnotation(pattern)) return simplifyAnnotation(pattern);

	if (isBooleanNode<CqlPatternNode>(pattern)) {
		const simplified = simplifyBooleanNode({
			...pattern,
			children: pattern.children.map(child => simplifyCql(child)).filter(isNonNull),
		}) as CqlPatternNode | null;
		if (!simplified || !isBooleanNode<CqlPatternNode>(simplified)) return simplified;
		const folded = foldTokenSequences(simplified.children, simplified.type);
		return folded ? simplifyCql(folded) : simplified;
	}

	switch (pattern.type) {
		case 'cql-raw': {
			const cql = pattern.cql.trim();
			return cql ? rawCql(cql) : null;
		}
		case 'cql-any-token':
			return pattern;
		case 'cql-repeat': {
			const child = simplifyCql(pattern.child);
			return child ? ({ ...pattern, child } as CqlPatternNode) : null;
		}
		case 'cql-xml-tag':
			return pattern.name ? pattern : null;
		case 'cql-parallel': {
			const source = simplifyCql(pattern.source) ?? rawCql('_');
			return {
				...pattern,
				source,
				targets: pattern.targets.map(target => ({ ...target, pattern: simplifyCql(target.pattern) ?? rawCql('_') })),
			} as CqlPatternNode;
		}
		case 'cql-sequence': {
			const children = pattern.children
				.map(child => simplifyCql(child))
				.filter(isNonNull)
				.flatMap(child => (child.type === 'cql-sequence' ? child.children : [child]));
			if (!children.length) return null;
			if (children.length === 1) return children[0];
			return { type: 'cql-sequence', children };
		}
		case 'cql-within':
		case 'cql-containing':
			return null;
	}
}

function simplifyFilter(filter: LuceneNode | null): LuceneNode | null {
	if (!filter) return null;
	return simplifyBooleanNode(
		filter,
		leaf => {
			if (leaf.valueType === 'range') return leaf;
			return leaf.value.trim() ? leaf : null;
		},
		(operator, leaf) => (operator === 'or' && leaf.valueType !== 'range' && leaf.valueType !== 'regex' ? leaf.field : null),
		leaves => mergeTextValues(leaves as Array<LuceneLeaf & PredicateTextNode>),
	);
}

function simplifyAnnotation(expression: CqlAnnotationNode): CqlAnnotationNode | null {
	return simplifyBooleanNode(
		expression,
		leaf => (leaf.value.trim() ? leaf : null),
		(operator, leaf) => {
			const comparison = leaf.operator ?? '=';
			return leaf.valueType !== 'regex' && ((operator === 'or' && comparison === '=') || (operator === 'and' && comparison === '!='))
				? `${leaf.annotation}\0${comparison}\0${annotationSensitivityFlag(leaf)}`
				: null;
		},
		mergeTextValues,
	);
}

function mergeTextValues<TLeaf extends PredicateTextNode>(leaves: TLeaf[]): TLeaf {
	return {
		...leaves[0],
		...textPredicate('regex', leaves.map(predicateValueToRegex).join('|')),
	};
}

function foldTokenSequences(patterns: CqlPatternNode[], operator: BooleanType): CqlPatternNode | null {
	const sequences = patterns.map(asTokenSequence);
	if (sequences.some(sequence => !sequence)) return null;

	const maxLength = Math.max(...sequences.map(sequence => sequence?.length ?? 0));
	const children: CqlAnnotationNode[] = [];
	for (let index = 0; index < maxLength; index += 1) {
		const tokens = sequences.map(sequence => sequence?.[index]).filter(isNonNull);
		const combined = booleanNode(operator, tokens) as CqlAnnotationNode | null;
		if (combined) children.push(combined);
	}

	if (!children.length) return null;
	if (children.length === 1) return children[0];
	return { type: 'cql-sequence', children };
}

function asTokenSequence(pattern: CqlPatternNode): CqlAnnotationNode[] | null {
	if (isCqlAnnotation(pattern)) return [pattern];
	if (pattern.type === 'cql-sequence' && pattern.children.every(isCqlAnnotation)) return pattern.children as CqlAnnotationNode[];
	return null;
}

function isCqlAnnotation(node: CqlPatternNode): node is CqlAnnotationNode {
	if (!isBooleanNode<CqlPatternNode>(node)) return node.type === 'cql-annotation';
	return node.children.every(isCqlAnnotation);
}

// Emit
// =========================================================================================================================

function emitCqlWithWrappers(pattern: CqlPatternNode | null, wrappers: CqlWrapperNode[]): string | null {
	let cql = pattern ? emitRequiredCql(pattern) : null;
	for (const wrapper of wrappers) {
		if (wrapper.type === 'cql-containing') {
			const containingClause = emitElementClause(wrapper);
			if (containingClause) cql = cql ? `${containingClause} containing (${cql})` : containingClause;
		}
	}

	const within = wrappers
		.filter((wrapper): wrapper is CqlWithinWrapper => wrapper.type === 'cql-within')
		.map(emitElementClause)
		.filter(isNonNull)
		.join(' overlap ');
	if (within) cql = cql ? `(${cql}) within ${within}` : within;
	return cql;
}

function emitElementClause(wrapper: CqlWrapperWithAttributes): string | null {
	if (!wrapper.element) return null;
	const emittedAttributes = Object.entries(wrapper.attributes)
		.map(([name, constraint]) => emitWithinAttributeExpression(name, constraint))
		.filter(isNonNull)
		.join(' ');
	return `<${wrapper.element}${emittedAttributes ? ` ${emittedAttributes}` : ''}/>`;
}

function emitWithinAttributeExpression(name: string, attribute: WrapperAttribute): string | null {
	if (isBooleanNode<PredicateValueNode>(attribute)) {
		const operator = attribute.type === 'and' ? ' & ' : ' | ';
		const clauses = attribute.children.map(child => emitWithinAttributeExpression(name, child)).filter(isNonNull);
		if (!clauses.length) return null;
		if (clauses.length === 1) return clauses[0];
		return `(${clauses.join(operator)})`;
	}
	if (attribute.valueType === 'range') return `${name}=in[${attribute.low},${attribute.high}]`;
	const value = predicateValueToRegex(attribute);
	return value ? `${name}="${value.replace(/"/g, '\\"')}"` : null;
}

function predicateValueToRegex(value: PredicateTextNode): string {
	switch (value.valueType) {
		case 'literal':
			return escapeRegex(value.value);
		case 'wildcard':
			return escapeRegex(value.value, { escapePipes: false, escapeWildcards: false, escapeQuotes: true });
		case 'regex':
			return value.value;
	}
}

function emitRequiredCql(pattern: CqlPatternNode): string {
	if (isCqlAnnotation(pattern)) return `[${emitAnnotationExpression(pattern)}]`;
	if (isBooleanNode<CqlPatternNode>(pattern)) {
		const operator = pattern.type === 'and' ? ' & ' : ' | ';
		return `(${pattern.children.map(emitRequiredCql).join(operator)})`;
	}

	switch (pattern.type) {
		case 'cql-raw':
			return pattern.cql;
		case 'cql-any-token':
			return '[]';
		case 'cql-repeat':
			return `${emitRequiredCql(pattern.child)}${emitRepeat(pattern)}`;
		case 'cql-xml-tag':
			return pattern.closing ? `</${pattern.name}>` : `<${pattern.name}>`;
		case 'cql-sequence':
			return pattern.children.map(emitRequiredCql).join(' ');
		case 'cql-parallel': {
			const source = emitParallelPart(pattern.source!);
			if (!pattern.targets.length) return source;
			const targetRelations = pattern.targets.map(target => `=${target.relationType ?? ''}=>${getParallelFieldParts(target.fieldId).version}? ${emitParallelPart(target.pattern!)}`);
			return `${source} ${targetRelations.join(' ; ')}`;
		}
		case 'cql-within':
		case 'cql-containing':
			return '';
	}
}

/** Group one emitted parallel branch as required by BlackLab's relation syntax. */
function emitParallelPart(pattern: CqlPatternNode): string {
	return parenQueryPartParallel(emitRequiredCql(pattern));
}

function emitRequiredFilter(filter: LuceneNode): string {
	if (isBooleanNode<LuceneLeaf>(filter)) {
		const operator = filter.type === 'and' ? ' AND ' : ' OR ';
		return `(${filter.children.map(emitRequiredFilter).join(operator)})`;
	}
	if (filter.valueType === 'range') return `${filter.field}:[${filter.low} TO ${filter.high}]`;
	return `${filter.field}:(${emitLucenePredicateValue(filter)})`;
}

function emitRepeat(pattern: Extract<CqlPatternNode, { type: 'cql-repeat' }>): string {
	const min = Number.isNaN(pattern.minRepeats) ? 1 : pattern.minRepeats;
	const max = Number.isNaN(pattern.maxRepeats) ? 1 : pattern.maxRepeats;
	let range = '';
	if (min === max) {
		range = min === 1 ? '' : `{${min}}`;
	} else {
		range = `{${Number.isNaN(pattern.minRepeats) ? '' : min},${Number.isNaN(pattern.maxRepeats) ? '' : max}}`;
	}
	return `${range}${pattern.optional && min !== 0 ? '?' : ''}`;
}

function emitAnnotationExpression(expression: CqlAnnotationNode, parentOperator?: BooleanType): string {
	if (!isBooleanNode<CqlAnnotationLeaf>(expression)) {
		const literalFlag = expression.valueType === 'literal' ? 'l' : '';
		return `${expression.annotation}${expression.operator ?? '='}${literalFlag}"${annotationSensitivityFlag(expression)}${predicateValueToRegex(expression)}"`;
	}

	const operator = expression.type === 'and' ? ' & ' : ' | ';
	const compiled = expression.children.map(child => emitAnnotationExpression(child, expression.type)).join(operator);
	return parentOperator && parentOperator !== expression.type ? `(${compiled})` : compiled;
}

function annotationSensitivityFlag(predicate: Pick<CqlAnnotationLeaf, 'caseSensitive' | 'diacriticsSensitive'>): string {
	if (predicate.caseSensitive === true && predicate.diacriticsSensitive === false) return '(?c)';
	if (predicate.caseSensitive === false && predicate.diacriticsSensitive === true) return '(?d)';
	if (predicate.caseSensitive === true) return '(?-i)';
	if (predicate.caseSensitive === false || predicate.diacriticsSensitive === false) return '(?i)';
	if (predicate.diacriticsSensitive === true) return '(?d)';
	return '';
}

function emitLucenePredicateValue(value: PredicateTextNode): string {
	return escapeLucene(value.value, {
		escapeWildcards: value.valueType !== 'wildcard',
		escapeRegex: value.valueType !== 'regex',
	});
}

function isNonNull<T>(value: T | null | undefined): value is T {
	return value != null;
}
