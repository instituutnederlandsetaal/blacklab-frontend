import type { RestoreIssue } from '@/features/form/model/persistence';
import type { BlackLabParameter, BlackLabParameters } from '@/features/form/model/types/blacklab-params';

// #region boolean nodes

export type BooleanType = 'and' | 'or';
export type BooleanExpr<TLeaf> = { type: BooleanType; children: Array<BooleanExpr<TLeaf> | TLeaf> };
export function booleanExpr<TLeaf>(type: BooleanType, ...children: Array<BooleanExpr<TLeaf> | TLeaf>): BooleanExpr<TLeaf> {
	return { type, children };
}
export function isBooleanExpr<TLeaf>(node: any): node is BooleanExpr<TLeaf> {
	return node && typeof node === 'object' && 'type' in node && (node.type === 'and' || node.type === 'or') && Array.isArray(node.children);
}

export function simplifyBooleanExpr<TLeaf>(expr: BooleanExpr<TLeaf> | TLeaf): BooleanExpr<NonNullable<TLeaf>> | TLeaf;
export function simplifyBooleanExpr<TLeaf>(expr: BooleanExpr<TLeaf> | TLeaf, removeLeaf: (leaf: TLeaf) => boolean): BooleanExpr<TLeaf> | TLeaf | null;
export function simplifyBooleanExpr<TLeaf>(expr: BooleanExpr<TLeaf> | TLeaf, removeLeaf?: (leaf: TLeaf) => boolean): BooleanExpr<TLeaf> | TLeaf | null {
	if (!isBooleanExpr(expr)) {
		return removeLeaf?.(expr) ? null : expr;
	}

	const children = expr.children
		.map(c => simplifyBooleanExpr(c, removeLeaf as any))
		.filter(c => c != null)
		.flatMap(child => (isBooleanExpr(child) && child.type === expr.type ? child.children : [child]));
	if (!children.length) return null;
	if (children.length === 1) return children[0];
	return { ...expr, children };
}

// #endregion

// Shared value bearer for predicates in lucene and cql.
export type PredicateValueMatch = 'literal' | 'regex' | 'wildcard';
export type PredicateValue = {
	match: PredicateValueMatch;
	value: string;
};

// #region CQL query nodes

type TokenPredicateLeaf = PredicateValue & {
	type: 'predicate';
	annotation: string;
	caseSensitive?: boolean;
	operator?: '=' | '!=';
	caseMode?: 'default' | 'insensitive' | 'sensitive';
};
export type TokenPredicate = TokenPredicateLeaf | BooleanExpr<TokenPredicateLeaf>;

type CqlPatternLeaf =
	| { type: 'sequence'; children: CqlPattern[] }
	| { type: 'token'; predicate: TokenPredicate }
	| { type: 'any-token' }
	| { type: 'repeat'; child: CqlPattern; minRepeats: number; maxRepeats: number; optional: boolean }
	| { type: 'xml-tag'; name: string; closing?: boolean }
	| { type: 'parallel'; source: CqlPattern | null; targets: QueryParallelTargetPattern[] }
	| { type: 'raw'; cql: string };
export type CqlPattern = CqlPatternLeaf | BooleanExpr<CqlPatternLeaf>;

export function isCqlPattern(node: any): node is CqlPattern {
	if (!node || typeof node !== 'object' || !('type' in node)) return false;
	switch (node.type as CqlPattern['type']) {
		case 'and':
		case 'or':
			return Array.isArray(node.children) && node.children.every((child: any) => isCqlPattern(child));
		case 'sequence':
			return Array.isArray(node.children);
		case 'token':
			return 'predicate' in node && typeof node.predicate === 'object';
		case 'any-token':
			return true;
		case 'repeat':
			return 'child' in node && isCqlPattern(node.child);
		case 'xml-tag':
			return 'name' in node && typeof node.name === 'string';
		case 'parallel':
			return 'source' in node && (node.source === null || isCqlPattern(node.source)) && Array.isArray(node.targets) && node.targets.every(isQueryParallelTargetPattern);
		case 'raw':
			return 'cql' in node && typeof node.cql === 'string';
		default:
			return false;
	}
}

export type QueryParallelTargetPattern = {
	fieldId: string;
	relationType: string | null;
	pattern: CqlPattern | null;
};
export function isQueryParallelTargetPattern(node: any): node is QueryParallelTargetPattern {
	return (
		node &&
		typeof node === 'object' &&
		'fieldId' in node &&
		typeof node.fieldId === 'string' &&
		'relationType' in node &&
		(node.relationType === null || typeof node.relationType === 'string') &&
		'pattern' in node &&
		(node.pattern === null || isCqlPattern(node.pattern))
	);
}

// #endregion

// #region lucene filter nodes

export type QueryValue = { type: 'values'; values: PredicateValue[] } | { type: 'range'; low?: string; high?: string };

type FilterPredicateLeaf = (QueryValue & { field: string }) | { type: 'raw'; lucene: string };
export type QueryFilterNode = FilterPredicateLeaf | BooleanExpr<FilterPredicateLeaf>;

type QueryFilterNodeCandidate = CqlPattern | QueryFilterNode | Partial<QueryIR> | QueryWrapper[] | { query?: Partial<QueryIR>; summaries?: unknown } | null | undefined;

export function isQueryFilterNode(node: QueryFilterNodeCandidate): node is QueryFilterNode {
	if (!node || Array.isArray(node) || !('type' in node)) return false;
	switch (node.type) {
		case 'and':
		case 'or':
			return node.children.every(isQueryFilterNode);
		case 'values':
		case 'range':
			return true;
		case 'raw':
			return 'lucene' in node;
		default:
			return false;
	}
}

// #endregion

export type QueryWithinWrapper = {
	type: 'within';
	element: string;
	attributes: Record<string, QueryValue>;
};
export type QueryWrapper = QueryWithinWrapper | { type: 'containing'; element: string; attributes: Record<string, QueryValue> } | { type: 'with-spans' };

/** Result-view and request settings contributed by a submitted query. */
export type ResultPreset = {
	viewedResults?: string;
	groupBy?: string[];
	sort?: string | null;
	groupDisplayMode?: string | null;
	/** Value for BlackLab's `withspans` query parameter. */
	withSpans?: boolean;
};

export type QueryIR = {
	pattern: CqlPattern | null;
	filter: QueryFilterNode | null;
	wrappers: QueryWrapper[];
	searchfield: string | null;
	resultPreset?: ResultPreset;
};
export function isQueryIR(artifact: any): artifact is QueryIR {
	// NOTE: if artifact is an array, 'filter' in artifact is true,
	// but that doesn't mean it's a QueryIR, so we need to check that it's not an array first.
	return !Array.isArray(artifact) && artifact && typeof artifact === 'object' && 'pattern' in artifact && 'filter' in artifact && 'wrappers' in artifact && 'searchfield' in artifact;
}
export function isPartialQueryIR(artifact: any): artifact is Partial<QueryIR> {
	return (
		!Array.isArray(artifact) &&
		artifact &&
		typeof artifact === 'object' &&
		('pattern' in artifact || 'filter' in artifact || 'wrappers' in artifact || 'searchfield' in artifact || 'resultPreset' in artifact)
	);
}

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

export type QueryFragment = {
	query: QueryIR;
	summaries: SummaryEntry[];
};

export type CompiledBlackLabParameters = Record<keyof BlackLabParameters, string | null>;

export type CompiledQuery = CompiledBlackLabParameters & {
	resultPreset?: ResultPreset;
};

export type ScopedFormQuery = Record<string, string | string[]>;

export type CompiledFormState = CompiledQuery & {
	formId: string;
	encoded: ScopedFormQuery;
	issues?: RestoreIssue[];
};
export type CompiledFormStateWithSummaries = CompiledFormState & {
	summaries: SummaryEntry[];
};
