import { buildAnnotationPosPattern, createDefaultAnnotationPosFieldState, summarizeAnnotationPosState, type AnnotationPosFieldDefinition } from '@/features/form/fields/annotation-pos-field';
import { cqlRaw, queryFragment, queryIR } from '@/features/form/model/compile/query-artifact';
import { array, object, scalar } from '@/features/form/model/controllers/persistence-codec';
import type { QueryFragment } from '@/features/form/model/types';
import { defineFieldController } from '@/features/form/model/types/form-controllers';

const persistenceCodec = object({
	annotationValue: scalar()
		.transform<string | null>({ encode: value => value ?? '', decode: value => value || null })
		.default(null)
		.at('v'),
	selected: array(scalar())
		.transform<Record<string, boolean>>({
			encode: selected => Object.entries(selected).filter(([, value]) => value).map(([key]) => key),
			decode: selected => Object.fromEntries(selected.map(key => [key, true])),
		})
		.default({})
		.at('s'),
}).default({ annotationValue: null, selected: {} });

export const annotationPosController = defineFieldController<'annotation-pos', AnnotationPosFieldDefinition>({
	kind: 'annotation-pos',
	createDefaultState: createDefaultAnnotationPosFieldState,
	persistence: { key: config => config.annotation.id, codec: persistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, runtime, state) {
		const pattern = buildAnnotationPosPattern(config, state);
		if (!pattern) return queryFragment();
		const r: QueryFragment = {
			query: queryIR({ pattern: cqlRaw(pattern) }),
			summaries: state.annotationValue
				? [
						{
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
