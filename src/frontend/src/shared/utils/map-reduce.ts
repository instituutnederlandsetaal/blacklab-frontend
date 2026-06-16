import type { KeysOfType } from '@/types/helpers';

/**
 * Returns a reducer function that will place all values into a map/object at the key defined by the passed string.
 * @param k key to pick from the objects
 * @param m optional mapping function to transform the objects after picking the key
 */
export function makeMapReducer<T, V extends (t: T, i: number) => any = (t: T, i: number) => T>(
	k: KeysOfType<T, string>,
	m?: V,
): (m: Record<string, ReturnType<V>>, t: T, i: number) => Record<string, ReturnType<V>> {
	return (acc: Record<string, ReturnType<V>>, v: T, i: number): Record<string, ReturnType<V>> => {
		const kv = v[k] as any as string;
		acc[kv] = m ? m(v, i) : v;
		return acc;
	};
}

export function makeMultimapReducer<T, V extends (t: T, i: number) => any = (t: T, i: number) => T>(
	k: KeysOfType<T, string>,
	m?: V,
): (m: Record<string, Array<ReturnType<V>>>, t: T, i: number) => Record<string, Array<ReturnType<V>>> {
	return (acc: Record<string, Array<ReturnType<V>>>, v: T, i: number): Record<string, Array<ReturnType<V>>> => {
		const kv = v[k] as any as string;
		(acc[kv] ??= []).push(m ? m(v, i) : v);
		return acc;
	};
}

/**
 * Turn an array of strings into a map of type {[key: string]: true}.
 * Optionally mapping the values to be something other than "true".
 *
 * @param t the array of strings to place in a map.
 * @param m (optional) a mapping function to apply to values.
 */
export function mapReduce<VS extends (t: string, i: number) => any = (t: string, i: number) => true>(t: string[] | undefined | null, m?: VS): Record<string, ReturnType<VS>>;
/**
 * Turn an array of type T[] into a map of type {[key: string]: T}.
 * Optionally mapping the values to be something other than T.
 *
 * @param t the array of objects to place in a map.
 * @param k a key in the objects to use as key in the map.
 * @param m (optional) a mapping function to apply to values.
 */
export function mapReduce<T, VT extends (t: T, i: number) => any = (t: T, i: number) => T>(t: T[] | undefined | null, k: KeysOfType<T, string>, m?: VT): Record<string, ReturnType<VT>>;
export function mapReduce<T, VT extends (t: T, i: number) => any = (t: T, i: number) => T, VS extends (t: string, i: number) => any = (t: string, i: number) => true>(
	t: string[] | T[] | undefined | null,
	a?: VS | KeysOfType<T, string>,
	b?: VT,
): any {
	if (t && t.length > 0 && typeof t[0] === 'string') {
		const values = t as string[];
		const mapper = a as VS | undefined;
		return values.reduce<Record<string, ReturnType<VS>>>((acc, cur, index) => {
			acc[cur] = mapper ? mapper(cur, index) : true;
			return acc;
		}, {});
	} else {
		const values = t as T[] | undefined | null;
		const key = a as KeysOfType<T, string>;
		return values ? values.reduce(makeMapReducer<T, VT>(key, b), {}) : {};
	}
}

/**
 * Turn an array of type T[] into a map of type {[key: string]: T[]};
 * Duplicate keys will be pushed into the array at that key in order of appearance.
 *
 * @param t the array of objects to place in a map.
 * @param k a key in the objects to use as key in the map.
 * @param m (optional) a mapping function to apply to values.
 */
export function multimapReduce<T, V extends (t: T, i: number) => any = (t: T, i: number) => T>(t: T[] | undefined | null, k: KeysOfType<T, string>, m?: V): Record<string, Array<ReturnType<V>>> {
	return t ? t.reduce(makeMultimapReducer<T, V>(k, m), {}) : {};
}
