export const PARALLEL_FIELD_SEPARATOR = '__';

/**
 * Given a parallel field name, return the prefix and version parts separately.
 *
 * For example, for field name "contents__en", will return prefix "contents" and
 * version "en".
 *
 * For a non-parallel field name, the version part will be an empty string.
 *
 * @param fieldName parallel field name
 * @returns an object containing the prefix and version.
 */
export function getParallelFieldParts(fieldName: string) {
	const parts = fieldName.split(PARALLEL_FIELD_SEPARATOR, 2);
	if (parts.length === 1) {
		// non-parallel field; return empty string as version
		parts.push('');
	}
	return {
		/** The base field, e.g. "contents" */
		prefix: parts[0],
		/** The suffix, e.g. "en" or "nl". Empty string when the field is not parallel. */
		version: parts[1],
	};
}

/** Get the full name of a parallel annotatedField, consisting of the base name/prefix and the version (e.g. "en", "nl") */
export function getParallelFieldName(prefix: string, version: string) {
	return `${prefix}${PARALLEL_FIELD_SEPARATOR}${version}`;
}

/** If passed only a version name: prefix it with the field name from defaultFieldName.
 *
 *  So:
 *  <code>ensureCompleteFieldName('en',          'contents__nl') === 'contents__en'</code>
 *  <code>ensureCompleteFieldName('contents_en', 'contents__nl') === 'contents__en'</code>
 */
export function ensureCompleteFieldName(fieldOrVersion: string, defaultFieldName: string) {
	if (isParallelField(fieldOrVersion)) {
		return fieldOrVersion;
	} else {
		// Prefix with the field name
		const parts = getParallelFieldParts(defaultFieldName);
		return getParallelFieldName(parts.prefix, fieldOrVersion);
	}
}

/** Does the specified field name denote a field in a parallel corpus? */
export function isParallelField(fieldName: string) {
	return fieldName.includes(PARALLEL_FIELD_SEPARATOR);
}
