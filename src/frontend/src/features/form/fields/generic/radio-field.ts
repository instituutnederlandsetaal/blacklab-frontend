import type { GenericFieldUiConfig } from '@/features/form/fields/generic/shared-ui-config';

import type { Option } from '@/shared/utils/options';

export type RadioFieldState = string;

export const createDefaultRadioFieldState = (): RadioFieldState => '';

export type RadioFieldUiConfig = GenericFieldUiConfig & {
	options: Option[];
};
