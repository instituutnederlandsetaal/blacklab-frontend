import type {
	CompilableQuery,
	CompiledFormState,
	QueryContribution,
	QueryFilterNode,
	QueryPatternNode,
	QueryTokenClauseNode,
	QueryWrapper,
	SummaryEntry,
} from '@/features/form/model/types/form-query';
import type { QueryCombineMode } from '@/features/form/model/types/form-shape';

const EMPTY_PROJECTION = createQueryArtifact();

export function createQueryArtifact(): CompilableQuery {
	return {
		pattern: null,
		filter: null,
		wrappers: [],
		searchField: null,
		// resultPreset: {},
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

export function combineQueryContributions(contributions: QueryContribution[], combine: QueryCombineMode = 'allOf'): QueryContribution {
	const nonEmpty = contributions.filter(contribution => hasContribution(contribution));
	return createQueryContribution(
		combineQueries(
			nonEmpty.map(contribution => contribution.query),
			combine,
		),
		nonEmpty.flatMap(contribution => contribution.summaries),
	);
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

export function tokenPattern(clauses: QueryTokenClauseNode[]): QueryPatternNode | null {
	const activeClauses = clauses.filter(clause => clause.value.trim());
	return activeClauses.length ? { type: 'token', clauses: activeClauses } : null;
}

export function rawPattern(cql: string | null | undefined): QueryPatternNode | null {
	const value = cql?.trim();
	return value ? { type: 'raw', cql: value } : null;
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
				.map(([key, value]) => (typeof value === 'string' && value.trim() ? `${key}="${escapeCql(value)}"` : null))
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
			const clauses = pattern.clauses.map(compileTokenClause).filter(isNonNull);
			return clauses.length ? `[${clauses.join(' & ')}]` : null;
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

function compileTokenClause(clause: QueryTokenClauseNode): string | null {
	const value = clause.value.trim();
	if (!value) return null;
	const operator = clause.type === 'regex' ? '=' : '=';
	const caseFlag = clause.caseSensitive ? '' : '(?i)';
	return `${clause.annotationId}${operator}"${caseFlag}${escapeCql(value)}"`;
}

function combinePatterns(patterns: QueryPatternNode[], combine: QueryCombineMode): QueryPatternNode | null {
	if (!patterns.length) return null;
	if (patterns.length === 1) return patterns[0];
	if (combine === 'sequence') return { type: 'sequence', children: patterns };
	return { type: 'boolean', operator: combine === 'anyOf' ? 'or' : 'and', children: patterns };
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

function escapeCql(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeLucene(value: string): string {
	return value.match(/\s/) ? `"${value.replace(/"/g, '\\"')}"` : value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');
}

function isNonNull<T>(value: T | null | undefined): value is T {
	return value != null;
}

export { EMPTY_PROJECTION };
