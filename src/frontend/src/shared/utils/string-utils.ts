const defaultRegexEscapeOptions = {
	/**
	 * In our inputs, wildcards are special characters that can be used to match any character or sequence of characters.
	 * Are wildcards supposed to be supported in the input? If so, set this to false.
	 *
	 * Defaults to true.
	 * If true, wildcards are escaped:
	 * - * is replaced with \*
	 * - ? is replaced with \?
	 * If false, wildcards are activated:
	 * - * is replaced with .*
	 * - ? is replaced with .
	 */
	escapeWildcards: true,
	/** Default to true. If true, escape | to \|. If false, leave alone. */
	escapePipes: true,
	/** Defaults to true. If true, escape " to \". If false, leave alone. */
	escapeQuotes: true,
};
export type RegexEscapeOptions = Partial<typeof defaultRegexEscapeOptions>;
/** Escape special characters in a string for use in a regular expression, the default escaping options are to escape wildcards, pipes, and quotes */
export function escapeRegex(value: string, settings: RegexEscapeOptions = {}) {
	settings = { ...defaultRegexEscapeOptions, ...settings };

	// NOTE: take special care for characters we might let through.
	// We want to be able to also let the user search for those characters verbatim.
	// In which case they will have to escape them using a backslash.
	// We must make sure that we do not double escape these already-present backslashes (but only when they're meaningful.)
	// There might be a better way to accomplish this, but for now we'll just replace them with a placeholder and replace them back afterwards.

	const specialEscapeSequences = [
		{ input: '\\|', output: '__PIPE__', active: !settings.escapePipes },
		{ input: '\\*', output: '__STAR__', active: !settings.escapeWildcards },
		{ input: '\\?', output: '__QUESTION__', active: !settings.escapeWildcards },
		{ input: '\\"', output: '__QUOTE__', active: !settings.escapeQuotes },
	];
	for (const { input, output, active } of specialEscapeSequences) {
		if (active) value = value.replaceAll(input, output);
	}

	const escapeBase = (s: string) => s.replace(/([\\^$#@&+.(){}[\]])/g, '\\$1');
	const escapeWildcards = (s: string) => s.replace(/([*?])/g, '\\$1');
	const activateWildcards = (s: string) => s.replace(/\*/g, '.*').replace(/\?/g, '.');
	const escapePipes = (s: string) => s.replace(/\|/g, '\\|');
	const escapeQuotes = (s: string) => s.replace(/"/g, '\\"');
	const identity = (s: string) => s;

	const operations = [escapeBase, settings.escapeWildcards ? escapeWildcards : activateWildcards, settings.escapePipes ? escapePipes : identity, settings.escapeQuotes ? escapeQuotes : identity];

	value = operations.reduce((acc, op) => op(acc), value);
	// Unescape the special escape sequences
	for (const { input, output, active } of specialEscapeSequences) {
		if (active) value = value.replaceAll(output, input);
	}
	return value;
}

export function unescapeRegex(value: string, settings: RegexEscapeOptions = {}) {
	settings = { ...defaultRegexEscapeOptions, ...settings };

	// NOTE: take special care for characters we might let through.
	// We want to be able to also let the user search for those characters verbatim.
	// In which case they will have to escape them using a backslash.
	// We must make sure that we do not remove these already-present backslashes (but only when they're meaningful.)
	// There might be a better way to accomplish this, but for now we'll just replace them with a placeholder and replace them back afterwards.
	const specialEscapeSequences = [
		{ input: '\\|', output: '__PIPE__', active: !settings.escapePipes },
		{ input: '\\*', output: '__STAR__', active: !settings.escapeWildcards },
		{ input: '\\?', output: '__QUESTION__', active: !settings.escapeWildcards },
		{ input: '\\"', output: '__QUOTE__', active: !settings.escapeQuotes },
	];
	for (const { input, output, active } of specialEscapeSequences) {
		if (active) value = value.replaceAll(input, output);
	}

	const unescapeBase = (s: string) => s.replace(/\\([\\^$#@&+.(){}[\]])/g, '$1');
	const unescapeWildcards = (s: string) => s.replace(/\\([*?])/g, '$1');
	const deactivateWildcards = (s: string) => s.replace(/\.\*/g, '*').replace(/\./g, '?');
	const unescapePipes = (s: string) => s.replace(/\\[|]/g, '|');
	const unescapeQuotes = (s: string) => s.replace(/\\"/g, '"');
	const identity = (s: string) => s;

	// in reverse order, otherwise the base unescape could produce something that looks like a wildcard
	const operations = [
		settings.escapeQuotes ? unescapeQuotes : identity,
		settings.escapePipes ? unescapePipes : identity,
		settings.escapeWildcards ? unescapeWildcards : deactivateWildcards,
		unescapeBase,
	];

	value = operations.reduce((acc, op) => op(acc), value);
	// Unescape the special escape sequences
	for (const { input, output, active } of specialEscapeSequences) {
		if (active) value = value.replaceAll(output, input);
	}
	return value;
}

/**
 * Escapes the lucene term. This is done by surrounding it by quotes, unless wildcards (* and ?) should be preserved,
 * in which case characters are escaped on an individual basis.
 * Preserving wildcards is only possible when the string does not contain whitespace, as that is the term delimited and cannot be escaped
 * except by surrounding the term with quotes, which implicitly escapes wildcards.
 *
 * The resultant string should NOT need to be be surrounded by quotes again.
 */
export function escapeLucene(original: string, preserveWildcards: boolean) {
	if (!preserveWildcards || original.match(/\s+/)) {
		return `"${original.replace(/(")/g, '\\$1')}"`;
	}
	return original.replace(/(\+|-|&&|\|\||!|\(|\)|{|}|\[|]|\^|"|~|:|\\|\/)/g, '\\$1');
}

/** Unescapes every lucene special character including double quotes, except wildcards */
export function unescapeLucene(original: string) {
	if (original.startsWith('"') && original.endsWith('"') && !original.endsWith('\\"')) {
		return original.substr(1, original.length - 2).replace(/\\(")/g, '$1');
	}

	return original.replace(/\\(\+|-|&&|\|\||!|\(|\)|{|}|\[|]|\^|"|~|:|\\|\/|\*|\?)/g, '$1');
}

type SplitString = {
	start: number;
	end: number;
	value: string;
	isQuoted: boolean;
};

/**
 * Split a search pattern string into its terms.
 * For example strings input in the "Simple Search" input.
 * This works by splitting the string on all whitespace (ignoring it), except where (a part of) the string is enclosed in double quotes (""), between which whitespace is preserved.
 * Double quotes and whitespace that has been used as separator is stripped from the value field of the returned structs.
 * Returned indices use half-open ranges: start is inclusive, end is exclusive (same convention as substring(start, end)).
 * Stripped quotes (not whitespace!) are however still reflected in the start and end properties. (meaning for a string that isQuoted, (end-start) === (value.length + 2))
 * This is because this function is also used to split out (and replace) the currently selected word/sequence of words for autocompleted annotations.
 * Note: quote escaping is not taken into consideration. Backslashes are treated as any other character
 * Examples:
 * "split word" behind another few --> ["split word", "behind", "another", "few"]
 * "wild* in split words" and such --> ["wild.* in split words", "and", "such"]
 * @param v the input string.
 * @param useQuoteDelimiters whether to use double quotes (") as delimiters or not. If not, the quotes are treated as regular characters.
 */
export const splitIntoTerms = (value: string, useQuoteDelimiters: boolean): SplitString[] => {
	let i = 0;
	let inQuotes = false;
	let seg = '';
	let start = 0;
	let segs: Array<{ start: number; end: number; value: string; isQuoted: boolean }> = [];
	for (const c of value) {
		switch (c) {
			case '"':
				if (useQuoteDelimiters) {
					// start or end of section (possibly both?)
					if (seg) {
						segs.push({ start, end: i + 1, value: seg, isQuoted: inQuotes });
						seg = '';
					}
					inQuotes = !inQuotes;
					start = i;
				} else {
					seg += c;
				}
				break;
			case ' ':
			case '\t':
			case '\r':
			case '\n':
			case '\f':
			case '\v':
				if (inQuotes) seg += c;
				else if (seg) {
					// this character is already no longer a part of the segment - hence no +1 on end
					segs.push({ start, end: i, value: seg, isQuoted: inQuotes });
					seg = '';
				}
				break;
			// ignorable whitespace
			default:
				if (!seg && !inQuotes) start = i;
				seg += c;
				break;
		}
		++i;
	}
	if (seg) {
		segs.push({ start, end: i, value: seg, isQuoted: inQuotes });
		seg = '';
	}
	return segs;
};

export function hashJavaDJB2(str: string) {
	let hash = 0;
	let i = 0;
	let char: number;
	const l = str.length;
	while (i < l) {
		char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0;
		++i;
	}
	return hash;
}
