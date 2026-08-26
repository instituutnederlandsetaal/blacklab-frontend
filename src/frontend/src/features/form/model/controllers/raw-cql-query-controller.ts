import type { RawCqlQueryFieldDefinition } from '@/features/form/fields/raw-cql-field';
import { scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';
import { rawCql } from '@/features/form/model/types/form-query-ir';

export const expertQueryController = defineFieldController<'raw-cql-query', RawCqlQueryFieldDefinition>({
	kind: 'raw-cql-query',
	createDefaultState: () => '',
	persistence: {
		key: () => 'query',
		codec: scalar()
			.default('')
			.omitWhen(value => !value.trim()),
	},
	outputs: ['patt'],
	collect(_config, _runtime, state, emit) {
		const cql = state.trim();
		if (cql) emit('patt', rawCql(cql));
	},
	summarize(_config, runtime, state, emit) {
		if (state.trim()) emit({ label: runtime.translate.$t(`search.expert.corpusQueryLanguage`), value: state });
	},
});
