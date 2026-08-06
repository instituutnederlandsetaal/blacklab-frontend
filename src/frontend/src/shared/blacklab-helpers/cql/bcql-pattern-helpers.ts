/** Parenthesize part of a BCQL query if it's not already */
function parenQueryPart(query: string, exceptions: string[] = []) {
	query = query.trim();
	if (query.match(/^\(.+\)$/) || query.match(/^\[[^\]]*\]$/) || exceptions.includes(query)) {
		return query;
	}
	return `(${query})`;
}

export function parenQueryPartParallel(query: string) {
	const parenExceptions = ['[]*', '_'];
	return parenQueryPart(query === '[]*' ? '_' : query, parenExceptions);
}

/** Remove parentheses from a BCQL query part if it's parenthesized and doesn't
 *  contain nested parens.
 */
export function unparenQueryPart(query?: string) {
	if (query) {
		query = query.trim();
		while (query.match(/^\([^()]*\)$/)) {
			query = query.substring(1, query.length - 1).trim();
		}
	}
	return query;
}

export function applyWithinClauses(query: string, withinClauses: Record<string, Record<string, any>>) {
	const overlapClauses = Object.entries(withinClauses)
		.map(([elName, attributes]) => {
			const attr = attributes
				? Object.entries(attributes)
						.filter(([k, v]) => !!v)
						.map(([k, v]) => {
							if (typeof v === 'string') {
								// Regex query
								return ` ${k}="${v.replace(/"/g, '\\"')}"`;
							} else if (v.low || v.high) {
								// Range query
								return ` ${k}=in[${v.low || 0},${v.high || 9999}]`;
							} else return '';
						})
						.join('')
				: '';
			return `<${elName}${attr}/>`;
		})
		.join(' overlap ');
	if (query.length > 0 && overlapClauses.length > 0) return `(${query}) within ${overlapClauses}`;
	return query.length > 0 ? query : overlapClauses;
}
