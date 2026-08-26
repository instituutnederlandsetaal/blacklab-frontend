import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';
import type { BLCollocationScorer, BLCollocationType } from '@/types/blacklabtypes';

export type CollocationFieldState = {
	patt: string;
	collpatt: string;
	colltype: BLCollocationType;
	context: string;
	within: string;
	reltype: string;
	annotation: string;
	sensitive: boolean;
	scorertype: BLCollocationScorer;
};

type CollocationAnnotationOption = {
	value: string;
	label: () => string;
};

type CollocationFieldExtraProps = {
	annotationOptions: CollocationAnnotationOption[];
	defaultAnnotation: string;
};

export type CollocationFieldDefinition = FieldDefinition<CollocationFieldState, CollocationFieldExtraProps>;
export type CollocationFieldComponentProps = FieldComponentProps<CollocationFieldState> & CollocationFieldExtraProps;
