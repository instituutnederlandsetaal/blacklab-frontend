import type { MaybeComputed } from '@/features/form/model/types/form-shape';

export type HeadingViewConfig = {
	title: MaybeComputed<string>;
	description?: MaybeComputed<string>;
};
