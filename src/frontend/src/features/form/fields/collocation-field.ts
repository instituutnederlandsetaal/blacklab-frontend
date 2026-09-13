import type { CqlQueryBuilderOptions } from '@/features/cql-query-builder/model';
import type { QueryBuilderFieldState } from '@/features/form/fields/query-builder-field';
import type { TokenSequenceCreateField } from '@/features/form/fields/token-sequence-field';
import type { WithinFieldOption } from '@/features/form/fields/within-field';
import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';

export type CollocationPatternMode = 'simple' | 'advanced' | 'expert';
export type CollocationPatternRole = 'keyword' | 'collocate';

export type CollocationSimplePatternState = {
	annotationId: string;
	fieldState: unknown;
};

export type CollocationPatternEditorState = {
	mode: CollocationPatternMode;
	simple: CollocationSimplePatternState;
	advanced: QueryBuilderFieldState;
	expert: string;
};

export type CollocationFieldState = {
	keyword: CollocationPatternEditorState;
	collocate: {
		enabled: boolean;
		pattern: CollocationPatternEditorState;
	};
	before: number;
	after: number;
	within: string;
	annotation: string;
	sensitive: boolean;
};

type CollocationAnnotationOption = {
	value: string;
	label: () => string;
};

type CollocationFieldExtraProps = {
	annotationOptions: CollocationAnnotationOption[];
	defaultAnnotation: string;
	createAnnotationField: TokenSequenceCreateField;
	queryBuilderOptions: CqlQueryBuilderOptions;
	withinOptions: WithinFieldOption[];
	defaultWithin: string;
	sortWithinOptions?: boolean;
	parsePattern: (cql: string) => Promise<QueryBuilderFieldState | null>;
};

export type CollocationFieldDefinition = FieldDefinition<CollocationFieldState, CollocationFieldExtraProps>;
export type CollocationFieldComponentProps = FieldComponentProps<CollocationFieldState> & CollocationFieldExtraProps;

export function createCollocationSimpleFieldNode(config: Pick<CollocationFieldExtraProps, 'createAnnotationField'> & { id: string }, role: CollocationPatternRole, annotationId: string) {
	return config.createAnnotationField({
		annotationId,
		id: `${config.id}.${role}.simple.${annotationId}`,
		inheritedVariant: 'simple',
	});
}
