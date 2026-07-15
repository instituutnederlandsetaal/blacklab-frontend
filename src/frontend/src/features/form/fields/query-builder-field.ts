import type { CqlQueryBuilderData, CqlQueryBuilderOptions } from '@/features/cql-query-builder/model';
import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';

export type QueryBuilderFieldState = CqlQueryBuilderData;
export type QueryBuilderFieldExtraProps = {
	options: CqlQueryBuilderOptions;
};
export type QueryBuilderFieldDefinition = FieldDefinition<QueryBuilderFieldState, QueryBuilderFieldExtraProps>;

export type QueryBuilderFieldConfig = QueryBuilderFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `QueryBuilderFieldDefinition['componentProps']`. */
export type QueryBuilderFieldComponentProps = FieldComponentProps<QueryBuilderFieldState> & QueryBuilderFieldExtraProps;
