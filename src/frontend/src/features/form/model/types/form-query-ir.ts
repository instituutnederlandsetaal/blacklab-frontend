import type { RestoreIssue } from '@/features/form/model/persistence';
import type { BlackLabParameter, BlackLabParameters } from '@/features/form/model/types/blacklab-params';

import { unwrapLenientArray, type LenientArray } from '@/shared/utils/array-utils';
import { optionLabels, type Options } from '@/shared/utils/options';

// #region utility types
type Values = string | string[] | Record<string, boolean>;
function valuesToArray(values: Values): string[] {
	if (Array.isArray(values)) return values;
	if (typeof values === 'string') return [values];
	return Object.keys(values).filter(value => values[value]);
}

// #endregion

// #region boolean group node primitives

export type BooleanType = 'and' | 'or';
export type BooleanNode<TLeaf> = { type: BooleanType; children: Array<BooleanNode<TLeaf> | TLeaf> };

/** Construct a boolean node from a given set of children */
export function booleanNode<TLeaf>(type: BooleanType, children: Array<BooleanNode<TLeaf> | TLeaf>): BooleanNode<TLeaf> | TLeaf | null;
/** Construct a boolean node from a given list of children */
export function booleanNode<TLeaf>(type: BooleanType, ...children: Array<BooleanNode<TLeaf> | TLeaf>): BooleanNode<TLeaf> | TLeaf | null;
/** Construct a boolean node from a given set of values. Every value is turned into a leaf clause with the extra properties */
export function booleanNode<TLeaf>(type: BooleanType, values: Values, restValues: Omit<TLeaf, 'value'>): BooleanNode<TLeaf> | TLeaf | null;
/** Construct a boolean node from a given set of values and a node creation function. The function is given every value in succession and must return a leaf if the value is valid. */
export function booleanNode<TLeaf>(type: BooleanType, values: Values, createNode: (value: string) => TLeaf | null): BooleanNode<TLeaf> | TLeaf | null;
export function booleanNode<TLeaf>(type: BooleanType, arg1?: unknown, ...args: unknown[]): BooleanNode<TLeaf> | TLeaf | null {
	let children: Array<BooleanNode<TLeaf> | TLeaf>;
	if (args.length && isValues(arg1)) {
		const construct = args[0];
		const createNode: (value: string) => TLeaf | null =
			typeof construct === 'function' ? (construct as (value: string) => TLeaf | null) : (value: string): TLeaf => ({ value, ...(construct as object) }) as TLeaf;
		children = valuesToArray(arg1)
			.map(createNode)
			.filter((child): child is TLeaf => child != null);
	} else if (arg1 === undefined) {
		children = [];
	} else if (Array.isArray(arg1)) {
		children = arg1 as Array<BooleanNode<TLeaf> | TLeaf>;
	} else {
		children = [arg1 as BooleanNode<TLeaf> | TLeaf, ...(args as Array<BooleanNode<TLeaf> | TLeaf>)];
	}

	if (!children.length) return null;
	if (children.length === 1) return children[0];
	return { type, children };
}

function isValues(value: unknown): value is Values {
	if (typeof value === 'string') return true;
	if (Array.isArray(value)) return value.every(item => typeof item === 'string');
	return Boolean(value && typeof value === 'object' && Object.values(value).every(item => typeof item === 'boolean'));
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
	const merged: Array<BooleanNode<TLeaf> | TLeaf> = [];

	for (let index = 0; index < children.length;) {
		const child = children[index];
		if (isBooleanNode<TLeaf>(child)) {
			merged.push(child);
			index += 1;
			continue;
		}

		const key = primaryKey(expr.type, child);
		const run = [child];
		let nextIndex = index + 1;
		while (key != null && nextIndex < children.length) {
			const next = children[nextIndex];
			if (isBooleanNode<TLeaf>(next) || primaryKey(expr.type, next) !== key) break;
			run.push(next);
			nextIndex += 1;
		}
		merged.push(run.length === 1 ? child : merge(run));
		index = nextIndex;
	}

	return booleanNode(expr.type, merged);
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
export type PredicateRangeNode = {
	valueType: 'range';
	low?: string;
	high?: string;
};
type RangeInput = { low?: string | null; high?: string | null };
const isRangeInput = (value: unknown): value is RangeInput => {
	if (!value || typeof value !== 'object') return false;
	return ('low' in value && typeof value.low === 'string') || ('high' in value && typeof value.high === 'string');
};
export function rangePredicate(input: RangeInput): PredicateRangeNode;
export function rangePredicate(low?: string, high?: string): PredicateRangeNode;
export function rangePredicate(arg1?: unknown, arg2?: unknown): PredicateRangeNode {
	if (isRangeInput(arg1)) return { valueType: 'range', low: arg1.low || undefined, high: arg1.high || undefined };
	return { valueType: 'range', low: typeof arg1 === 'string' ? arg1 : undefined, high: typeof arg2 === 'string' ? arg2 : undefined };
}
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
	booleanNode<_CqlAnnotationNode>('or', values, { type: 'cql-annotation', annotation, valueType, ...p });
type CqlNodeAnyToken = CqlBaseNode<'any-token'>;
export const anyToken = (): CqlNodeAnyToken => ({ type: 'cql-any-token' });
type CqlNodeRepeat = CqlBaseNode<'repeat'> & { child: CqlNodeRepeatChildren; minRepeats: number; maxRepeats: number; optional: boolean };
export const repeat = (p: Omit<CqlNodeRepeat, 'type'>): CqlNodeRepeat => ({ type: 'cql-repeat', ...p });
type CqlNodeXmlTag = CqlBaseNode<'xml-tag'> & { name: string; closing?: boolean };
export const xmlTag = (name: string, closing = false): CqlNodeXmlTag => ({ type: 'cql-xml-tag', name, closing });
type CqlNodeParallelQuery = CqlBaseNode<'parallel'> & { source: CqlPatternNode | null; targets: CqlNodeParallelQueryTarget[] };
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
	const activeChildren = unwrapLenientArray(children);
	return activeChildren.length ? { type: 'cql-sequence', children: activeChildren } : null;
};
// Even though within and containing clauses can exist almost anywhere in a true CQL query,
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
export const withinAttribute = (attribute: string, valueType: TextValueType, values: Values): Record<string, PredicateAttributeNode> => {
	const value = booleanNode<PredicateValueNode>('or', values, { valueType });
	return value ? { [attribute]: value } : {};
};
export const withinAttributeRange = (attribute: string, v: { low?: string; high?: string }): Record<string, PredicateAttributeNode> => {
	return { [attribute]: rangePredicate(v.low, v.high) };
};
type CqlWrapperNodeContaining = CqlBaseNode<'containing'> & { element: string; attributes: Record<string, PredicateAttributeNode> };
type CqlWrapperNodeWithSpans = CqlBaseNode<'with-spans'>;

// Child node restriction helper type.
type CqlNodeRepeatChildren = CqlAnnotationNode | CqlNodeAnyToken | CqlNodeRawExpression;

export type CqlWrapperNode = CqlWrapperNodeWithin | CqlWrapperNodeContaining | CqlWrapperNodeWithSpans;
type CqlPatternLeafNode = _CqlAnnotationNode | CqlNodeAnyToken | CqlNodeRepeat | CqlNodeXmlTag | CqlNodeParallelQuery | CqlNodeRawExpression | CqlNodeSequence;
export type CqlPatternNode = CqlPatternLeafNode | BooleanNode<CqlPatternLeafNode>;

function isCqlPatternNode(node?: { type: string }): node is CqlPatternNode {
	if (isBooleanNode<{ type: string }>(node)) return node.children.every(isCqlPatternNode);
	return Boolean(node?.type.startsWith('cql-') && node.type !== 'cql-within' && node.type !== 'cql-containing' && node.type !== 'cql-with-spans' && node.type !== 'cql-target');
}

// #endregion

// #region Lucene filter nodes

// The lucene part of the query is pretty limited in scope at the moment
// Just singular clauses with various matching behavior, and boolean constructs of those clauses.

type _LuceneFieldNode = PredicateValueNode & { type: 'lucene-field' } & {
	field: string;
};

export type LuceneNode = _LuceneFieldNode | BooleanNode<_LuceneFieldNode>;
export const filter = (field: string, valueType: TextValueType, values: Values): LuceneNode | null => booleanNode<_LuceneFieldNode>('or', values, { type: 'lucene-field', valueType, field });
export const filterRange = (field: string, low?: string, high?: string): LuceneNode | null => ({
	type: 'lucene-field',
	field,
	valueType: 'range',
	low,
	high,
});

function isLuceneNode(node?: { type: string }): node is LuceneNode {
	return Boolean(node?.type.startsWith('lucene-') || (isBooleanNode<{ type: string }>(node) && node.children.every(isLuceneNode)));
}

// #endregion

// #region resultpresets

// Result presets are a way to capture "intent" of the form that was submitted.
// E.g. the n-gram form preloads a grouping when submitted,
// as you're usually interested in the counts rather than every occurrence of a text pattern individually.

/** Result-view and request settings contributed by a submitted query. */
export type ResultPreset = {
	viewedResults?: string;
	groupBy?: string[];
	sort?: string | null;
	groupDisplayMode?: string | null;
	/** Value for BlackLab's `withspans` query parameter. */
	withSpans?: true;
};
export const resultPreset = (parts?: null | Partial<ResultPreset>): ResultPreset => ({
	...(parts?.viewedResults !== undefined ? { viewedResults: parts.viewedResults } : {}),
	...(parts?.groupBy !== undefined ? { groupBy: [...parts.groupBy] } : {}),
	...(parts?.sort !== undefined ? { sort: parts.sort } : {}),
	...(parts?.groupDisplayMode !== undefined ? { groupDisplayMode: parts.groupDisplayMode } : {}),
	...(parts?.withSpans !== undefined ? { withSpans: parts.withSpans } : {}),
});

// #endregion

// #region query IR

export type QueryIR = {
	pattern: CqlPatternNode | null;
	filter: LuceneNode | null;
	wrappers: CqlWrapperNode[];
	searchfield: string | null;
	resultPreset?: ResultPreset;
	summaries: SummaryEntry[];
};

export type QueryIRInput = {
	pattern?: CqlPatternNode | null;
	filter?: LuceneNode | null;
	wrappers?: LenientArray<CqlWrapperNode>;
	searchfield?: string | null;
	resultPreset?: ResultPreset;
	summaries?: LenientArray<SummaryEntry>;
};

export const queryIR = (parts?: null | Partial<QueryIRInput>): QueryIR => ({
	pattern: parts?.pattern ?? null,
	filter: parts?.filter ?? null,
	wrappers: unwrapLenientArray(parts?.wrappers),
	searchfield: parts?.searchfield ?? null,
	resultPreset: parts?.resultPreset && resultPreset(parts.resultPreset), // keep undefined if not set, but copy the object if it is set
	summaries: unwrapLenientArray(parts?.summaries),
});
function isPartialQueryIR<T extends QueryIR | QueryIRInput>(v: unknown): v is Partial<T> {
	// NOTE: check for arrays, or 'filter' would be in the object (Array.filter), but not a valid QueryIR.
	return !Array.isArray(v) && v != null && typeof v === 'object' && ('pattern' in v || 'filter' in v || 'wrappers' in v || 'searchfield' in v || 'resultPreset' in v);
}

// #endregion

// #region summaries

/** Which of the output query parameters is affected by this controller */
export type SummaryType = BlackLabParameter;

/**
 * A human-readable summary for a field in the form.
 * The ID maps to the field that generated it.
 * The Label is the localized name of the field,
 * the value is the human-readable value of the field.
 * This might need some more fine-tuning because we'd be putting document filters, within-attribute controls, and other things in the same collection.
 * That might make the summary UI confusing.
 */
export type SummaryEntry = {
	label: string;
	value: string;
	/** BlackLab parameters represented by this summary. Defaults to those affected by its controller. */
	summaryType?: SummaryType[];
	group?: string;
};

const re_whitespace = /\s/;
const summarize = (values: Values, options?: Options): string | null => {
	values = valuesToArray(values);
	if (options) values = optionLabels(options, values);
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
export const summary = (label: string, values: Values | { low?: string | null; high?: string | null }, summaryType?: SummaryType[], group?: string, options?: Options): SummaryEntry | null => {
	const value = isRangeInput(values) ? summarizeRange(values.low, values.high) : summarize(values, options);
	return value ? { label, value, summaryType, group } : null;
};

// #endregion summaries

// #region query assembly

export function queryFragment<T extends Partial<QueryIRInput> | CqlPatternNode | CqlWrapperNode | CqlWrapperNode[] | LuceneNode = QueryIRInput>(
	query?: T | null,
	summary?: LenientArray<SummaryEntry>,
): QueryIR | null {
	const summaries = unwrapLenientArray(summary);

	// base case first - avoid recursive loops!
	if (!query) return summaries.length ? queryIR({ summaries }) : null;
	else if (isPartialQueryIR(query)) return queryIR({ ...query, summaries: unwrapLenientArray(query.summaries).concat(summaries) });
	else if (Array.isArray(query)) return queryIR({ wrappers: query, summaries });
	else if (query.type === 'cql-within' || query.type === 'cql-containing' || query.type === 'cql-with-spans') return queryIR({ wrappers: query, summaries });
	else if (isCqlPatternNode(query)) return queryIR({ pattern: query, summaries });
	else if (isLuceneNode(query)) return queryIR({ filter: query, summaries });
	else {
		throw new Error(`Invalid query fragment: ${JSON.stringify(query)}`);
	}
}

// #endregion

export type CompiledQuery = Record<keyof BlackLabParameters, string | null> & {
	resultPreset?: ResultPreset;
};

export type ScopedFormQuery = Record<string, string | string[]>;

export type CompiledFormStateWithSummaries = CompiledQuery & {
	formId: string;
	encoded: ScopedFormQuery;
	issues?: RestoreIssue[];
	summaries: SummaryEntry[];
};
