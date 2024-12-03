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

/** Remove properties P from type T */
export type RemoveProperties<T, P extends keyof T> = Pick<T, Exclude<keyof T, P>>;

/** Remove unnamed properties */
export type KeepProperties<T, P extends keyof T> = {
	[Q in P]: T[P];
};

/** Force unnamed properties to not exist */
export type KeepOnlyProperties<T, P extends keyof T> = {
	[Q in keyof T]: Q extends P ? T[P] : undefined;
};
