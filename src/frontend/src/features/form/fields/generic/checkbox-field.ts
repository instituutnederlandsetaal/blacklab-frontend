import type { GenericFieldUiConfig } from '@/features/form/fields/generic/shared-ui-config';

import type { Option } from '@/shared/utils/options';

export type CheckboxFieldState = string[];

export const createDefaultCheckboxFieldState = (): CheckboxFieldState => [];

export type CheckboxFieldUiConfig = GenericFieldUiConfig & {
	options: Option[];
};
