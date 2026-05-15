/**
 * We need to generate filter IDs for spans, which should never collide with filters for builtin metadata fields of the corpus
 * (which always have a filter with that same ID)
 * To that end, we always combine the spans ("inlineTags") with a fixed prefix,
 * This also happens during e.g. query parsing (for blacklab patterns like `<speech person="Smith">`)
 * Will be parsed (roughly) into a filter mapping of { "span:speech:person": "Smith" }
 */
const SPAN_FILTER_PREFIX = 'span';

/** Separator for span filter id parts */
const SPAN_FILTER_SEPARATOR = ':';

/** ID of span filter, given its element and attribute names. */
export function spanFilterId(elName: string, attributeName: string): string {
	return [SPAN_FILTER_PREFIX, elName, attributeName].join(SPAN_FILTER_SEPARATOR);
}

/** Get element name and attribute name from a span filter id. */
export function elementAndAttributeNameFromFilterId(filterId: string): [string, string] {
	const filterIdParts = filterId.split(SPAN_FILTER_SEPARATOR);
	if (filterIdParts.length !== 3 || filterIdParts[0] !== SPAN_FILTER_PREFIX) {
		throw new Error(`Not a valid span filter ID: ${filterId}`);
	}
	const elName = filterIdParts[1];
	const attrName = filterIdParts[2];
	return [elName, attrName];
}
