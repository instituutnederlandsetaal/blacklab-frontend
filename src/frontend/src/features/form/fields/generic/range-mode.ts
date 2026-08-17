import type { RangeMode } from '@/features/form/model/types/form-primitives';

import type { Translate } from '@/shared/i18n';
import type { Option } from '@/shared/utils/options';

/**
 * Whether the true value must fall wholly within, or only partially within,
 * the specified range.
 */
export type { RangeMode } from '@/features/form/model/types/form-primitives';
export type RangeModeOption = Option<RangeMode>;

/** Value-only fallback for direct component mounts without graph-provided labels. */
export const rawRangeModeOptions: RangeModeOption[] = [{ value: 'permissive' }, { value: 'strict' }];

/** Create graph-safe mode options whose translations stay deferred until render time. */
export function createRangeModeOptions(translate: Pick<Translate, '$t'>): RangeModeOption[] {
	return [
		{
			value: 'permissive',
			label: () => translate.$t('filter.range.permissive'),
			title: () => translate.$t('filter.range.permissiveDescription'),
		},
		{
			value: 'strict',
			label: () => translate.$t('filter.range.strict'),
			title: () => translate.$t('filter.range.strictDescription'),
		},
	];
}
