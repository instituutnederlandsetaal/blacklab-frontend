type Exclusion = { annotationId: string; values: readonly string[] };

export function serializeExclusionClause(exclusions: readonly Exclusion[] | null | undefined, prefix: string): string {
	const clauses = exclusions?.filter(e => e.annotationId && e.values.length > 0).map(e => `${e.annotationId}!="${e.values.join('|')}"`) ?? [];
	return clauses.length ? `${prefix}${clauses.join(' & ')}` : '';
}
