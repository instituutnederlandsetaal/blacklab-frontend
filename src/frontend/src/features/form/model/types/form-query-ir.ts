import type { SummaryInput, SummaryType } from '@/features/form/model/types/form-output';
import type { BooleanType } from '@/features/form/model/types/form-primitives';

import { lenientIter, type LenientArray } from '@/shared/utils/array-utils';
import { filterOptions, isOptGroup, optionLabel, type Options } from '@/shared/utils/options';

// #region utility types
type Values = string | string[] | Record<string, boolean>;
function valuesToArray(values: Values): string[] {
	if (Array.isArray(values)) return values;
	if (typeof values === 'string') return [values];
	return Object.keys(values).filter(value => values[value]);
}

// #endregion

// #region boolean group node primitives

export type { BooleanType } from '@/features/form/model/types/form-primitives';
export type BooleanNode<TLeaf> = { type: BooleanType; children: Array<BooleanNode<TLeaf> | TLeaf> };

/** Construct a boolean node from a given set of children */
export function booleanNode<TLeaf>(type: BooleanType, children: Array<BooleanNode<TLeaf> | TLeaf>): BooleanNode<TLeaf> | TLeaf | null {
	if (!children.length) return null;
	if (children.length === 1) return children[0];
	return { type, children };
}

export function isBooleanNode<TNode>(node: any): node is BooleanNode<TNode> {
	return node && typeof node === 'object' && 'type' in node && (node.type === 'and' || node.type === 'or') && Array.isArray(node.children);
}

function flattenBooleanChildren<TNode>(operator: BooleanType, child: BooleanNode<TNode> | TNode): Array<BooleanNode<TNode> | TNode> {
	return isBooleanNode(child) && child.type === operator ? child.children.flatMap(grandchild => flattenBooleanChildren(operator, grandchild)) : [child];
}

export function simplifyBooleanNode<TLeaf>(
	expr: BooleanNode<TLeaf> | TLeaf,
	simplifyLeaf: (leaf: TLeaf) => TLeaf | null = leaf => leaf,
	primaryKey: (operator: BooleanType, leaf: TLeaf) => string | null = () => null,
	merge: (leaves: TLeaf[]) => TLeaf = leaves => leaves[0],
): BooleanNode<TLeaf> | TLeaf | null {
	if (!isBooleanNode(expr)) return simplifyLeaf(expr);
	const children = expr.children
		.flatMap(child => flattenBooleanChildren(expr.type, child))
		.map(child => simplifyBooleanNode(child, simplifyLeaf, primaryKey, merge))
		.filter((child): child is BooleanNode<TLeaf> | TLeaf => child != null)
		.flatMap(child => (isBooleanNode(child) && child.type === expr.type ? child.children : [child]));
	const buckets = new Map<string, TLeaf[]>();
	const unbucketed = children.filter(child => {
		if (isBooleanNode<TLeaf>(child)) return true;
		const key = primaryKey(expr.type, child);
		if (key == null) return true;
		const bucket = buckets.get(key);
		if (bucket) bucket.push(child);
		else buckets.set(key, [child]);
		return false;
	});

	return booleanNode(expr.type, [...unbucketed, ...Array.from(buckets.values(), leaves => (leaves.length === 1 ? leaves[0] : merge(leaves)))]);
}

// #endregion

// #region value-bearing node primitives

// Shared scalar values for predicates in Lucene and CQL. Targets are added by
// the encompassing predicate node, so value semantics remain language-neutral.
type TextValueType = 'literal' | 'regex' | 'wildcard';
export type PredicateTextNode = {
	valueType: TextValueType;
	value: string;
};
export const textPredicate = (valueType: TextValueType, value: string): PredicateTextNode => ({ valueType, value });
type PredicateRangeNode = {
	valueType: 'range';
	low: string;
	high: string;
};
type RangeInput = { low?: string | null; high?: string | null };
export type PredicateValueNode = PredicateTextNode | PredicateRangeNode;

// #endregion

// #region CQL annotation nodes

type CqlBaseNode<TName extends string> = {
	type: `cql-${TName}`;
};

type CqlAnnotationNodeCompare = {
	/** Defaults to '=' */
	operator?: '=' | '!=';

	// See https://blacklab.ivdnt.org/guide/query-language/token-based.html#case-and-diacritics-sensitivity
	// | Index-time setting       | no flag | `(?i)` | `(?s)` / `(?-i)` | `(?c)` | `(?d)` |
	// |--------------------------|---------|--------|------------------|--------|--------|
	// |                          | `i`     | `i`    | `i`              | `i`    | `i`    |
	// |              `sensitive` | `s`     | `s`    | `s`              | `s`    | `s`    |
	// |            `insensitive` | `i`     | `i`    | `i`              | `i`    | `i`    |
	// |  `sensitive_insensitive` | `i`     | `i`    | `s`              | `s`    | `s`    |
	// |                    `all` | `i`     | `i`    | `s`              | `di`   | `ci`   |

	/** Unspecified/defaulted if unset */
	caseSensitive?: boolean;
	/** Unspecified/defaulted if unset */
	diacriticsSensitive?: boolean;
};

// There's no range cql predicate, ranges are only supported in 'within' clauses, not in 'attribute' clauses.
type _CqlAnnotationNode = PredicateTextNode & CqlAnnotationNodeCompare & CqlBaseNode<'annotation'> & { annotation: string };
export type CqlAnnotationNode = _CqlAnnotationNode | BooleanNode<_CqlAnnotationNode>;

export const annotation = (annotation: string, valueType: TextValueType, values: Values, p?: Partial<CqlAnnotationNodeCompare>): CqlAnnotationNode | null =>
	booleanNode(
		'or',
		valuesToArray(values).map(value => ({ type: 'cql-annotation', annotation, valueType, value, ...p })),
	);
type CqlNodeAnyToken = CqlBaseNode<'any-token'>;
/** Match one unrestricted token. */
export const anyToken = (): CqlNodeAnyToken => ({ type: 'cql-any-token' });
type CqlNodeRepeat = CqlBaseNode<'repeat'> & { child: CqlNodeRepeatChildren; minRepeats: number; maxRepeats: number; optional: boolean };
/** Apply repetition settings to a token expression. */
export const repeat = (p: Omit<CqlNodeRepeat, 'type'>): CqlNodeRepeat => ({ type: 'cql-repeat', ...p });
type CqlNodeXmlTag = CqlBaseNode<'xml-tag'> & { name: string; closing?: boolean };
/** Create an opening or closing XML-tag expression. */
export const xmlTag = (name: string, closing = false): CqlNodeXmlTag => ({ type: 'cql-xml-tag', name, closing });
type CqlNodeParallelQuery = CqlBaseNode<'parallel'> & { source: CqlPatternNode | null; targets: CqlNodeParallelQueryTarget[] };
/** Join source and target patterns into a parallel query. */
export const parallelQuery = (source: CqlPatternNode | null, targets: CqlNodeParallelQueryTarget[]): CqlNodeParallelQuery => ({ type: 'cql-parallel', source, targets });
type CqlNodeParallelQueryTarget = CqlBaseNode<'target'> & { fieldId: string; relationType: string | null; pattern: CqlPatternNode | null };
export const parallelQueryTarget = (fieldId: string, relationType: string | null, pattern: CqlPatternNode | null): CqlNodeParallelQueryTarget => ({
	type: 'cql-target',
	fieldId,
	relationType,
	pattern,
});
type CqlNodeRawExpression = CqlBaseNode<'raw'> & { cql: string };
export const rawCql = (cql: string): CqlNodeRawExpression => ({ type: 'cql-raw', cql });
type CqlNodeSequence = CqlBaseNode<'sequence'> & { children: CqlPatternNode[] };
export const sequence = (children: LenientArray<CqlPatternNode>): CqlNodeSequence | null => {
	const activeChildren = Array.from(lenientIter(children));
	return activeChildren.length ? { type: 'cql-sequence', children: activeChildren } : null;
};
// Even though within clauses can exist almost anywhere in a true CQL query,
// we restrict them to wrapping the entire query in our IR, so that we can reason about them more easily.
// This closely mirrors what the search form allows.
// This code is meant to align with search form capabilities, to allow composing a query across multiple widgets, not necessarily to capture the full CQL spec.
type PredicateAttributeNode = PredicateValueNode | BooleanNode<PredicateValueNode>;
type CqlWrapperNodeWithin = CqlBaseNode<'within'> & { element: string; attributes: Record<string, PredicateAttributeNode> };
export const within = (element: string, attributes: Record<string, PredicateAttributeNode> = {}): CqlWrapperNodeWithin => ({
	type: 'cql-within',
	element,
	attributes,
});
/** Build one text-valued attribute constraint for a within wrapper. */
export const withinAttribute = (attribute: string, valueType: TextValueType, values: Values): Record<string, PredicateAttributeNode> => {
	const value = booleanNode<PredicateValueNode>(
		'or',
		valuesToArray(values).map(value => ({ valueType, value })),
	);
	return value ? { [attribute]: value } : {};
};
/** Build one range-valued attribute constraint for a within wrapper. */
export const withinAttributeRange = (attribute: string, v: { low: string; high: string }): Record<string, PredicateAttributeNode> => {
	return { [attribute]: { valueType: 'range', low: v.low, high: v.high } };
};
// Child node restriction helper type.
type CqlNodeRepeatChildren = CqlAnnotationNode | CqlNodeAnyToken | CqlNodeRawExpression;

export type CqlWrapperNode = CqlWrapperNodeWithin;
type CqlPatternLeafNode = _CqlAnnotationNode | CqlNodeAnyToken | CqlNodeRepeat | CqlNodeXmlTag | CqlNodeParallelQuery | CqlNodeRawExpression | CqlNodeSequence | CqlWrapperNode;
export type CqlPatternNode = CqlPatternLeafNode | BooleanNode<CqlPatternLeafNode>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPredicateValueNode(value: unknown): value is PredicateValueNode {
	if (!isRecord(value)) return false;
	if (value.valueType === 'range') return typeof value.low === 'string' && typeof value.high === 'string';
	return (value.valueType === 'literal' || value.valueType === 'regex' || value.valueType === 'wildcard') && typeof value.value === 'string';
}

function isPredicateAttributeNode(value: unknown): value is PredicateAttributeNode {
	if (isBooleanNode<PredicateValueNode>(value)) return value.children.length > 0 && value.children.every(isPredicateAttributeNode);
	return isPredicateValueNode(value);
}

export function isCqlPatternNode(node: unknown): node is CqlPatternNode {
	if (!isRecord(node)) return false;
	if (isBooleanNode<CqlPatternNode>(node)) return node.children.length > 0 && node.children.every(isCqlPatternNode);
	switch (node.type) {
		case 'cql-annotation': {
			const operator = node.operator;
			return typeof node.annotation === 'string' && isPredicateValueNode(node) && (operator === undefined || operator === '=' || operator === '!=');
		}
		case 'cql-any-token':
			return true;
		case 'cql-repeat':
			return isCqlPatternNode(node.child) && typeof node.minRepeats === 'number' && typeof node.maxRepeats === 'number' && typeof node.optional === 'boolean';
		case 'cql-xml-tag':
			return typeof node.name === 'string' && (node.closing === undefined || typeof node.closing === 'boolean');
		case 'cql-parallel':
			return (
				(node.source === null || isCqlPatternNode(node.source)) &&
				Array.isArray(node.targets) &&
				node.targets.every(
					target =>
						isRecord(target) &&
						target.type === 'cql-target' &&
						typeof target.fieldId === 'string' &&
						(target.relationType === null || typeof target.relationType === 'string') &&
						(target.pattern === null || isCqlPatternNode(target.pattern)),
				)
			);
		case 'cql-raw':
			return typeof node.cql === 'string';
		case 'cql-sequence':
			return Array.isArray(node.children) && node.children.length > 0 && node.children.every(isCqlPatternNode);
		case 'cql-within':
			return typeof node.element === 'string' && isRecord(node.attributes) && Object.values(node.attributes).every(isPredicateAttributeNode);
		default:
			return false;
	}
}

// #endregion

// #region Lucene filter nodes

// The lucene part of the query is pretty limited in scope at the moment
// Just singular clauses with various matching behavior, and boolean constructs of those clauses.

type _LuceneFieldNode = PredicateValueNode & { type: 'lucene-field' } & {
	field: string;
};

export type LuceneNode = _LuceneFieldNode | BooleanNode<_LuceneFieldNode>;
export const filter = (field: string, valueType: TextValueType, values: Values): LuceneNode | null =>
	booleanNode(
		'or',
		valuesToArray(values).map(value => ({ type: 'lucene-field', field, valueType, value })),
	);
export const filterRange = (field: string, low: string, high: string): LuceneNode | null => ({
	type: 'lucene-field',
	field,
	valueType: 'range',
	low,
	high,
});

export function isLuceneNode(node: unknown): node is LuceneNode {
	if (!isRecord(node)) return false;
	if (isBooleanNode<LuceneNode>(node)) return node.children.length > 0 && node.children.every(isLuceneNode);
	return node.type === 'lucene-field' && typeof node.field === 'string' && isPredicateValueNode(node);
}

// #endregion

// #region summaries

const re_whitespace = /\s/;
const summarize = (values: Values, options?: Options): string | null => {
	values = valuesToArray(values);
	if (options) {
		const { matched, unknown } = filterOptions(options, values);
		values = [...matched, ...unknown].flatMap(option => (isOptGroup(option) ? option.options : option)).map(optionLabel);
	}
	if (values.length > 1) return values.map(value => `"${value}"`).join(', ');
	if (values.length === 1) return values[0].match(re_whitespace) ? `"${values[0]}"` : values[0];
	return null;
};
const summarizeRange = (low?: string | null, high?: string | null): string | null => {
	if (low && high) return `${low} - ${high}`;
	if (low) return `≥ ${low}`;
	if (high) return `≤ ${high}`;
	return null;
};
export const summary = (
	label: string,
	values: Values | { low?: string | null; high?: string | null },
	summaryType?: readonly SummaryType[],
	group?: string,
	options?: Options,
): SummaryInput | null => {
	const { low, high } = values as RangeInput;
	const value = typeof low === 'string' || typeof high === 'string' ? summarizeRange(low, high) : summarize(values as Values, options);
	return value ? { label, value, summaryType, group } : null;
};

// #endregion summaries
