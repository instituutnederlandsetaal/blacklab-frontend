import type { MaybeRefOrGetter } from 'vue';

export type TotalsViewConfig = {
	title?: MaybeRefOrGetter<string>;
	baseDocuments: number;
	baseTokens: number;
};
