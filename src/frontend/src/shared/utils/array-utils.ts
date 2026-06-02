export function* iter<T>(value: T | undefined | null | Array<T | undefined | null>) {
	if (value === undefined || value === null) return;
	if (Array.isArray(value)) {
		for (const v of value) {
			if (v !== undefined && v !== null) yield v;
		}
	} else {
		yield value;
	}
}
