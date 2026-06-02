import type { MaybeComputed } from '@/features/form/model/types/form-shape';

export type TotalsViewConfig = {
	title?: MaybeComputed<string>;
	baseDocuments: number;
	baseTokens: number;
};
