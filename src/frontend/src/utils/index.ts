import type * as AppTypes from '@/types/apptypes';

export const uiTypeSupport: { [key: string]: { [key: string]: Array<AppTypes.NormalizedAnnotation['uiType']> } } = {
	search: {
		simple: ['combobox', 'select', 'lexicon'],
		extended: ['combobox', 'select', 'pos'],
	},
	explore: {
		ngram: ['combobox', 'select'],
	},
};

export function getCorrectUiType<T extends AppTypes.NormalizedAnnotation['uiType']>(allowed: T[], actual: T): T {
	return allowed.includes(actual) ? actual : ('text' as any);
}
