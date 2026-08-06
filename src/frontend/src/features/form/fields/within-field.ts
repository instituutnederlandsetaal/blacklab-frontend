import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';

import type { Option } from '@/shared/utils/options';

export type WithinFieldOption = Option & {
	attributes?: Option[];
};

export type WithinFieldState = {
	element: string | null;
	attributes: Record<string, string>;
};
type WithinFieldExtraProps = {
	options: WithinFieldOption[];
	/** Sort generated span options by their translated labels; configured options retain their explicit order. */
	sortOptions?: boolean;
};
export type WithinFieldDefinition = FieldDefinition<WithinFieldState, WithinFieldExtraProps>;

/** Materialized for Vue's runtime prop extraction; equivalent to `WithinFieldDefinition['componentProps']`. */
export type WithinFieldComponentProps = FieldComponentProps<WithinFieldState> & WithinFieldExtraProps;
