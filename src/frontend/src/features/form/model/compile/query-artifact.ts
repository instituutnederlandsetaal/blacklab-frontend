import type {
	CompilableQuery,
	CompiledFormState,
	QueryContribution,
	QueryFilterNode,
	QueryTokenConditionNode,
	QueryPatternNode,
	QueryTokenClauseNode,
	QueryWrapper,
	SummaryEntry,
} from '@/features/form/model/types/form-query';
import type { QueryCombineMode } from '@/features/form/model/types/form-shape';

import { escapeRegex } from '@/shared/utils/string-utils';

const EMPTY_PROJECTION = createQueryArtifact();

export function createQueryArtifact(): CompilableQuery {
	return {
		pattern: null,
		filter: null,
		wrappers: [],
		searchField: null,
	};
}

export function artifactFromPattern(pattern: QueryPatternNode | null): CompilableQuery {
	return {
		...createQueryArtifact(),
		pattern,
	};
}

export function artifactFromFilter(filter: QueryFilterNode | null): CompilableQuery {
	return {
		...createQueryArtifact(),
		filter,
	};
}
export function createQueryContribution(query: CompilableQuery = createQueryArtifact(), summaries: SummaryEntry[] = []): QueryContribution {
	return {
		query,
		summaries,
	};
}

export function createCompiledQueryProjections(artifact: CompilableQuery): CompiledFormState {
	return {
		cql: compilePatternWithWrappers(artifact.pattern, artifact.wrappers),
		filter: compileFilter(artifact.filter),
		searchField: artifact.searchField,
		// resultPreset: artifact.resultPreset,
		// summaries: artifact.summaries,
	};
}

export function combineQueries(artifacts: CompilableQuery[], combine: QueryCombineMode = 'allOf'): CompilableQuery {
	const nonEmpty = artifacts.filter(artifact => hasQueryContributions(artifact));
	const merged = createQueryArtifact();

	merged.pattern = combinePatterns(nonEmpty.map(artifact => artifact.pattern).filter(isNonNull), combine);
	merged.filter = combineFilters(nonEmpty.map(artifact => artifact.filter).filter(isNonNull), combine === 'anyOf' ? 'or' : 'and');
	merged.wrappers = nonEmpty.flatMap(artifact => artifact.wrappers);
	merged.searchField = nonEmpty.find(artifact => artifact.searchField)?.searchField ?? null;
	// merged.resultPreset = Object.assign({}, ...nonEmpty.map(artifact => artifact.resultPreset)) as Partial<ResultPreset>;

	return merged;
}

export function combineQueryContributions(combine: QueryCombineMode = 'allOf', ...contributions: QueryContribution[]): QueryContribution {
	const nonEmpty = contributions.filter(contribution => hasContribution(contribution));
	return createQueryContribution(
		combineQueries(
			nonEmpty.map(contribution => contribution.query),
			combine,
		),
		nonEmpty.flatMap(contribution => contribution.summaries),
	);
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

export function withSummary(query: CompilableQuery, entry: SummaryEntry | null): QueryContribution {
	return createQueryContribution(query, entry ? [entry] : []);
}

export function withWrapper(artifact: CompilableQuery, wrapper: QueryWrapper | null): CompilableQuery {
	if (!wrapper) return artifact;
	return {
		...artifact,
		wrappers: [...artifact.wrappers, wrapper],
	};
}

export function withSearchField(artifact: CompilableQuery, searchField: string | null): CompilableQuery {
	return {
		...artifact,
		searchField,
	};
}

function compilePatternWithWrappers(pattern: QueryPatternNode | null, wrappers: QueryWrapper[]): string | null {
	let cql = compilePattern(pattern);
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

function compilePattern(pattern: QueryPatternNode | null): string | null {
	if (!pattern) return null;
	switch (pattern.type) {
		case 'raw':
			return pattern.cql.trim() || null;
		case 'token': {
			const condition = compileTokenCondition(normalizeTokenCondition(pattern));
			return condition ? `[${condition}]` : null;
		}
		case 'sequence': {
			const children = pattern.children.map(compilePattern).filter(isNonNull);
			return children.length ? children.join(' ') : null;
		}
		case 'boolean': {
			const children = pattern.children.map(compilePattern).filter(isNonNull);
			if (!children.length) return null;
			if (children.length === 1) return children[0];
			const operator = pattern.operator === 'and' ? ' & ' : ' | ';
			return `(${children.join(operator)})`;
		}
		case 'parallel': {
			const source = compilePattern(pattern.source);
			const targets = pattern.targets.map(target => compilePattern(target.pattern)).filter(isNonNull);
			return [source, ...targets].filter(isNonNull).join(' :: ') || null;
		}
	}
}

function compileFilter(filter: QueryFilterNode | null): string | null {
	if (!filter) return null;
	switch (filter.type) {
		case 'raw':
			return filter.lucene.trim() || null;
		case 'term':
			return filter.values.length ? `${filter.field}:(${filter.values.map(value => escapeLucene(value)).join(' ')})` : null;
		case 'range':
			return `${filter.field}:[${filter.low || '*'} TO ${filter.high || '*'}]`;
		case 'boolean': {
			const children = filter.children.map(compileFilter).filter(isNonNull);
			if (!children.length) return null;
			if (children.length === 1) return children[0];
			const operator = filter.operator === 'and' ? ' AND ' : ' OR ';
			return `(${children.join(operator)})`;
		}
	}
}

function normalizeTokenCondition(token: Extract<QueryPatternNode, { type: 'token' }>): QueryTokenConditionNode {
	return simplifyTokenCondition({
		type: 'boolean',
		operator: token.operator ?? 'and',
		children: token.clauses,
	});
}

function compileTokenCondition(condition: QueryTokenConditionNode, parentOperator?: 'and' | 'or'): string | null {
	if (!isTokenBooleanCondition(condition)) return compileTokenClause(condition);

	const children = condition.children.map(child => compileTokenCondition(child, condition.operator)).filter(isNonNull);
	if (!children.length) return null;
	if (children.length === 1) return children[0];

	const operator = condition.operator === 'and' ? ' & ' : ' | ';
	const compiled = children.join(operator);
	return parentOperator && parentOperator !== condition.operator ? `(${compiled})` : compiled;
}

function compileTokenClause(clause: QueryTokenClauseNode): string | null {
	const value = clause.value.trim();
	if (!value) return null;
	const literalFlag = clause.type === 'equals' ? 'l' : '';
	const caseFlag = clause.caseSensitive ? '' : '(?i)';

	const escapedValue =
		clause.type === 'regex'
			? clause.value
			: clause.type === 'wildcard'
				? escapeRegex(clause.value, { escapePipes: false, escapeWildcards: false, escapeQuotes: true })
				: clause.type === 'equals'
					? escapeRegex(clause.value)
					: clause.value; // Should not happen, but just return the raw value if an unknown type is encountered

	return `${clause.annotationId}=${literalFlag}"${caseFlag}${escapedValue}"`;
}

function combinePatterns(patterns: QueryPatternNode[], combine: QueryCombineMode): QueryPatternNode | null {
	if (!patterns.length) return null;
	if (patterns.length === 1) return patterns[0];
	if (combine === 'sequence') return { type: 'sequence', children: patterns };
	if (combine === 'allOf') {
		const folded = foldTokenSequences(patterns, 'and');
		if (folded) return folded;
	}
	return simplifyPatternBoolean({
		type: 'boolean',
		operator: combine === 'anyOf' ? 'or' : 'and',
		children: patterns,
	});
}

function combineFilters(filters: QueryFilterNode[], operator: 'and' | 'or'): QueryFilterNode | null {
	if (!filters.length) return null;
	if (filters.length === 1) return filters[0];
	return { type: 'boolean', operator, children: filters };
}

function hasContribution(contribution: QueryContribution): boolean {
	return hasQueryContributions(contribution.query) || contribution.summaries.length > 0;
}

function hasQueryContributions(artifact: CompilableQuery): boolean {
	return !!(artifact.pattern || artifact.filter || artifact.wrappers.length || artifact.searchField);
}

function foldTokenSequences(patterns: QueryPatternNode[], operator: 'and' | 'or'): QueryPatternNode | null {
	const sequences = patterns.map(asTokenSequence);
	if (sequences.some(sequence => !sequence)) return null;

	const maxLength = Math.max(...sequences.map(sequence => sequence?.length ?? 0));
	const children: QueryPatternNode[] = [];
	for (let index = 0; index < maxLength; index += 1) {
		const tokens = sequences.map(sequence => sequence?.[index]).filter(isNonNull);
		if (tokens.length) children.push(combineTokens(tokens, operator));
	}

	if (!children.length) return null;
	return children.length === 1 ? children[0] : { type: 'sequence', children };
}

function asTokenSequence(pattern: QueryPatternNode): Extract<QueryPatternNode, { type: 'token' }>[] | null {
	if (pattern.type === 'token') return [pattern];
	if (pattern.type === 'sequence' && pattern.children.every(child => child.type === 'token')) {
		return pattern.children as Extract<QueryPatternNode, { type: 'token' }>[];
	}
	return null;
}

function combineTokens(tokens: Extract<QueryPatternNode, { type: 'token' }>[], operator: 'and' | 'or'): QueryPatternNode {
	return {
		type: 'token',
		operator,
		clauses: tokens.map(token => normalizeTokenCondition(token)),
	};
}

function simplifyPatternBoolean(pattern: Extract<QueryPatternNode, { type: 'boolean' }>): QueryPatternNode {
	const children = pattern.children.flatMap(child => (child.type === 'boolean' && child.operator === pattern.operator ? child.children : [child]));
	if (children.length === 1) return children[0];
	return { ...pattern, children };
}

function simplifyTokenCondition(condition: QueryTokenConditionNode): QueryTokenConditionNode {
	if (!isTokenBooleanCondition(condition)) return condition;

	const children = condition.children.map(simplifyTokenCondition).flatMap(child => (isTokenBooleanCondition(child) && child.operator === condition.operator ? child.children : [child]));

	if (children.length === 1) return children[0];
	return { ...condition, children };
}

function isTokenBooleanCondition(condition: QueryTokenConditionNode): condition is Extract<QueryTokenConditionNode, { type: 'boolean' }> {
	return condition.type === 'boolean';
}

function escapeLucene(value: string): string {
	return value.match(/\s/) ? `"${value.replace(/"/g, '\\"')}"` : value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');
}

function isNonNull<T>(value: T | null | undefined): value is T {
	return value != null;
}

export { EMPTY_PROJECTION };
