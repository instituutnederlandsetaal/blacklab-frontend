import {
	booleanExpr,
	type CompiledBlackLabParameters,
	isCqlPattern,
	isPartialQueryIR,
	isQueryFilterNode,
	simplifyBooleanExpr,
	type BooleanType,
	type CqlPattern,
	type QueryFilterNode,
	type QueryFragment,
	type QueryIR,
	type QueryWrapper,
	type SummaryEntry,
	type TokenPredicate as expr,
	type TokenPredicateMatch,
	type TokenPredicate,
} from '@/features/form/model/types/form-query';
import type { QueryCombineMode } from '@/features/form/model/types/form-shape';

import { parenQueryPartParallel } from '@/shared/blacklab-helpers/cql/bcql-pattern-helpers';
import { getParallelFieldParts } from '@/shared/blacklab-helpers/parallel-helper';
import { unwrapLenientArray } from '@/shared/utils/array-utils';
import { escapeRegex } from '@/shared/utils/string-utils';

const EMPTY_PROJECTION = queryIR();

// Builders
// =========================================================================================================================

export function queryIR(parts?: null | Partial<QueryIR>): QueryIR {
	return {
		pattern: parts?.pattern ?? null,
		filter: parts?.filter ?? null,
		wrappers: parts?.wrappers ?? [],
		searchfield: parts?.searchfield ?? null,
	};
}

type LenientSummaries = SummaryEntry | Array<SummaryEntry | null | undefined> | null | undefined;
type LenientQueryFragment = Omit<QueryFragment, 'summaries'> & {
	summaries?: LenientSummaries;
};

export function queryFragment(query?: null | Partial<QueryIR>, summary?: LenientSummaries): QueryFragment;
export function queryFragment(query?: null | CqlPattern, summary?: LenientSummaries): QueryFragment;
export function queryFragment(query?: null | QueryFilterNode, summary?: LenientSummaries): QueryFragment;
export function queryFragment(query?: null | Partial<LenientQueryFragment>, summary?: LenientSummaries): QueryFragment;
export function queryFragment(query?: null | QueryWrapper[], summary?: LenientSummaries): QueryFragment;
export function queryFragment(query?: null | Partial<QueryIR> | CqlPattern | QueryFilterNode | Partial<LenientQueryFragment> | QueryWrapper[], summary?: LenientSummaries): QueryFragment {
	if (isPartialQueryIR(query))
		return {
			query: queryIR(query),
			summaries: unwrapLenientArray(summary),
		};
	if (isCqlPattern(query)) return queryFragment(queryIR({ pattern: query }), summary);
	if (isQueryFilterNode(query)) return queryFragment(queryIR({ filter: query }), summary);
	if (Array.isArray(query)) return queryFragment(queryIR({ wrappers: query }), summary);
	return {
		query: queryIR(query?.query),
		summaries: unwrapLenientArray(query?.summaries),
	};
}

export function cqlRaw(cql: string | null | undefined): CqlPattern | null {
	const value = cql?.trim();
	return value ? { type: 'raw', cql: value } : null;
}

export function tokenPredicate(match: TokenPredicateMatch, annotation: string, value: string, caseSensitive?: boolean): expr {
	return {
		type: 'predicate',
		match,
		annotation,
		value,
		caseSensitive,
	};
}

export function token(predicate: expr | null): CqlPattern | null {
	return predicate ? { type: 'token', predicate } : null;
}

export function anyToken(): CqlPattern {
	return { type: 'any-token' };
}

export function repeat(child: CqlPattern | null, minRepeats: number, maxRepeats: number, optional = false): CqlPattern | null {
	if (!child) return null;
	return { type: 'repeat', child, minRepeats, maxRepeats, optional };
}

export function xmlTag(name: string, closing = false): CqlPattern | null {
	return name ? { type: 'xml-tag', name, closing } : null;
}

export function tokenSequence(children: Array<CqlPattern | null>): CqlPattern | null {
	const activeChildren = children.filter(isNonNull);
	return activeChildren.length ? { type: 'sequence', children: activeChildren } : null;
}

export function rawFilter(lucene: string | null | undefined): QueryFilterNode | null {
	const value = lucene?.trim();
	return value ? { type: 'raw', lucene: value } : null;
}

export function termFilter(field: string, values: string[]): QueryFilterNode | null {
	const activeValues = values.filter(value => value.trim());
	return activeValues.length ? { type: 'term', field, values: activeValues } : null;
}

export function rangeFilter(field: string, low?: string, high?: string): QueryFilterNode | null {
	return low || high ? { type: 'range', field, low, high } : null;
}

export function withSummary(query: QueryIR, entry: SummaryEntry | null): QueryFragment {
	return queryFragment({ query, summaries: entry ? [entry] : [] });
}

export function withWrapper(artifact: QueryIR, wrapper: QueryWrapper | null): QueryIR {
	if (!wrapper) return artifact;
	return queryIR({
		...artifact,
		wrappers: [...artifact.wrappers, wrapper],
	});
}

export function withSearchField(artifact: QueryIR, searchfield: string | null): QueryIR {
	return queryIR({
		...artifact,
		searchfield,
	});
}

// Pipeline
// =========================================================================================================================

export function compileQueryIR(artifact: QueryIR | QueryFragment): CompiledBlackLabParameters {
	const normalized = simplifyQueryIR('query' in artifact ? artifact.query : artifact);
	return {
		patt: emitCqlWithWrappers(normalized.pattern, normalized.wrappers),
		filter: emitFilter(normalized.filter),
		searchfield: normalized.searchfield,
	};
}

export function combineQueries(artifacts: QueryIR[], combine: QueryCombineMode = 'and'): QueryIR {
	const nonEmpty = artifacts.filter(artifact => hasQueryContributions(artifact));
	return queryIR({
		pattern: combineCql(nonEmpty.map(artifact => artifact.pattern).filter(isNonNull), combine),
		filter: combineFilters(nonEmpty.map(artifact => artifact.filter).filter(isNonNull), combine === 'or' ? 'or' : 'and'),
		wrappers: nonEmpty.flatMap(artifact => artifact.wrappers),
		searchfield: nonEmpty.find(artifact => artifact.searchfield)?.searchfield ?? null,
		// resultPreset = Object.assign({}, ...nonEmpty.map(artifact => artifact.resultPreset)) as Partial<ResultPreset>;
	});
}

export function combineQueryFragments(combine: QueryCombineMode = 'and', ...contributions: QueryFragment[]): QueryFragment {
	const nonEmpty = contributions.filter(contribution => hasContribution(contribution));
	return queryFragment({
		query: combineQueries(
			nonEmpty.map(contribution => contribution.query),
			combine,
		),
		summaries: nonEmpty.flatMap(c => c.summaries),
	});
}

// Simplify
// =========================================================================================================================

export function simplifyQueryIR(artifact: QueryIR): QueryIR {
	return queryIR({
		...artifact,
		pattern: simplifyCql(artifact.pattern),
		filter: simplifyFilter(artifact.filter),
	});
}

function simplifyCql(pattern: CqlPattern | null): CqlPattern | null {
	if (!pattern) return null;

	switch (pattern.type) {
		case 'raw':
			return cqlRaw(pattern.cql);
		case 'token':
			return token(simplifyTokenPredicate(pattern.predicate));
		case 'any-token':
			return pattern;
		case 'repeat': {
			const child = simplifyCql(pattern.child);
			return child ? { ...pattern, child } : null;
		}
		case 'xml-tag':
			return pattern.name ? pattern : null;
		case 'parallel': {
			const source = simplifyCql(pattern.source) ?? cqlRaw('_')!;
			return {
				...pattern,
				source,
				targets: pattern.targets.map(target => ({ ...target, pattern: simplifyCql(target.pattern) ?? cqlRaw('_')! })),
			};
		}
		case 'sequence': {
			const children = pattern.children
				.map(simplifyCql)
				.filter(isNonNull)
				.flatMap(child => (child.type === 'sequence' ? child.children : [child]));
			if (!children.length) return null;
			if (children.length === 1) return children[0];
			return { type: 'sequence', children };
		}
		case 'and':
		case 'or': {
			const simplified = simplifyBooleanExpr({
				...pattern,
				children: pattern.children.map(simplifyCql).filter(isNonNull),
			}) as CqlPattern | null;

			if (!simplified || (simplified.type !== 'and' && simplified.type !== 'or')) return simplified;
			const folded = foldTokenSequences(simplified.children, simplified.type);
			return folded ? simplifyCql(folded) : simplified;
		}
	}
}

function simplifyFilter(filter: QueryFilterNode | null): QueryFilterNode | null {
	if (!filter) return null;
	if (filter.type === 'raw') return rawFilter(filter.lucene);
	if (filter.type === 'term') return termFilter(filter.field, filter.values);
	if (filter.type === 'range') return rangeFilter(filter.field, filter.low, filter.high);

	return simplifyBooleanExpr({
		...filter,
		children: filter.children.map(simplifyFilter).filter(isNonNull),
	}) as QueryFilterNode | null;
}

function simplifyTokenPredicate(expr: expr): expr | null {
	if (expr.type === 'predicate') return expr.value.trim() ? expr : null;

	return simplifyBooleanExpr({
		...expr,
		children: expr.children.map(simplifyTokenPredicate).filter(isNonNull),
	}) as expr | null;
}

function combineCql(patterns: CqlPattern[], combine: QueryCombineMode): CqlPattern | null {
	if (!patterns.length) return null;
	if (patterns.length === 1) return patterns[0];
	return { type: combine, children: patterns };
}

function combineFilters(filters: QueryFilterNode[], operator: BooleanType): QueryFilterNode | null {
	if (!filters.length) return null;
	if (filters.length === 1) return filters[0];
	return { type: operator, children: filters };
}

function foldTokenSequences(patterns: CqlPattern[], operator: BooleanType): CqlPattern | null {
	const sequences = patterns.map(asTokenSequence);
	if (sequences.some(sequence => !sequence)) return null;

	const maxLength = Math.max(...sequences.map(sequence => sequence?.length ?? 0));
	const children: CqlPattern[] = [];
	for (let index = 0; index < maxLength; index += 1) {
		const tokens = sequences.map(sequence => sequence?.[index]).filter(isNonNull);
		const combined = combineTokens(tokens, operator);
		if (combined) children.push(combined);
	}

	if (!children.length) return null;
	return children.length === 1 ? children[0] : { type: 'sequence', children };
}

function asTokenSequence(pattern: CqlPattern): Extract<CqlPattern, { type: 'token' }>[] | null {
	if (pattern.type === 'token') return [pattern];
	if (pattern.type === 'sequence' && pattern.children.every(child => child.type === 'token')) {
		return pattern.children as Extract<CqlPattern, { type: 'token' }>[];
	}
	return null;
}

function combineTokens(tokens: Extract<CqlPattern, { type: 'token' }>[], operator: BooleanType): CqlPattern | null {
	return token(booleanExpr(operator, ...tokens.map(token => token.predicate)));
}

// Emit
// =========================================================================================================================

function emitCqlWithWrappers(pattern: CqlPattern | null, wrappers: QueryWrapper[]): string | null {
	let cql = emitCql(pattern);
	for (const wrapper of wrappers) {
		if (wrapper.type === 'within' && wrapper.element) {
			const attrs = Object.entries(wrapper.attributes)
				.map(([key, value]) => (typeof value === 'string' && value.trim() ? `${key}="${escapeRegex(value)}"` : null))
				.filter(isNonNull)
				.join(' ');
			const element = attrs ? `${wrapper.element} ${attrs}` : wrapper.element;
			cql = cql ? `<${element}/> containing ${cql}` : `<${element}/>`;
		}
	}
	return cql;
}

function emitCql(pattern: CqlPattern | null): string | null {
	return pattern ? emitRequiredCql(pattern) : null;
}

function emitRequiredCql(pattern: CqlPattern): string {
	switch (pattern.type) {
		case 'raw':
			return pattern.cql;
		case 'token': {
			const condition = emitTokenPredicate(pattern.predicate);
			return `[${condition}]`;
		}
		case 'any-token':
			return '[]';
		case 'repeat':
			return `${emitRequiredCql(pattern.child)}${emitRepeat(pattern)}`;
		case 'xml-tag':
			return pattern.closing ? `</${pattern.name}>` : `<${pattern.name}>`;
		case 'sequence': {
			return pattern.children.map(emitRequiredCql).join(' ');
		}
		case 'and':
		case 'or': {
			const operator = pattern.type === 'and' ? ' & ' : ' | ';
			return `(${pattern.children.map(emitRequiredCql).join(operator)})`;
		}
		case 'parallel': {
			const source = emitParallelPart(pattern.source!);
			if (!pattern.targets.length) return source;
			const targetRelations = pattern.targets.map(target => `=${target.relationType ?? ''}=>${getParallelFieldParts(target.fieldId).version}? ${emitParallelPart(target.pattern!)}`);
			return `${source} ${targetRelations.join(' ; ')}`;
		}
	}
}

function emitParallelPart(pattern: CqlPattern): string {
	return parenQueryPartParallel(emitRequiredCql(pattern));
}

function emitFilter(filter: QueryFilterNode | null): string | null {
	return filter ? emitRequiredFilter(filter) : null;
}

function emitRequiredFilter(filter: QueryFilterNode): string {
	switch (filter.type) {
		case 'raw':
			return filter.lucene;
		case 'term':
			return `${filter.field}:(${filter.values.map(value => escapeLucene(value)).join(' ')})`;
		case 'range':
			return `${filter.field}:[${filter.low || '*'} TO ${filter.high || '*'}]`;
		case 'or':
		case 'and': {
			const operator = filter.type === 'and' ? ' AND ' : ' OR ';
			return `(${filter.children.map(emitRequiredFilter).join(operator)})`;
		}
	}
}

function emitRepeat(pattern: Extract<CqlPattern, { type: 'repeat' }>): string {
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

function emitTokenPredicate(expr: TokenPredicate, parentOperator?: BooleanType): string {
	if (expr.type === 'predicate') {
		const literalFlag = expr.match === 'equals' ? 'l' : '';
		const caseFlag =
			expr.caseMode === 'sensitive'
				? '(?-i)'
				: expr.caseMode === 'insensitive'
					? '(?i)'
					: expr.caseMode === 'default'
						? ''
						: expr.caseSensitive
							? ''
							: '(?i)';

		const escapedValue =
			expr.match === 'regex'
				? expr.value
				: expr.match === 'wildcard'
					? escapeRegex(expr.value, { escapePipes: false, escapeWildcards: false, escapeQuotes: true })
					: expr.match === 'equals'
						? escapeRegex(expr.value)
						: expr.value; // Should not happen, but just return the raw value if an unknown match is encountered

		return `${expr.annotation}${expr.operator ?? '='}${literalFlag}"${caseFlag}${escapedValue}"`;
	}

	const operator = expr.type === 'and' ? ' & ' : ' | ';
	const compiled = expr.children.map(child => emitTokenPredicate(child, expr.type)).join(operator);
	return parentOperator && parentOperator !== expr.type ? `(${compiled})` : compiled;
}

function hasContribution(contribution: QueryFragment): boolean {
	return hasQueryContributions(contribution.query) || contribution.summaries.length > 0;
}

function hasQueryContributions(artifact: QueryIR): boolean {
	return !!(artifact.pattern || artifact.filter || artifact.wrappers.length || artifact.searchfield);
}

function escapeLucene(value: string): string {
	return value.match(/\s/) ? `"${value.replace(/"/g, '\\"')}"` : value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');
}

function isNonNull<T>(value: T | null | undefined): value is T {
	return value != null;
}

export { EMPTY_PROJECTION };
