/**
 * Given a fraction (0-1), converts the number to the string representation of the percentage,
 * displaying at most n significant digits after the first nonzero number in the string.
 *
 * Examples:
 *
 * 1 -> 100%
 * 0.1 -> 10%
 *
 * 0.111 -> 10%    with significants: 2
 * 0.111 -> 10.1%  with significants: 3
 * 0.10001 -> 10% with significants: 3
 * 0.10001 -> 10.001% with significants: 5
 */

export default function (n: number, significants: number = 3): string {
	n = n * 100;
	const str = n.toFixed(20);
	const p = /(\d+)\.?(0*)(\d*)$/; // toString divider character is always '.' as defined by the standard

	const result = str.match(p)!;
	const whole: string = result[1];
	const fracZeroes: string = result[2];
	const fracNumbers: string = result[3];

	const hasSignificantsBeforeSeparator = whole !== '0';
	significants = Math.max(0, Math.min(fracZeroes.length + fracNumbers.length, hasSignificantsBeforeSeparator ? significants - whole.length : significants + fracZeroes.length));
	const ret = n.toFixed(significants);
	// Sometimes toString returns 0.000999999999
	// but toFixed returns 0.001 because it rounds.
	// That causes it to output trailing zeroes we didn't anticipate, so strip those.
	// (but only when they are in the fractional portion, or we would strip '10' and '100' to '1')
	return (significants > 0 ? ret.replace(/\.?0*$/, '') : ret) + '%';
}
