export const NATIVE_BLACKLAB_PARAMETERS = ['patt', 'filter', 'searchfield'] as const;
export type BlackLabParameter = (typeof NATIVE_BLACKLAB_PARAMETERS)[number];
export type BlackLabParameters = { [P in BlackLabParameter]?: string | null | undefined };

export function isBlacklabParameter(param: string | null | undefined): param is BlackLabParameter {
	return NATIVE_BLACKLAB_PARAMETERS.includes(param as any);
}
