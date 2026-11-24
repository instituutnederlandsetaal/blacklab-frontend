const QUERY_ALIASES: Record<string, string[]> = { patt: ['query'], searchfield: ['searchField', 'field'] };

/** Repeated scalar parameters use the first nonempty string, matching form overrides. */
export function queryString(query: Record<string, unknown>, name: string): string | null {
	for (const key of [name, ...(QUERY_ALIASES[name] ?? [])]) {
		const value = [query[key]].flat().find(value => typeof value === 'string' && value !== '');
		if (typeof value === 'string') return value;
	}
	return null;
}

export function queryNumber(query: Record<string, unknown>, key: string): number | null {
	const value = queryString(query, key);
	return value !== null && Number.isFinite(Number(value)) ? Number(value) : null;
}
