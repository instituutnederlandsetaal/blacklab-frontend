import { toValue } from 'vue';

import type { AnnotationPosFieldDefinition } from '@/features/form/fields/annotation-pos-field';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import { array, record, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';
import { annotation, booleanNode, queryFragment, queryIR } from '@/features/form/model/types/form-query-ir';

const persistenceCodec = record(array(scalar())).default({});

export const annotationPosController = defineFieldController<'annotation-pos', AnnotationPosFieldDefinition>({
	kind: 'annotation-pos',
	createDefaultState: () => ({}),
	persistence: { key: config => config.annotationId, codec: persistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state) {
		const [annotationValue] = state[config.annotationId] ?? [];
		if (!annotationValue) return null;

		const query = queryIR({
			pattern: booleanNode(
				'and',
				Object.entries(state)
					.filter(([, values]) => values.length)
					.map(([annotationId, values]) => annotation(annotationId, 'literal', values)!),
			),
		});
		return queryFragment(query, {
			label: toValue(config.displayName) ?? config.annotationId,
			value: compileQueryIR(query).patt ?? annotationValue,
			group: config.groupId,
		});
	},
});
