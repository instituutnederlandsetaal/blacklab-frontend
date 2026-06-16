import { describe, expect, test } from 'vitest';

import { tokenizeString } from '@/shared/utils/string-utils';

type ExpectedPart = {
	start: number;
	end: number;
	value: string;
	isQuoted?: boolean;
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
];

describe('tokenizeString', () => {
	test.each(cases)('splits %j into expected terms', ({ value: fullValue, expect: expected }) => {
		const split = tokenizeString(fullValue, true);
		expect(split).toHaveLength(expected.length);

		split.forEach((part, index) => {
			const { start, end, value, isQuoted } = expected[index];
			expect(part.start).toBe(start);
			expect(part.end).toBe(end);
			expect(part.isQuoted).toBe(isQuoted ?? false);
			expect(part.value).toBe(value);

			const expand = part.isQuoted ? 1 : 0;
			expect(fullValue.substring(part.start + expand, part.end - expand)).toBe(value);
		});
	});
});
