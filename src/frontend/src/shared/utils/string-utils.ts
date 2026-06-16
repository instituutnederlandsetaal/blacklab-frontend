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

const regexSpecialChars = new Set(['\\', '^', '$', '#', '@', '&', '+', '.', '(', ')', '{', '}', '[', ']']);
const preservedRegexEscapes = new Set(['|', '*', '?', '"']);

/** Escape special characters in a string for use in a regular expression, the default escaping options are to escape wildcards, pipes, and quotes */
export function escapeRegex(value: string, settings: RegexEscapeOptions = {}) {
	settings = { ...defaultRegexEscapeOptions, ...settings };

	const escapeChar = (char: string) => {
		if (regexSpecialChars.has(char)) return `\\${char}`;
		if (char === '*' || char === '?') return settings.escapeWildcards ? `\\${char}` : char === '*' ? '.*' : '.';
		if (char === '|') return settings.escapePipes ? '\\|' : '|';
		if (char === '"') return settings.escapeQuotes ? '\\"' : '"';
		return char;
	};
	const shouldEscape = (char: string) => {
		if (char === '*' || char === '?') return settings.escapeWildcards;
		if (char === '|') return settings.escapePipes;
		if (char === '"') return settings.escapeQuotes;
		return false;
	};

	let result = '';
	for (let i = 0; i < value.length; i += 1) {
		const char = value[i];
		const next = value[i + 1];
		if (char === '\\' && preservedRegexEscapes.has(next) && !shouldEscape(next)) {
			result += `\\${next}`;
			i += 1;
			continue;
		}
		result += escapeChar(char);
	}
	return result;
}

export function unescapeRegex(value: string, settings: RegexEscapeOptions = {}) {
	settings = { ...defaultRegexEscapeOptions, ...settings };

	const unescapeChar = (char: string) => {
		if (char === '*' || char === '?') return settings.escapeWildcards ? char : `\\${char}`;
		if (char === '|') return settings.escapePipes ? '|' : '\\|';
		if (char === '"') return settings.escapeQuotes ? '"' : '\\"';
		return regexSpecialChars.has(char) ? char : `\\${char}`;
	};

	let result = '';
	for (let i = 0; i < value.length; i += 1) {
		const char = value[i];
		const next = value[i + 1];
		if (char === '\\' && next) {
			result += unescapeChar(next);
			i += 1;
		} else if (!settings.escapeWildcards && char === '.' && next === '*') {
			result += '*';
			i += 1;
		} else {
			result += !settings.escapeWildcards && char === '.' ? '?' : char;
		}
	}
	return result;
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
 * Tokenizes a string into words.
 * For example strings input in the "Simple Search" input.
 * This works by splitting the string on all whitespace (ignoring it), except where (a part of) the string is enclosed in double quotes (""), between which whitespace is preserved.
 * Double quotes and whitespace that has been used as separator is stripped from the value field of the returned structs.
 * Returned indices use half-open ranges: start is inclusive, end is exclusive (same convention as substring(start, end)).
 * Stripped quotes (not whitespace!) are however still reflected in the start and end properties. (meaning for a string that isQuoted, (end-start) === (value.length + 2))
 * This is because this function is also used to split out (and replace) the currently selected word/sequence of words for autocompleted annotations.
 * Escaped quotes (\") are treated as regular characters.
 * Examples:
 * "split word" behind another few --> ["split word", "behind", "another", "few"]
 * "wild* in split words" and such --> ["wild* in split words", "and", "such"]
 * @param v the input string.
 * @param useQuoteDelimiters whether to use double quotes (") as delimiters or not. If not, the quotes are treated as regular characters.
 */
export const tokenizeString = (value: string, useQuoteDelimiters: boolean): SplitString[] => {
	let i = 0;
	let inQuotes = false;
	let seg = '';
	let start = 0;
	let segs: Array<{ start: number; end: number; value: string; isQuoted: boolean }> = [];
	for (const c of value) {
		switch (c) {
			case '"':
				if (useQuoteDelimiters && !isEscapedAt(value, i)) {
					// start or end of section (possibly both?)
					if (seg) {
						segs.push({ start, end: i + 1, value: seg, isQuoted: inQuotes });
						seg = '';
					}
					inQuotes = !inQuotes;
					start = i;
				} else {
					if (useQuoteDelimiters && seg.endsWith('\\')) {
						seg = seg.slice(0, -1);
					}
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

function isEscapedAt(value: string, index: number): boolean {
	let backslashes = 0;
	for (let i = index - 1; i >= 0 && value[i] === '\\'; i--) {
		backslashes += 1;
	}
	return backslashes % 2 === 1;
}

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
