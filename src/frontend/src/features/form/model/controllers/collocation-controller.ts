import type { CollocationFieldDefinition, CollocationFieldState } from '@/features/form/fields/collocation-field';
import { bool, object, scalar, type PersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';
import { rawCql, summary } from '@/features/form/model/types/form-query-ir';

/** @public */
export type CollocationControllerConfig = {
	defaultAnnotation: string;
};
type CollocationFieldConfig = FieldControllerConfig<CollocationFieldDefinition, CollocationControllerConfig>;

function createDefaultState(config: CollocationFieldConfig): CollocationFieldState {
	return {
		patt: '',
		collpatt: '',
		colltype: 'proximity',
		context: '5',
		within: '',
		reltype: '',
		annotation: config.defaultAnnotation,
		sensitive: false,
		scorertype: 'coll-dice',
	};
}

const persistenceCodec = object({
	patt: scalar().default('').atRoot(),
	collpatt: scalar().default('').at('cp'),
	colltype: scalar().default('proximity').at('ct'),
	context: scalar().default('5').at('c'),
	within: scalar().default('').at('w'),
	reltype: scalar().default('').at('r'),
	annotation: scalar<FieldPersistenceContext<CollocationFieldConfig>>()
		.default(({ config }) => config.defaultAnnotation)
		.at('a'),
	sensitive: bool().default(false).at('s'),
	scorertype: scalar().default('coll-dice').at('st'),
}) as unknown as PersistenceCodec<CollocationFieldState, FieldPersistenceContext<CollocationFieldConfig>>;

/**
 * Retained while collocation output collection is being redesigned.
 * Only the ordinary pattern contribution is exposed until the collocation target is available.
 * @public
 */
export const collocationController = defineFieldController<'collocation', CollocationFieldDefinition, CollocationControllerConfig>({
	kind: 'collocation',
	createDefaultState,
	persistence: {
		key: () => 'collocations',
		codec: persistenceCodec,
	},
	outputs: ['patt'],
	collect(_config, _runtime, state, emit) {
		const patt = state.patt.trim();
		if (patt) emit('patt', rawCql(patt));
	},
	summarize(_config, runtime, state, emit) {
		const patt = state.patt.trim();
		if (!patt) return;
		for (const entry of [
			summary(runtime.translate.$t('collocations.keywordPattern').toString(), patt),
			summary(runtime.translate.$t('collocations.collocatePattern').toString(), state.collpatt),
			summary(runtime.translate.$t('collocations.type').toString(), runtime.translate.$t(`collocations.types.${state.colltype}`).toString()),
			summary(runtime.translate.$t('collocations.annotation').toString(), state.annotation),
		]) {
			if (entry) emit(entry);
		}
	},
});
