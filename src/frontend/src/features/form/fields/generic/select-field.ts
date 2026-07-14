import type { GenericFieldUiConfig } from '@/features/form/fields/generic/shared-ui-config';

import type { Options } from '@/shared/utils/options';

export type SelectFieldState = string[];

export const createDefaultSelectFieldState = (): SelectFieldState => [];

export type SelectFieldUiConfig = GenericFieldUiConfig & {
	options: Options;
	placeholder?: string;
	multiple?: boolean;
	html?: boolean;
	hideEmpty?: boolean;
};
