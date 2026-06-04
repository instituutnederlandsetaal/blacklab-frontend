import type { MaybeRefOrGetter } from 'vue';

export type HeadingViewConfig = {
	title: MaybeRefOrGetter<string>;
	description?: MaybeRefOrGetter<string>;
};
