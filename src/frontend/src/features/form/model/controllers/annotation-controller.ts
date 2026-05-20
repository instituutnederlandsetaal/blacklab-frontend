import { tokenPattern, withSummary, artifactFromPattern } from '@/features/form/model/compile/query-artifact';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { FieldControllerConfig } from '@/features/form/model/types/form-shape';

import type { Options } from '@/shared/utils/options';

import AnnotationField from '@/features/form/fields/AnnotationField.vue';

export type AnnotationFieldState = {
	value: string;
	caseSensitive: boolean;
};

export type AnnotationFieldConfig = FieldControllerConfig & {
	annotationId: string;
	annotatedFieldId?: string;
	displayName: string;
	description?: string;
	caseSensitive?: boolean;
	uiType?: 'text' | 'select' | 'combobox' | 'pos' | 'lexicon';
	options?: Options;
	autocomplete?: (term: string) => Promise<string[]>;
};

export const annotationController: FieldController<'annotation', AnnotationFieldState, AnnotationFieldConfig> = {
	kind: 'annotation',
	component: AnnotationField,
	createDefaultState: () => ({ value: '', caseSensitive: false }),
	buildQuery({ node, state }) {
		const config = node.config;
		const pattern = tokenPattern([
			{
				type: config.uiType === 'text' ? 'regex' : 'equals',
				annotationId: config.annotationId,
				value: state.value,
				caseSensitive: state.caseSensitive,
			},
		]);
		return withSummary(artifactFromPattern(pattern), state.value ? { id: node.id, label: config.displayName, value: state.value } : null);
	},

	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
};
export default annotationController;
