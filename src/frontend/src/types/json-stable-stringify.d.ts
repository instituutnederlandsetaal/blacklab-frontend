declare module 'json-stable-stringify' {
	interface Options {
		/** Comparator to sort entries */
		cmp: (a: {key: string, value: any}, b: {key: string, value: any}) => -1|0|1;
		/** Number of spaces to ident, or a custom string to insert for every level of identation */
		space: string|number;
	}
	export default function(obj: any, opts?: Options): string;

}