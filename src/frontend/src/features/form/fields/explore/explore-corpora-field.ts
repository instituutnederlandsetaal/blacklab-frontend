import type { GenericFieldUiConfig } from '@/features/form/fields/generic/shared-ui-config';
import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { createFieldController } from '@/features/form/model/types/form-controllers';

import type { Options } from '@/shared/utils/options';

export type ExploreCorporaFieldState = {
	corporaGroupBy: string | null;
	corporaGroupDisplayMode: string | null;
};

export const createDefaultExploreCorporaFieldState = (): ExploreCorporaFieldState => ({
	corporaGroupBy: null,
	corporaGroupDisplayMode: null,
});

export type ExploreCorporaFieldUiConfig = GenericFieldUiConfig & {
	metadataGroupByOptions: Options;
};

// todo controller
export const exploreCorporaFieldController = createFieldController<'explore-corpora', ExploreCorporaFieldState, ExploreCorporaFieldUiConfig>({
	kind: 'explore-corpora',
	affectsBlackLabParameters: [],
	createDefaultState: createDefaultExploreCorporaFieldState,
	getQueryContribution: () => {
		// no explicit query
		// TODO return groupby mode and groupby display mode as query contribution, if set
		return queryFragment({});
	},
	getPersistKey: () => 'explore-corpora',
	encode: state => {
		if (!state.corporaGroupBy && !state.corporaGroupDisplayMode) return null;
		return [state.corporaGroupBy ?? '', state.corporaGroupDisplayMode ?? ''];
	},
	restore: payload => {
		const [corporaGroupBy = '', corporaGroupDisplayMode = ''] = Array.isArray(payload) ? payload : [payload];
		return {
			corporaGroupBy: corporaGroupBy || null,
			corporaGroupDisplayMode: corporaGroupDisplayMode || null,
		};
	},
});
