import type { CollocationFieldDefinition, CollocationFieldState, CollocationPatternEditorState, CollocationPatternRole, CollocationSimplePatternState } from '@/features/form/fields/collocation-field';
import { createCollocationSimpleFieldNode } from '@/features/form/fields/collocation-field';
import type { QueryBuilderFieldState } from '@/features/form/fields/query-builder-field';
import { combineCqlPatterns, compileCql } from '@/features/form/model/compile/query-artifact';
import { bool, number, object, PersistenceCodec, scalar } from '@/features/form/model/controllers/persistence-codec';
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
import { parseCollocationContext } from '@/features/form/model/types/form-output';
import { isCqlPatternNode, rawCql, summary, type CqlPatternNode } from '@/features/form/model/types/form-query-ir';
import type { BLCollocationType } from '@/types/blacklabtypes';

import { findOption, optionLabel } from '@/shared/utils/options';

/** @public */
export type CollocationControllerConfig = {
	defaultAnnotation: string;
};
type CollocationFieldConfig = FieldControllerProps<FieldControllerConfig<CollocationFieldDefinition, CollocationControllerConfig>>;
type CollocationPersistenceContext = FieldPersistenceContext<CollocationFieldConfig>;
type CollocationPatternCompilerConfig = Pick<CollocationFieldConfig, 'id' | 'createAnnotationField' | 'advancedField'>;

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
		advanced: config.advancedField.controller.createDefaultState(config.advancedField, runtime) as QueryBuilderFieldState,
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
		colltype: 'proximity',
		reltype: '',
	};
}

function collocationPatternToNode(config: CollocationPatternCompilerConfig, runtime: FormRuntimeContext, state: CollocationPatternEditorState, role: CollocationPatternRole): CqlPatternNode | null {
	if (state.mode === 'expert') {
		const cql = state.expert.trim();
		return cql ? rawCql(cql) : null;
	}

	const field = state.mode === 'advanced' ? config.advancedField : createCollocationSimpleFieldNode(config, role, state.simple.annotationId);
	const fieldState = state.mode === 'advanced' ? state.advanced : state.simple.fieldState;
	return combineCqlPatterns(gatherOutput(field, fieldState, runtime, 'patt', isCqlPatternNode), 'and');
}

export function collocationPatternToCql(config: CollocationPatternCompilerConfig, runtime: FormRuntimeContext, state: CollocationPatternEditorState, role: CollocationPatternRole): string {
	const pattern = collocationPatternToNode(config, runtime, state, role);
	return pattern ? (compileCql(pattern) ?? '') : '';
}

const embeddedFieldStateCodec = <State>(field: (context: CollocationPersistenceContext) => CollocationFieldConfig['advancedField'], defaultState: (context: CollocationPersistenceContext) => State) =>
	new PersistenceCodec<State, CollocationPersistenceContext>(
		{
			encode: (state, context) => encodeFieldState(field(context), state, context.runtime) ?? '',
			decode: (payload, context) => (payload ? (restoreFieldState(field(context), payload, context.runtime) as State) : defaultState(context)),
		},
		{ structured: true },
	)
		.default(defaultState)
		.omitWhen((state, context) => encodeFieldState(field(context), state, context.runtime) === null);

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
	const advanced = embeddedFieldStateCodec<QueryBuilderFieldState>(
		context => context.config.advancedField,
		context => context.config.advancedField.controller.createDefaultState(context.config.advancedField, context.runtime) as QueryBuilderFieldState,
	);
	const expert = scalar<CollocationPersistenceContext>()
		.default('')
		.omitWhen(value => !value.trim());
	const codec = object({
		mode: scalar<CollocationPersistenceContext>().mapped({ simple: 's', advanced: 'a', expert: 'e' }).default('simple').at('m'),
		simple: simple.at('s'),
		advanced: advanced.at('a'),
		expert: expert.at('e'),
	});
	return codec
		.default(context => createDefaultPatternState(context.config, context.runtime, role))
		.omitWhen(
			(state, context) =>
				state.mode === 'simple' && simple.encode(state.simple, context) === null && advanced.encode(state.advanced, context) === null && expert.encode(state.expert, context) === null,
		);
}

const contextValue = number<CollocationPersistenceContext>().refine(value =>
	Number.isSafeInteger(value) && value >= 0 ? undefined : 'Collocation context values must be non-negative safe integers.',
);
const collocationType = scalar<CollocationPersistenceContext>().mapped({ proximity: 'proximity', relsources: 'relsources', reltargets: 'reltargets' });
const keywordPattern = patternStateCodec('keyword');
const collocatePattern = patternStateCodec('collocate');

const versionedPersistenceCodec = object({
	version: scalar<CollocationPersistenceContext>()
		.refine(value => (value === '2' ? undefined : `Cannot restore collocation value with unsupported version '${value}'.`))
		.at('v'),
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
	scorertype: scalar<CollocationPersistenceContext>().default('coll-dice').at('st'),
	colltype: collocationType.default('proximity').at('ct'),
	reltype: scalar<CollocationPersistenceContext>().default('').at('r'),
}).transform<CollocationFieldState>({
	encode: state => ({
		version: '2',
		keyword: state.keyword,
		collocateEnabled: state.collocate.enabled,
		collocatePattern: state.collocate.pattern,
		before: state.before,
		after: state.after,
		within: state.within,
		annotation: state.annotation,
		sensitive: state.sensitive,
		scorertype: 'coll-dice',
		colltype: state.colltype,
		reltype: state.reltype,
	}),
	decode: state => ({
		keyword: state.keyword,
		collocate: { enabled: state.collocateEnabled, pattern: state.collocatePattern },
		before: state.before,
		after: state.after,
		within: state.within,
		annotation: state.annotation,
		sensitive: state.sensitive,
		colltype: state.colltype as BLCollocationType,
		reltype: state.reltype,
	}),
});

const legacyPersistenceCodec = object({
	patt: scalar<CollocationPersistenceContext>().default('').atRoot(),
	collpatt: scalar<CollocationPersistenceContext>().default('').at('cp'),
	colltype: collocationType.default('proximity').at('ct'),
	context: scalar<CollocationPersistenceContext>().default('5').at('c'),
	within: scalar<CollocationPersistenceContext>().default('').at('w'),
	reltype: scalar<CollocationPersistenceContext>().default('').at('r'),
	annotation: scalar<CollocationPersistenceContext>()
		.default(({ config }) => config.defaultAnnotation)
		.refine((value, { config }) => (findOption(config.annotationOptions, value) ? undefined : `Cannot restore collocation grouping annotation '${value}' because it is not available.`))
		.at('a'),
	sensitive: bool<CollocationPersistenceContext>().default(false).at('s'),
	scorertype: scalar<CollocationPersistenceContext>().default('coll-dice').at('st'),
});

function legacyPattern(config: CollocationFieldConfig, runtime: FormRuntimeContext, role: CollocationPatternRole, cql: string): CollocationPatternEditorState {
	return {
		...createDefaultPatternState(config, runtime, role),
		mode: cql.trim() ? 'expert' : 'simple',
		expert: cql,
	};
}

const persistenceCodec = new PersistenceCodec<CollocationFieldState, CollocationPersistenceContext>({
	encode: (state, context) => versionedPersistenceCodec.encode(state, context),
	decode: (payload, context) => {
		if (payload == null) return createDefaultState(context.config, context.runtime);
		if (payload.startsWith('v=2')) return versionedPersistenceCodec.decode(payload, context);

		const legacy = legacyPersistenceCodec.decode(payload, context);
		const parsedContext = parseCollocationContext(legacy.context);
		if (parsedContext === null) throw new Error(`Cannot restore invalid collocation context '${legacy.context}'.`);
		const [before, after] = typeof parsedContext === 'number' ? [parsedContext, parsedContext] : parsedContext;
		return {
			keyword: legacyPattern(context.config, context.runtime, 'keyword', legacy.patt),
			collocate: {
				enabled: !!legacy.collpatt.trim(),
				pattern: legacyPattern(context.config, context.runtime, 'collocate', legacy.collpatt),
			},
			before,
			after,
			within: legacy.within,
			annotation: legacy.annotation,
			sensitive: legacy.sensitive,
			colltype: legacy.colltype,
			reltype: legacy.reltype,
		};
	},
});

/** @public */
export const collocationController = defineFieldController<'collocation', CollocationFieldDefinition, CollocationControllerConfig>({
	kind: 'collocation',
	createDefaultState,
	persistence: {
		key: () => 'collocations',
		codec: persistenceCodec,
	},
	outputs: ['patt', 'collpatt', 'colltype', 'context', 'within', 'reltype', 'annotation', 'sensitive'],
	collect(config, runtime, state, emit) {
		if (!Number.isSafeInteger(state.before) || state.before < 0 || !Number.isSafeInteger(state.after) || state.after < 0 || state.before + state.after === 0) return;
		const patt = collocationPatternToNode(config, runtime, state.keyword, 'keyword');
		if (!patt) return;

		emit('patt', patt);
		if (state.collocate.enabled) {
			const collpatt = collocationPatternToNode(config, runtime, state.collocate.pattern, 'collocate');
			if (collpatt) emit('collpatt', collpatt);
		}
		emit('colltype', state.colltype);
		if (state.colltype === 'proximity') {
			emit('context', state.before === state.after ? state.before : [state.before, state.after]);
			if (state.within.trim()) emit('within', state.within.trim());
		} else if (state.reltype.trim()) {
			emit('reltype', state.reltype.trim());
		}
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
