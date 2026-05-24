import {
	buildAnnotationPosPattern,
	createDefaultAnnotationPosFieldState,
	summarizeAnnotationPosState,
	type AnnotationPosFieldConfig,
	type AnnotationPosFieldState,
} from '@/features/form/fields/annotation-pos-field';
import { artifactFromPattern, createQueryContribution, rawPattern, withSummary } from '@/features/form/model/compile/query-artifact';
import { createFieldController } from '@/features/form/model/types/form-controllers';

export const annotationPosController = createFieldController<'annotation-pos', AnnotationPosFieldState, AnnotationPosFieldConfig>({
	kind: 'annotation-pos',
	createDefaultState: createDefaultAnnotationPosFieldState,
	getQueryContribution({ node, runtime, state }) {
		const pattern = buildAnnotationPosPattern(node.config, state);
		if (!pattern) return createQueryContribution();

		return withSummary(artifactFromPattern(rawPattern(pattern)), {
			id: node.config.annotation.id,
			label: runtime.translate?.$tAnnotDisplayName(node.config.annotation) ?? node.config.annotation.defaultDisplayName ?? node.config.annotation.id,
			value: summarizeAnnotationPosState(node.config, state, runtime.translate) || state.annotationValue || '',
			group: node.config.groupId,
		});
	},
});
