/** Recursively make all fields optional */
export type RecursivePartial<T> = {
	[P in keyof T]?:
		T[P] extends Array<(infer U)> ? Array<RecursivePartial<U>> :
		T[P] extends object ? RecursivePartial<T[P]> :
		T[P];
};

export type RecursiveRequired<T> = {
	[P in keyof T]-?:
		T[P] extends Array<(infer U)> ? Array<RecursiveRequired<U>> :
		T[P] extends object ? RecursiveRequired<T[P]> :
		Required<T>[P];
}

export type NonNullableObject<T> = {
	[P in keyof T]: P extends undefined ? P[] : T[P];
};

type RequiredNotNull<T> = {
	[P in keyof T]: NonNullable<T[P]>
}

export type MarkRequiredAndNotNull<T, K extends keyof T> =
	T extends string|number|boolean ? T :
	T extends undefined|null ? never :
	T & Required<RequiredNotNull<Pick<T, K>>>


/** Keep only those properties assignable to T  */
export type FilterProps<TObj, T> = {
	[K in keyof TObj as TObj[K] extends T ? K : never]: TObj[K]
};

/** Return only those keys whose values are assignable to T */
export type KeysOfType<TObj, T> = keyof FilterProps<Required<TObj>, T>;


/** See https://dev.to/lucianbc/union-type-merging-in-typescript-9al */
export namespace UnionHelpers {
	/** Return only those keys that exist in all union members. */
	export type CommonKeys<T extends object> = keyof T;
	/** Return only those keys that exist in some but not all union members. */
	export type NonCommonKeys<T extends object> = Subtract<AllKeys<T>, CommonKeys<T>>;
	export type Subtract<A, C> = A extends C ? never : A;
	/** Return full list of possible keys across all union members. */
	export type AllKeys<T> = T extends any ? keyof T : never;
	/**
	 * Given T is a union, K is a key in some of the union members, return all possible types behind the key.
	 * E.g. type A = {a: string}; type B = {a?: number; b: string}; type C = PickType<A|B, 'a'> = string|number|undefined, where string is from A, number is from B, and undefined is 'a' being optional in type B.
	*/
	export type PickType<T, K extends AllKeys<T>> = T extends { [k in K]?: any } ? T[K] : undefined;

	/** Non-restricted version of PickType, which allows any symbol instead of only known keys. */
	export type PickTypeOf<T, K extends string | number | symbol> = K extends AllKeys<T>
		? PickType<T, K>
		: never;

	/** Merge union types. E.G.:
	 * ```typescript
	 * type A = {a: string};
	 * type B = {a?: number, b: string};
	 * type C = Merge<A|B>; //  {a: string|number|undefined, b: string|undefined}
	 * ```
	 */
	export type Merge<T extends object> =
		{ [k in CommonKeys<T>]: PickTypeOf<T, k>; } &
		{ [k in NonCommonKeys<T>]?: PickTypeOf<T, k>; };

}
