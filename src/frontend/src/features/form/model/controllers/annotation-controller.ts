import { tokenPattern, withSummary, artifactFromPattern } from '@/features/form/model/compile/query-artifact';
import { createFieldController, type FieldController, type FieldControllerComponent } from '@/features/form/model/types/form-controllers';
import type { FieldControllerConfig } from '@/features/form/model/types/form-shape';

import type { SelectFieldState, SelectFieldUiConfig } from '@/features/form/fields/generic/select-field';
import type { TextFieldState, TextFieldUiConfig } from '@/features/form/fields/generic/text-field';

import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';

export type AnnotationFieldState = TextFieldState;

export type AnnotationSelectFieldState = SelectFieldState;

export type AnnotationFieldControllerConfig = FieldControllerConfig & {
	annotationId: string;
	annotatedFieldId?: string;
};

export type AnnotationFieldUiConfig = TextFieldUiConfig;

export type AnnotationFieldConfig = AnnotationFieldControllerConfig & AnnotationFieldUiConfig;

export type AnnotationTextFieldConfig = AnnotationFieldConfig;

export type AnnotationSelectFieldConfig = AnnotationFieldControllerConfig & Pick<SelectFieldUiConfig, 'caseSensitive' | 'caseSensitiveLabel' | 'description' | 'displayName' | 'options' | 'placeholder' | 'textDirection'>;

export type AnnotationAutocompleteFieldConfig = AnnotationFieldConfig;

function createAnnotationTextController<Kind extends string, UiConfig extends object, Config extends AnnotationFieldConfig & UiConfig>(
	kind: Kind,
	component: FieldControllerComponent<AnnotationFieldState, UiConfig>,
	patternType: 'equals' | 'regex',
): FieldController<Kind, AnnotationFieldState, Config, UiConfig> {
	return createFieldController<Kind, AnnotationFieldState, UiConfig, Config>({
		kind,
		component,
		createDefaultState: () => ({ value: '', caseSensitive: false }),
		buildQuery({ node, state }) {
			const pattern = tokenPattern([
				{
					type: patternType,
					annotationId: node.config.annotationId,
					value: state.value,
					caseSensitive: state.caseSensitive,
				},
			]);
			return withSummary(artifactFromPattern(pattern), state.value ? { id: node.id, label: node.config.displayName, value: state.value } : null);
		},
	});
}

export const annotationTextController = createAnnotationTextController<'annotation-text', TextFieldUiConfig, AnnotationTextFieldConfig>('annotation-text', TextField, 'regex');

export const annotationSelectController = createFieldController<'annotation-select', AnnotationSelectFieldState, SelectFieldUiConfig, AnnotationSelectFieldConfig>({
	kind: 'annotation-select',
	component: SelectField,
	createDefaultState: (): AnnotationSelectFieldState => ({
		selectedValues: [],
		caseSensitive: false,
	}),
	buildQuery({ node, state }) {
		const value = state.selectedValues[0] ?? '';
		const pattern = tokenPattern([
			{
				type: 'equals',
				annotationId: node.config.annotationId,
				value,
				caseSensitive: state.caseSensitive,
			},
		]);
		return withSummary(artifactFromPattern(pattern), value ? { id: node.id, label: node.config.displayName, value } : null);
	},
});

export const annotationAutocompleteController = createAnnotationTextController<'annotation-autocomplete', TextFieldUiConfig, AnnotationAutocompleteFieldConfig>(
	'annotation-autocomplete',
	TextField,
	'equals',
);
