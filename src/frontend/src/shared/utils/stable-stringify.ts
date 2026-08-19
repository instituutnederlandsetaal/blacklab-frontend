export function stableStringify(value: unknown): string {
	return stringify(value, [])!;
}

function stringify(value: unknown, seen: object[]): string | undefined {
	if (value && typeof value === 'object' && 'toJSON' in value && typeof value.toJSON === 'function') value = value.toJSON();
	if (value === undefined) return undefined;
	if (typeof value !== 'object' || value === null) return JSON.stringify(value);

	if (Array.isArray(value)) return `[${value.map(item => stringify(item, seen) ?? 'null').join(',')}]`;
	if (seen.includes(value)) throw new TypeError('Converting circular structure to JSON');

	seen.push(value);
	const properties = Object.keys(value)
		.sort()
		.flatMap(key => {
			const nestedValue = stringify((value as Record<string, unknown>)[key], seen);
			return nestedValue === undefined ? [] : `${JSON.stringify(key)}:${nestedValue}`;
		});
	seen.pop();
	return `{${properties.join(',')}}`;
}
