import type { CollocationFieldDefinition, CollocationFieldState } from '@/features/form/fields/collocation-field';
import { bool, object, scalar, type PersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';
import { parseCollocationContext } from '@/features/form/model/types/form-output';
import { rawCql, summary } from '@/features/form/model/types/form-query-ir';
import { isBLCollocationType } from '@/types/blacklabtypes';

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

/** @public */
export const collocationController = defineFieldController<'collocation', CollocationFieldDefinition, CollocationControllerConfig>({
	kind: 'collocation',
	createDefaultState,
	persistence: {
		key: () => 'collocations',
		codec: persistenceCodec,
	},
	outputs: ['patt', 'collpatt', 'colltype', 'context', 'within', 'reltype', 'annotation', 'sensitive', 'scorertype'],
	collect(_config, _runtime, state, emit) {
		if (!isBLCollocationType(state.colltype)) return;
		const context = state.colltype === 'proximity' ? parseCollocationContext(state.context) : null;
		if (state.colltype === 'proximity' && context === null) return;

		const patt = state.patt.trim();
		const collpatt = state.collpatt.trim();
		const within = state.within.trim();
		const reltype = state.reltype.trim();
		const annotation = state.annotation.trim();
		const scorertype = state.scorertype.trim();
		if (patt) emit('patt', rawCql(patt));
		if (collpatt) emit('collpatt', rawCql(collpatt));
		emit('colltype', state.colltype);
		if (state.colltype === 'proximity') {
			emit('context', context!);
			if (within) emit('within', within);
		} else if (reltype) emit('reltype', reltype);
		if (annotation) emit('annotation', annotation);
		emit('sensitive', state.sensitive);
		if (scorertype) emit('scorertype', scorertype);
	},
	getResultPreset: () => 'table',
	summarize(_config, runtime, state, emit) {
		const patt = state.patt.trim();
		if (!patt) return;
		for (const entry of [
			summary(runtime.translate.$t('collocations.keywordPattern').toString(), patt, ['patt']),
			summary(runtime.translate.$t('collocations.collocatePattern').toString(), state.collpatt.trim(), ['collpatt']),
			summary(runtime.translate.$t('collocations.type').toString(), runtime.translate.$t(`collocations.types.${state.colltype}`).toString(), ['colltype']),
			summary(runtime.translate.$t('collocations.annotation').toString(), state.annotation, ['annotation']),
		]) {
			if (entry) emit(entry);
		}
	},
});
