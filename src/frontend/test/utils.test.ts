import { describe, expect, test } from 'vitest';

import { escapeLucene, escapeRegex, tokenizeString, unescapeLucene, unescapeRegex, type LuceneEscapeOptions, type RegexEscapeOptions } from '@/shared/utils/string-utils';

type ExpectedPart = {
	start: number;
	end: number;
	value: string;
	isQuoted?: boolean;
	sourceValue?: string;
};

const cases: Array<{ value: string; expect: ExpectedPart[] }> = [
	{
		value: '"the simplest"',
		expect: [
			{
				start: 0,
				end: 14,
				value: 'the simplest',
				isQuoted: true,
			},
		],
	},
	{
		value: 'this is " a test """ ',
		expect: [
			{
				start: 0,
				end: 4,
				value: 'this',
			},
			{
				start: 5,
				end: 7,
				value: 'is',
			},
			{
				start: 8,
				end: 18,
				value: ' a test ',
				isQuoted: true,
			},
		],
	},
	{
		value: 'regular string',
		expect: [
			{
				start: 0,
				end: 7,
				value: 'regular',
			},
			{
				start: 8,
				end: 14,
				value: 'string',
			},
		],
	},
	{
		value: '  starting with a few \t spaces \r\nhelp',
		expect: [
			{
				start: 2,
				end: 10,
				value: 'starting',
			},
			{
				start: 11,
				end: 15,
				value: 'with',
			},
			{
				start: 16,
				end: 17,
				value: 'a',
			},
			{
				start: 18,
				end: 21,
				value: 'few',
			},
			{
				start: 24,
				end: 30,
				value: 'spaces',
			},
			{
				start: 33,
				end: 37,
				value: 'help',
			},
		],
	},
	{
		value: '"normal everyday" string "with some quotes"',
		expect: [
			{
				start: 0,
				end: 17,
				value: 'normal everyday',
				isQuoted: true,
			},
			{
				start: 18,
				end: 24,
				value: 'string',
			},
			{
				start: 25,
				end: 43,
				value: 'with some quotes',
				isQuoted: true,
			},
		],
	},
	{
		value: String.raw`"keeps \"quotes\" literal" after`,
		expect: [
			{
				start: 0,
				end: 26,
				value: 'keeps "quotes" literal',
				sourceValue: String.raw`keeps \"quotes\" literal`,
				isQuoted: true,
			},
			{
				start: 27,
				end: 32,
				value: 'after',
			},
		],
	},
	{
		value: String.raw`keeps\"quote literal`,
		expect: [
			{
				start: 0,
				end: 12,
				value: 'keeps"quote',
				sourceValue: String.raw`keeps\"quote`,
			},
			{
				start: 13,
				end: 20,
				value: 'literal',
			},
		],
	},
];

describe('tokenizeString', () => {
	test.each(cases)('splits %j into expected terms', ({ value: fullValue, expect: expected }) => {
		const split = tokenizeString(fullValue, true);
		expect(split).toHaveLength(expected.length);

		split.forEach((part, index) => {
			const { start, end, value, sourceValue, isQuoted } = expected[index];
			expect(part.start).toBe(start);
			expect(part.end).toBe(end);
			expect(part.isQuoted).toBe(isQuoted ?? false);
			expect(part.value).toBe(value);

			const expand = part.isQuoted ? 1 : 0;
			expect(fullValue.substring(part.start + expand, part.end - expand)).toBe(sourceValue ?? value);
		});
	});
});

const regexEscapeCases: Array<{
	name: string;
	value: string;
	settings: RegexEscapeOptions;
	expected: string;
}> = [
	{
		name: 'quotes: escapes raw value when escaping is enabled',
		value: '"raw quotes"',
		settings: { escapeQuotes: true },
		expected: String.raw`\"raw quotes\"`,
	},
	{
		name: 'quotes: leaves raw value alone when escaping is disabled',
		value: '"raw quotes"',
		settings: { escapeQuotes: false },
		expected: '"raw quotes"',
	},
	{
		name: 'quotes: does not treat existing backslash+character pair as pre-escaped when escaping is enabled',
		value: String.raw`\"pre-escaped quotes\"`,
		settings: { escapeQuotes: true },
		expected: String.raw`\\\"pre-escaped quotes\\\"`,
	},
	{
		name: 'quotes: keeps pre-escaped value escaped when escaping is disabled',
		value: String.raw`\"pre-escaped quotes\"`,
		settings: { escapeQuotes: false },
		expected: String.raw`\"pre-escaped quotes\"`,
	},
	{
		name: 'pipes: escapes raw value when escaping is enabled',
		value: 'a|b',
		settings: { escapePipes: true },
		expected: String.raw`a\|b`,
	},
	{
		name: 'pipes: leaves raw value alone when escaping is disabled',
		value: 'a|b',
		settings: { escapePipes: false },
		expected: 'a|b',
	},
	{
		name: 'pipes: does not treat existing backslash+character pair as pre-escaped when escaping is enabled',
		value: String.raw`a\|b`,
		settings: { escapePipes: true },
		expected: String.raw`a\\\|b`,
	},
	{
		name: 'pipes: keeps pre-escaped value escaped when escaping is disabled',
		value: String.raw`a\|b`,
		settings: { escapePipes: false },
		expected: String.raw`a\|b`,
	},
	{
		name: 'stars: escapes raw value when wildcard escaping is enabled',
		value: 'a*b',
		settings: { escapeWildcards: true },
		expected: String.raw`a\*b`,
	},
	{
		name: 'stars: activates raw value when wildcard escaping is disabled',
		value: 'a*b',
		settings: { escapeWildcards: false },
		expected: 'a.*b',
	},
	{
		name: 'stars: does not treat existing backslash+character pair as pre-escaped when wildcard escaping is enabled',
		value: String.raw`a\*b`,
		settings: { escapeWildcards: true },
		expected: String.raw`a\\\*b`,
	},
	{
		name: 'stars: keeps pre-escaped value escaped when wildcard escaping is disabled',
		value: String.raw`a\*b`,
		settings: { escapeWildcards: false },
		expected: String.raw`a\*b`,
	},
	{
		name: 'question marks: escapes raw value when wildcard escaping is enabled',
		value: 'a?b',
		settings: { escapeWildcards: true },
		expected: String.raw`a\?b`,
	},
	{
		name: 'question marks: activates raw value when wildcard escaping is disabled',
		value: 'a?b',
		settings: { escapeWildcards: false },
		expected: 'a.b',
	},
	{
		name: 'question marks: does not treat existing backslash+character pair as pre-escaped when wildcard escaping is enabled',
		value: String.raw`a\?b`,
		settings: { escapeWildcards: true },
		expected: String.raw`a\\\?b`,
	},
	{
		name: 'question marks: keeps pre-escaped value escaped when wildcard escaping is disabled',
		value: String.raw`a\?b`,
		settings: { escapeWildcards: false },
		expected: String.raw`a\?b`,
	},
];

describe('escapeRegex', () => {
	test.each(regexEscapeCases)('$name', ({ value, settings, expected }) => {
		expect(escapeRegex(value, settings)).toBe(expected);
	});
});

describe('unescapeRegex', () => {
	test.each(regexEscapeCases)('$name', ({ value, settings, expected }) => {
		expect(unescapeRegex(expected, settings)).toBe(value);
	});
});

const luceneEscapeCases: Array<{
	name: string;
	value: string;
	options?: LuceneEscapeOptions;
	expected: string;
}> = [
	{
		name: 'escapes literal wildcard and Lucene operator characters',
		value: 'a*b?+c',
		expected: String.raw`a\*b\?\+c`,
	},
	{
		name: 'preserves active wildcards',
		value: 'a*b?',
		options: { escapeWildcards: false },
		expected: 'a*b?',
	},
	{
		name: 'preserves pre-escaped wildcards when wildcard semantics are active',
		value: String.raw`a\*b\?`,
		options: { escapeWildcards: false },
		expected: String.raw`a\*b\?`,
	},
	{
		name: 'treats backslashes as literal input when wildcard semantics are inactive',
		value: String.raw`a\*b`,
		expected: String.raw`a\\\*b`,
	},
	{
		name: 'quotes whitespace and encodes quote and backslash delimiters',
		value: String.raw`a "b\c"`,
		expected: String.raw`"a \"b\\c\""`,
	},
	{
		name: 'emits regex syntax and escapes only unescaped delimiters',
		value: String.raw`a/.+\/b`,
		options: { escapeRegex: false },
		expected: String.raw`/a\/.+\/b/`,
	},
];

describe('escapeLucene', () => {
	test.each(luceneEscapeCases)('$name', ({ value, options, expected }) => {
		expect(escapeLucene(value, options)).toBe(expected);
	});

	test.each(luceneEscapeCases.filter(testCase => testCase.options?.escapeRegex !== false && testCase.options?.escapeWildcards !== false))('roundtrips $name', ({ value, options }) => {
		expect(unescapeLucene(escapeLucene(value, options))).toBe(value);
	});
});
