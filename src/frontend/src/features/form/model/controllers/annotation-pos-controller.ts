import {
	buildAnnotationPosPattern,
	createDefaultAnnotationPosFieldState,
	summarizeAnnotationPosState,
	type AnnotationPosFieldConfig,
	type AnnotationPosFieldState,
} from '@/features/form/fields/annotation-pos-field';
import { createQueryContribution } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, encodePersistObject, joinPersistValues, splitPersistValue } from '@/features/form/model/controllers/persistence-codec';
import type { QueryContribution } from '@/features/form/model/types';
import { createFieldController } from '@/features/form/model/types/form-controllers';

export const annotationPosController = createFieldController<'annotation-pos', AnnotationPosFieldState, AnnotationPosFieldConfig>({
	kind: 'annotation-pos',
	createDefaultState: createDefaultAnnotationPosFieldState,
	getPersistKey: config => config.annotation.id,
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		const selected = Object.entries(state.selected ?? {})
			.filter(([, isSelected]) => isSelected)
			.map(([key]) => key);
		return encodePersistObject({
			value: state.annotationValue,
			selected: selected.length ? joinPersistValues(selected) : undefined,
		});
	},
	restore(payload) {
		const restored = decodePersistObject(payload);
		return {
			annotationValue: restored.value || null,
			selected: Object.fromEntries(
				splitPersistValue(restored.selected ?? '')
					.filter(Boolean)
					.map(key => [key, true]),
			),
		};
	},
	getQueryContribution(config, runtime, state) {
		const pattern = buildAnnotationPosPattern(config, state);
		if (!pattern) return createQueryContribution();
		const r: QueryContribution = {
			query: {
				pattern: {
					type: 'raw',
					cql: pattern,
				},
				filter: null,
				searchField: null,
				wrappers: [],
			},
			summaries: state.annotationValue
				? [
						{
							id: config.annotation.id,
							label: runtime.translate.$tAnnotDisplayName(config.annotation),
							value: summarizeAnnotationPosState(config, state, runtime.translate) || state.annotationValue || '',
							group: config.groupId,
						},
					]
				: [],
		};
		return r;
	},
});
