import { createDefaultCqlQueryBuilderData } from '@/features/cql-query-builder/model';
import type { CollocationFieldDefinition, CollocationFieldState, CollocationPatternEditorState, CollocationPatternRole, CollocationSimplePatternState } from '@/features/form/fields/collocation-field';
import { createCollocationSimpleFieldNode } from '@/features/form/fields/collocation-field';
import type { QueryBuilderFieldState } from '@/features/form/fields/query-builder-field';
import { combineCqlPatterns, compileCql } from '@/features/form/model/compile/query-artifact';
import { bool, number, object, PersistenceCodec, scalar } from '@/features/form/model/controllers/persistence-codec';
import { queryBuilderPersistenceCodec, queryBuilderStateToPattern } from '@/features/form/model/controllers/query-builder-controller';
import {
	defineFieldController,
	encodeFieldState,
	gatherOutput,
	restoreFieldState,
	type FieldControllerConfig,
	type FieldControllerProps,
	type FieldPersistenceContext,
	type FormRuntimeContext,
} from '@/features/form/model/types/form-controllers';
import { isCqlPatternNode, rawCql, summary, type CqlPatternNode } from '@/features/form/model/types/form-query-ir';

import { findOption, optionLabel } from '@/shared/utils/options';

/** @public */
export type CollocationControllerConfig = {
	defaultAnnotation: string;
};
type CollocationFieldConfig = FieldControllerProps<FieldControllerConfig<CollocationFieldDefinition, CollocationControllerConfig>>;
type CollocationPersistenceContext = FieldPersistenceContext<CollocationFieldConfig>;
type CollocationPatternCompilerConfig = Pick<CollocationFieldConfig, 'id' | 'createAnnotationField'>;

function createDefaultSimpleState(config: CollocationFieldConfig, runtime: FormRuntimeContext, role: CollocationPatternRole): CollocationSimplePatternState {
	const field = createCollocationSimpleFieldNode(config, role, config.defaultAnnotation);
	return {
		annotationId: config.defaultAnnotation,
		fieldState: field.controller.createDefaultState(field, runtime),
	};
}

function createDefaultPatternState(config: CollocationFieldConfig, runtime: FormRuntimeContext, role: CollocationPatternRole): CollocationPatternEditorState {
	return {
		mode: 'simple',
		simple: createDefaultSimpleState(config, runtime, role),
		advanced: createDefaultCqlQueryBuilderData(config.queryBuilderOptions.defaultAnnotationId),
		expert: '',
	};
}

function createDefaultState(config: CollocationFieldConfig, runtime: FormRuntimeContext): CollocationFieldState {
	return {
		keyword: createDefaultPatternState(config, runtime, 'keyword'),
		collocate: {
			enabled: false,
			pattern: createDefaultPatternState(config, runtime, 'collocate'),
		},
		before: 5,
		after: 5,
		within: config.defaultWithin,
		annotation: config.defaultAnnotation,
		sensitive: false,
	};
}

function collocationPatternToNode(config: CollocationPatternCompilerConfig, runtime: FormRuntimeContext, state: CollocationPatternEditorState, role: CollocationPatternRole): CqlPatternNode | null {
	if (state.mode === 'expert') {
		const cql = state.expert.trim();
		return cql ? rawCql(cql) : null;
	}

	if (state.mode === 'advanced') return queryBuilderStateToPattern(state.advanced);
	const field = createCollocationSimpleFieldNode(config, role, state.simple.annotationId);
	return combineCqlPatterns(gatherOutput(field, state.simple.fieldState, runtime, 'patt', isCqlPatternNode), 'and');
}

export function collocationPatternToCql(config: CollocationPatternCompilerConfig, runtime: FormRuntimeContext, state: CollocationPatternEditorState, role: CollocationPatternRole): string {
	const pattern = collocationPatternToNode(config, runtime, state, role);
	return pattern ? (compileCql(pattern) ?? '') : '';
}

const advancedStateCodec = new PersistenceCodec<QueryBuilderFieldState, CollocationPersistenceContext>(
	{
		encode: (state, { config }) => queryBuilderPersistenceCodec.encode(state, { config: { options: config.queryBuilderOptions } }),
		decode: (payload, { config }) => queryBuilderPersistenceCodec.decode(payload, { config: { options: config.queryBuilderOptions } }),
	},
	{ structured: true },
);

function simpleStateCodec(role: CollocationPatternRole) {
	const wireCodec = object({
		annotationId: scalar<CollocationPersistenceContext>().atRoot(),
		encodedState: scalar<CollocationPersistenceContext>().default('').at('s'),
	});
	return wireCodec
		.transform<CollocationSimplePatternState>({
			encode(state, context) {
				const field = createCollocationSimpleFieldNode(context.config, role, state.annotationId);
				return {
					annotationId: state.annotationId,
					encodedState: encodeFieldState(field, state.fieldState, context.runtime) ?? '',
				};
			},
			decode(state, context) {
				const field = createCollocationSimpleFieldNode(context.config, role, state.annotationId);
				return {
					annotationId: state.annotationId,
					fieldState: state.encodedState ? restoreFieldState(field, state.encodedState, context.runtime) : field.controller.createDefaultState(field, context.runtime),
				};
			},
		})
		.default(context => createDefaultSimpleState(context.config, context.runtime, role))
		.omitWhen((state, context) => {
			if (state.annotationId !== context.config.defaultAnnotation) return false;
			const field = createCollocationSimpleFieldNode(context.config, role, state.annotationId);
			return encodeFieldState(field, state.fieldState, context.runtime) === null;
		})
		.refine((state, { config }) =>
			findOption(config.annotationOptions, state.annotationId) ? undefined : `Cannot restore collocation annotation '${state.annotationId}' because it is not available.`,
		);
}

function patternStateCodec(role: CollocationPatternRole) {
	const simple = simpleStateCodec(role);
	const expert = scalar<CollocationPersistenceContext>()
		.default('')
		.omitWhen(value => !value.trim());
	const codec = object({
		mode: scalar<CollocationPersistenceContext>().mapped({ simple: 's', advanced: 'a', expert: 'e' }).default('simple').at('m'),
		simple: simple.at('s'),
		advanced: advancedStateCodec.at('a'),
		expert: expert.at('e'),
	});
	return codec.default(context => createDefaultPatternState(context.config, context.runtime, role)).omitWhen((state, context) => codec.encode(state, context) === '');
}

const contextValue = number<CollocationPersistenceContext>().refine(value =>
	Number.isSafeInteger(value) && value >= 0 ? undefined : 'Collocation context values must be non-negative safe integers.',
);
const keywordPattern = patternStateCodec('keyword');
const collocatePattern = patternStateCodec('collocate');

const stateCodec = object({
	keyword: keywordPattern.at('q'),
	collocateEnabled: bool<CollocationPersistenceContext>().default(false).at('ce'),
	collocatePattern: collocatePattern.at('cp'),
	before: contextValue.default(5).at('b'),
	after: contextValue.default(5).at('d'),
	within: scalar<CollocationPersistenceContext>()
		.default(({ config }) => config.defaultWithin)
		.at('w'),
	annotation: scalar<CollocationPersistenceContext>()
		.default(({ config }) => config.defaultAnnotation)
		.refine((value, { config }) => (findOption(config.annotationOptions, value) ? undefined : `Cannot restore collocation grouping annotation '${value}' because it is not available.`))
		.at('a'),
	sensitive: bool<CollocationPersistenceContext>().default(false).at('s'),
}).transform<CollocationFieldState>({
	encode: state => ({ ...state, collocateEnabled: state.collocate.enabled, collocatePattern: state.collocate.pattern }),
	decode: ({ collocateEnabled, collocatePattern, ...state }) => ({
		...state,
		collocate: { enabled: collocateEnabled, pattern: collocatePattern },
	}),
});
const persistenceCodec = stateCodec.default(context => createDefaultState(context.config, context.runtime)).omitWhen((state, context) => stateCodec.encode(state, context) === '');

/** @public */
export const collocationController = defineFieldController<'collocation', CollocationFieldDefinition, CollocationControllerConfig>({
	kind: 'collocation',
	createDefaultState,
	persistence: {
		key: () => 'collocations',
		codec: persistenceCodec,
	},
	outputs: ['patt', 'collpatt', 'colltype', 'context', 'within', 'annotation', 'sensitive'],
	collect(config, runtime, state, emit) {
		if (!Number.isSafeInteger(state.before) || state.before < 0 || !Number.isSafeInteger(state.after) || state.after < 0 || state.before + state.after === 0) return;
		const patt = collocationPatternToNode(config, runtime, state.keyword, 'keyword');
		if (!patt) return;

		emit('patt', patt);
		if (state.collocate.enabled) {
			const collpatt = collocationPatternToNode(config, runtime, state.collocate.pattern, 'collocate');
			if (collpatt) emit('collpatt', collpatt);
		}
		emit('colltype', 'proximity');
		emit('context', state.before === state.after ? state.before : [state.before, state.after]);
		if (state.within.trim()) emit('within', state.within.trim());
		if (state.annotation.trim()) emit('annotation', state.annotation.trim());
		emit('sensitive', state.sensitive);
	},
	getResultPreset: () => 'table',
	summarize(config, runtime, state, emit) {
		const patt = collocationPatternToCql(config, runtime, state.keyword, 'keyword');
		if (!patt) return;
		const collpatt = state.collocate.enabled ? collocationPatternToCql(config, runtime, state.collocate.pattern, 'collocate') : '';
		const collocateDescription = collpatt || runtime.translate.$t('collocations.anyCollocate').toString();
		const collocateLabel = runtime.translate.$t(collpatt ? 'collocations.collocatePattern' : 'collocations.collocates').toString();
		const selectedAnnotation = findOption(config.annotationOptions, state.annotation);
		for (const entry of [
			summary(runtime.translate.$t('collocations.keywordPattern').toString(), patt, ['patt']),
			summary(collocateLabel, collocateDescription, ['collpatt']),
			summary(runtime.translate.$t('collocations.context').toString(), `L${state.before}/R${state.after}`, ['context']),
			summary(runtime.translate.$t('collocations.within').toString(), state.within, ['within']),
			summary(runtime.translate.$t('collocations.annotation').toString(), selectedAnnotation ? optionLabel(selectedAnnotation) : state.annotation, ['annotation']),
		]) {
			if (entry) emit(entry);
		}
	},
});
