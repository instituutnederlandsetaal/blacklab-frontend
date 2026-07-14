import type { RestoreIssue } from '@/features/form/model/persistence';
import type { BlackLabParameter, BlackLabParameters } from '@/features/form/model/types/blacklab-params';

export type TokenPredicateMatch = 'equals' | 'regex' | 'wildcard';

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

type TokenPredicateLeaf = {
	type: 'predicate';
	match: TokenPredicateMatch;
	annotation: string;
	value: string;
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

type QueryFilterNodeLeaf = { type: 'term'; field: string; values: string[] } | { type: 'range'; field: string; low?: string; high?: string } | { type: 'raw'; lucene: string };
export type QueryFilterNode = QueryFilterNodeLeaf | BooleanExpr<QueryFilterNodeLeaf>;

export function isQueryFilterNode(node: any): node is QueryFilterNode {
	if (!node || typeof node !== 'object' || !('type' in node)) return false;
	switch (node.type as QueryFilterNode['type']) {
		case 'and':
		case 'or':
			return 'children' in node && Array.isArray(node.children) && node.children.every(isQueryFilterNode);
		case 'term':
			return 'field' in node && typeof node.field === 'string' && 'values' in node && Array.isArray(node.values) && node.values.every((v: unknown) => typeof v === 'string');
		case 'range':
			return 'field' in node && typeof node.field === 'string' && ('low' in node ? typeof node.low === 'string' : true) && ('high' in node ? typeof node.high === 'string' : true);
		case 'raw':
			return 'lucene' in node && typeof node.lucene === 'string';
		default:
			return false;
	}
}

export type QueryWrapper =
	| {
			type: 'within' | 'containing';
			element: string;
			attributes: Record<string, QueryFilterNode | string>;
	  }
	| {
			type: 'with-spans';
			enabled: boolean;
	  };

export type QueryIR = {
	pattern: CqlPattern | null;
	filter: QueryFilterNode | null;
	wrappers: QueryWrapper[];
	searchfield: string | null;
};
export function isQueryIR(artifact: any): artifact is QueryIR {
	// NOTE: if artifact is an array, 'filter' in artifact is true,
	// but that doesn't mean it's a QueryIR, so we need to check that it's not an array first.
	return !Array.isArray(artifact) && artifact && typeof artifact === 'object' && 'pattern' in artifact && 'filter' in artifact && 'wrappers' in artifact && 'searchfield' in artifact;
}
export function isPartialQueryIR(artifact: any): artifact is Partial<QueryIR> {
	return !Array.isArray(artifact) && artifact && typeof artifact === 'object' && ('pattern' in artifact || 'filter' in artifact || 'wrappers' in artifact || 'searchfield' in artifact);
}

/**
 * A human-readable summary for a field in the form.
 * The ID maps to the field that generated it.
 * The Label is the localized name of the field,
 * the value is the human-readable value of the field.
 * This might need some more fine-tuning because we'd be putting filters, span-filters, and other things in the same collection.
 * That might make the summary UI confusing.
 */
export type SummaryEntry = {
	id: string;
	label: string;
	value: string;
	/** BlackLab parameters affected by the controller that produced this entry. */
	summaryType?: BlackLabParameter[];
	group?: string;
};

export type QueryFragment = {
	query: QueryIR;
	summaries: SummaryEntry[];
};

export type CompiledBlackLabParameters = Record<keyof BlackLabParameters, string | null>;

export type ScopedFormQuery = Record<string, string | string[]>;

export type CompiledFormState = CompiledBlackLabParameters & {
	formId: string;
	encoded: ScopedFormQuery;
	issues?: RestoreIssue[];
};
export type CompiledFormStateWithSummaries = CompiledFormState & {
	summaries: SummaryEntry[];
};
