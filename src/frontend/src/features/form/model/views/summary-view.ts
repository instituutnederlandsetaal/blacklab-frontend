import type { MaybeComputed } from '@/features/form/model/types/form-shape';

export type SummaryViewConfig = {
	title?: MaybeComputed<string>;
	showRaw?: boolean;
};
