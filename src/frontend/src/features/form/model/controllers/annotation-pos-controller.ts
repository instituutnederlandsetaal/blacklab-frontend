import { toValue } from 'vue';

import type { AnnotationPosFieldDefinition, AnnotationPosFieldState } from '@/features/form/fields/annotation-pos-field';
import { compileCql } from '@/features/form/model/compile/query-artifact';
import { array, record, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';
import { annotation, booleanNode, type CqlPatternNode } from '@/features/form/model/types/form-query-ir';

const persistenceCodec = record(array(scalar())).default({});

function statePattern(state: AnnotationPosFieldState) {
	return booleanNode(
		'and',
		Object.entries(state)
			.filter(([, values]) => values.length)
			.map(([annotationId, values]) => annotation(annotationId, 'literal', values)!),
	) as CqlPatternNode | null;
}

export const annotationPosController = defineFieldController<'annotation-pos', AnnotationPosFieldDefinition>({
	kind: 'annotation-pos',
	createDefaultState: () => ({}),
	persistence: { key: config => config.annotationId, codec: persistenceCodec },
	outputs: ['patt'],
	collect(config, _runtime, state, emit) {
		const pattern = statePattern(state);
		if (pattern) emit('patt', pattern);
	},
	summarize(config, _runtime, state, emit) {
		const [annotationValue] = state[config.annotationId] ?? [];
		if (!annotationValue) return;
		const pattern = statePattern(state);
		emit({ label: toValue(config.displayName) ?? config.annotationId, value: (pattern && compileCql(pattern)) || annotationValue, group: config.groupId });
	},
});
