export const NATIVE_BLACKLAB_PARAMETERS = ['patt', 'filter', 'searchfield'] as const;
export type BlackLabParameter = (typeof NATIVE_BLACKLAB_PARAMETERS)[number];
export type BlackLabParameters = { [P in BlackLabParameter]?: string | null | undefined };
