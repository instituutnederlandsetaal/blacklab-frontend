/**
 * Contains the current ui state for the simple/extended/advanced/expert query editors.
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */

import Vue from 'vue';
import { getStoreBuilder } from 'vuex-typex';
import cloneDeep from 'clone-deep';

import { RootState } from '@/store/';
import * as CorpusStore from '@/store/corpus';
import * as UIStore from '@/store/ui';

import { debugLog, debugLogCat } from '@/utils/debug';

import { AnnotationValue } from '@/types/apptypes';
import { CorpusChange } from '@/store/async-loaders';

type ModuleRootState = {
	// Parallel fields (shared between multiple states, e.g. simple, extended, etc.)
	shared: {
		/** Id of the annotated field that is the source we're searching in */
		source: string|null,
		/** Ids of the annotated fields that we're comparing to */
		targets: string[],
		alignBy: string|null,

		/** Selected element in Within widget (extended/advanced) */
		within: string|null,

		/** Attribute values entered in Within widget, if any (extended/advanced) */
		withinAttributes: Record<string, string>,
	},
	simple: {
		annotationValue: AnnotationValue
	},
	extended: {
		annotationValues: {
			// [annotatedFieldId: string]: {
				[annotationId: string]: AnnotationValue
			// }
		},

		splitBatch: boolean,
	},
	advanced: {
		query: string|null,
		targetQueries: string[],
	},
	expert: {
		query: string|null,
		targetQueries: string[],
	},
	concept: string|null, // Jesse
	glosses: string|null, // Jesse
};

// There are three levels of state initialization
// First: the basic state shape (this)
// Then: the basic state shape with the appropriate annotation and filters created
// Finally: the values initialized from the page's url on first load.
const initialState: ModuleRootState = {
	shared: {
		source: null,
		targets: [],
		alignBy: null,
		within: null,
		withinAttributes: {},
	},
	simple: {
		annotationValue: {case: false, id: '', value: '', type: 'text'}
	},
	extended: {
		annotationValues: {},
		splitBatch: false,
	},
	advanced: {
		query: null,
		targetQueries: [],
	},
	expert: {
		query: null,
		targetQueries: [],
	},
	concept: null,
	glosses: null,
};

const namespace = 'patterns';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(initialState));

const getState = b.state();

const get = {
	/** Last submitted properties, these are already filtered to remove empty values, etc */
	activeAnnotations: b.read(state => Object.values(state.extended.annotationValues)/*.flatMap(f => Object.values(f))*/.filter(p => !!p.value), 'activeAnnotations'),

	/** Get the annotation's search value in the extended form */
	annotationValue(annotatedFieldId: string, id: string) {
		return getState().extended.annotationValues/*[annotatedFieldId]*/[id];
	},

	simple: b.read(state => state.simple, 'simple'),

	/** Selected parallel source and target versions. Note that these are the full ids of the annotatedFields (e.g. "contents__nl") */
	shared: b.read(state => state.shared, 'shared'),
};

const privateActions = {
	clear: b.commit(state => Object.assign(state, cloneDeep(initialState)), 'clear'),

	// initFilter: b.commit((state, payload: FilterValue) => Vue.set(state.filters, payload.id, payload), 'filter_init'),
	// NOTE when re-integrating annotatedFieldId this needs to be updated to account.
	initExtendedAnnotation: b.commit((state, payload: AnnotationValue) =>
			Vue.set(state.extended.annotationValues, payload.id, payload), 'annotation_init_extended'),
	initSimpleAnnotation: b.commit((state, payload: ModuleRootState['simple']) => Object.assign<ModuleRootState['simple'],
			ModuleRootState['simple']>(state.simple, payload), 'annotation_init_simple'),
	initShared: b.commit((state, payload: ModuleRootState['shared']) => Vue.set(state, 'shared', payload), 'init_shared'),
};

const setTargetFields = (state: ModuleRootState, payload: string[]): string[] => {
	// sanity check:
	if (payload.find(annotatedFieldId => !CorpusStore.get.parallelAnnotatedFieldsMap()[annotatedFieldId])) {
		console.error('Tried to set target fields to non-existent annotated field, maybe mixup between version and annotatedField');
		return state.shared.targets;
	}

	if (payload && payload.length > 0) {
		while (state.advanced.targetQueries.length < payload.length) {
			state.advanced.targetQueries.push('');
		}
		while (state.expert.targetQueries.length < payload.length) {
			state.expert.targetQueries.push('');
		}
	}
	return Vue.set(state.shared, 'targets', payload);
};

const actions = {
	shared: {
		sourceField: b.commit((state, payload: string|null) => {
			if (payload && !CorpusStore.get.parallelAnnotatedFieldsMap()[payload]) {
				console.error('Tried to set source version to non-existent annotated field. Ignoring');
				return;
			}
			return (state.shared.source = payload);
		}, 'shared_source_version'),
		addTarget: b.commit((state, version: string) => {
			debugLogCat('parallel', `shared.addTargetVersion: Adding ${version}`);
			if (!version) {
				console.warn('tried to add null target version');
				return;
			}
			const payload = state.shared.targets.concat([version]);
			return setTargetFields(state, payload);
		}, 'shared_addTarget'),
		removeTarget: b.commit((state, version: string) => {
			if (!CorpusStore.get.parallelAnnotatedFieldsMap()[version]) {
				console.error('Tried to remove non-existent target version');
				return;
			}

			debugLogCat('parallel', `parallelFields.removeTargetVersion: Removing ${version}`);
			const index = state.shared.targets.indexOf(version);
			if (index < 0) {
				console.warn('tried to remove non-existent target version');
				return;
			}
			state.shared.targets.splice(index, 1);
			if (state.advanced.targetQueries.length > index)
				state.advanced.targetQueries.splice(index, 1);
			if (state.expert.targetQueries.length > index)
				state.expert.targetQueries.splice(index, 1);
		}, 'parallelFields_removeTarget'),
		targetFields: b.commit(setTargetFields, 'parallelFields_targets'),
		alignBy: b.commit((state, payload: string|null) => {
			return (state.shared.alignBy = payload == null ? UIStore.getState().search.shared.alignBy.defaultValue : payload);
		}, 'shared_align_by'),
		within: b.commit((state, payload: string|null) => {
			return (state.shared.within = payload);
		}, 'shared_within'),
		withinAttributes: b.commit((state, payload: Record<string, string>) => {
			return (state.shared.withinAttributes = payload);
		}, 'shared_within_attributes'),
		reset: b.commit(state => {
			const defaultSourceField = CorpusStore.get.parallelAnnotatedFields()[0]?.id;
			debugLogCat('shared', `shared.reset: Selecting default source version ${defaultSourceField}`);
			state.shared.source = defaultSourceField;
			state.shared.targets = [];
			const v = UIStore.getState().search.shared.alignBy.defaultValue;
			state.shared.alignBy = v;
			state.shared.within = null;
			state.shared.withinAttributes = {};
		}, 'shared_reset'),
	},
	simple: {
		annotation: b.commit((state, {id, type, ...safeValues}: Partial<AnnotationValue>&{id: string}) => {
			// Never overwrite annotatedFieldId or type, even when they're submitted through here.
			Object.assign(state.simple.annotationValue, safeValues);
		}, 'simple_annotation'),
		reset: b.commit(state => {
			state.simple.annotationValue.value = '';
			state.simple.annotationValue.case = false;
		}, 'simple_reset'),
	},
	extended: {
		annotation: b.commit((state, {id, type, ...safeValues}: Partial<AnnotationValue>&{id: string}) => {
			// Never overwrite annotatedFieldId or type, even when they're submitted through here.
			Object.assign(state.extended.annotationValues[id], safeValues);
		}, 'extended_annotation'),
		splitBatch: b.commit((state, payload: boolean) => state.extended.splitBatch = payload, 'extended_split_batch'),
		reset: b.commit(state => {
			Object.values(state.extended.annotationValues).forEach(annot => {
				annot.value = '';
				annot.case = false;
			});
			state.extended.splitBatch = false;
		}, 'extended_reset'),
	},
	advanced: {
		query: b.commit((state, payload: string|null) => {
			return (state.advanced.query = payload);
		}, 'advanced_query'),
		changeTargetQuery: b.commit((state, {index, value}: {index: number, value: string}) => {
			if (index >= state.advanced.targetQueries.length) {
				console.error('Tried to set target query for non-existent index');
				return;
			}
			Vue.set(state.advanced.targetQueries, index, value);
		}, 'advanced_change_target_query'),
		targetQueries: b.commit((state, payload: string[]) => {
			return (state.advanced.targetQueries = [...payload]); // copy, don't reference
		}, 'advanced_target_queries'),
		reset: b.commit(state => {
			state.advanced.query = null
			state.advanced.targetQueries = [];
		}, 'advanced_reset'),
	},
	expert: {
		query: b.commit((state, payload: string|null) => {
			return (state.expert.query = payload);
		}, 'expert_query'),
		changeTargetQuery: b.commit((state, {index, value}: {index: number, value: string}) => {
			if (index >= state.expert.targetQueries.length) {
				console.error('Tried to set target query for non-existent index');
				return;
			}
			Vue.set(state.expert.targetQueries, index, value);
		}, 'expert_change_target_query'),
		targetQueries: b.commit((state, payload: string[]) => {
			return (state.expert.targetQueries = [...payload]); // copy, don't reference
		}, 'expert_target_queries'),
		reset: b.commit(state => {
			state.expert.query = null;
			state.expert.targetQueries = [];
		}, 'expert_reset'),
	},
	concept: b.commit((state, payload: string|null) =>state.concept = payload, 'concept'),
	glosses: b.commit((state, payload: string|null) =>state.glosses = payload, 'glosses'),

	reset: b.commit(state => {
		actions.shared.reset();
		actions.simple.reset();
		actions.extended.reset();
		actions.advanced.reset();
		actions.expert.reset();
		state.concept = null;
		state.glosses = null;
	}, 'reset'),

	replace: b.commit((state, payload: ModuleRootState) => {
		actions.shared.reset();
		actions.shared.alignBy(payload.shared.alignBy);
		actions.shared.sourceField(payload.shared.source);
		actions.shared.targetFields(payload.shared.targets);
		state.shared.within = payload.shared.within;
		state.shared.withinAttributes = payload.shared.withinAttributes;

		actions.simple.reset();
		actions.simple.annotation(payload.simple.annotationValue);

		actions.extended.reset();
		state.extended.splitBatch = payload.extended.splitBatch;
		Object.values(payload.extended.annotationValues).forEach(actions.extended.annotation);

		actions.advanced.reset();
		actions.advanced.query(payload.advanced.query);
		actions.advanced.targetQueries(payload.advanced.targetQueries);

		actions.expert.reset();
		actions.expert.query(payload.expert.query);
		actions.expert.targetQueries(payload.expert.targetQueries);

		actions.concept(payload.concept);
		actions.glosses(payload.glosses);
	}, 'replace'),
};

/** We need to call some function from the module before creating the root store or this module won't be evaluated (e.g. none of this code will run) */
const init = (state: CorpusChange) => {
	if (!state.index) {
		Object.assign(getState(), cloneDeep(initialState));
		return;
	}

	const parallelFields = CorpusStore.get.parallelAnnotatedFields();
	const defaultParallelVersion = parallelFields[0]?.id || '';

	debugLogCat('parallel', `init: Set default parallel version: ${defaultParallelVersion}`);
	privateActions.initShared({
		source: defaultParallelVersion,
		targets: [],
		alignBy: null,
		within: null,
		withinAttributes: {},
	})
	CorpusStore.get.allAnnotations().forEach(({id, uiType}) =>
		privateActions.initExtendedAnnotation({
			id,
			value: '',
			case: false,
			type: uiType
		})
	);
	privateActions.initSimpleAnnotation({
		annotationValue: {
			id: CorpusStore.get.firstMainAnnotation().id,
			value: '',
			case: false,
			type: CorpusStore.get.firstMainAnnotation().uiType,
		}
	});

	debugLogCat('init', 'Finished initializing pattern module state shape');
};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	initialState as defaults
};
