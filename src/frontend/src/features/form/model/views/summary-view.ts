import type { MaybeRefOrGetter } from 'vue';

export type SummaryViewConfig = {
	title?: MaybeRefOrGetter<string>;
	showRaw?: boolean;
};
