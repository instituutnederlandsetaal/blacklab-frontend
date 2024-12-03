/**
 * Contains the current ui state for the simple/extended/advanced/expert query editors.
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */

import Vue from 'vue';
import { getStoreBuilder } from 'vuex-typex';
import cloneDeep from 'clone-deep';

import { RootState } from '@/store/search/';
import * as CorpusStore from '@/store/search/corpus';
import * as UIStore from '@/store/search/ui';

import { debugLog, debugLogCat } from '@/utils/debug';

import { AnnotationValue } from '@/types/apptypes';

type ModuleRootState = {
	// Parallel fields (shared between multiple states, e.g. simple, extended, etc.)
	parallelFields: {
		/** Id of the annotated field that is the source we're searching in */
		source: string|null,
		/** Ids of the annotated fields that we're comparing to */
		targets: string[],
		alignBy: string|null,
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
		within: string|null,
		withinAttributes: Record<string, string>,
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
const defaults: ModuleRootState = {
	parallelFields: {
		source: null,
		targets: [],
		alignBy: null,
	},
	simple: {
		annotationValue: {case: false, id: '', value: '', type: 'text'}
	},
	extended: {
		annotationValues: {},
		within: null,
		withinAttributes: {},
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
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults));

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
	parallelAnnotatedFields: b.read(state => state.parallelFields, 'parallelFields'),
};

const privateActions = {
	// initFilter: b.commit((state, payload: FilterValue) => Vue.set(state.filters, payload.id, payload), 'filter_init'),
	// NOTE when re-integrating annotatedFieldId this needs to be updated to account.
	initExtendedAnnotation: b.commit((state, payload: AnnotationValue) =>
			Vue.set(state.extended.annotationValues, payload.id, payload), 'annotation_init_extended'),
	initSimpleAnnotation: b.commit((state, payload: ModuleRootState['simple']) => Object.assign<ModuleRootState['simple'],
			ModuleRootState['simple']>(state.simple, payload), 'annotation_init_simple'),
	initParallel: b.commit((state, payload: ModuleRootState['parallelFields']) => Object.assign<ModuleRootState['parallelFields'],
			ModuleRootState['parallelFields']>(state.parallelFields, payload), 'parallelFiels_init'),
};

const setTargetFields = (state: ModuleRootState, payload: string[]): string[] => {
	// sanity check:
	if (payload.find(annotatedFieldId => !CorpusStore.get.parallelAnnotatedFieldsMap()[annotatedFieldId])) {
		console.error('Tried to set target fields to non-existent annotated field, maybe mixup between version and annotatedField');
		return state.parallelFields.targets;
	}

	if (payload && payload.length > 0) {
		while (state.advanced.targetQueries.length < payload.length) {
			state.advanced.targetQueries.push('');
		}
		while (state.expert.targetQueries.length < payload.length) {
			state.expert.targetQueries.push('');
		}
	}
	return Vue.set(state.parallelFields, 'targets', payload);
};

const actions = {
	parallelFields: {
		sourceField: b.commit((state, payload: string|null) => {
			if (payload && !CorpusStore.get.parallelAnnotatedFieldsMap()[payload]) {
				console.error('Tried to set source version to non-existent annotated field. Ignoring');
				return;
			}
			return (state.parallelFields.source = payload);
		}, 'parallelFields_source_version'),
		addTarget: b.commit((state, version: string) => {
			debugLogCat('parallel', `parallelFields.addTargetVersion: Adding ${version}`);
			if (!version) {
				console.warn('tried to add null target version');
				return;
			}
			const payload = state.parallelFields.targets.concat([version]);
			return setTargetFields(state, payload);
		}, 'parallelFields_addTarget'),
		removeTarget: b.commit((state, version: string) => {
			if (!CorpusStore.get.parallelAnnotatedFieldsMap()[version]) {
				console.error('Tried to remove non-existent target version');
				return;
			}

			debugLogCat('parallel', `parallelFields.removeTargetVersion: Removing ${version}`);
			const index = state.parallelFields.targets.indexOf(version);
			if (index < 0) {
				console.warn('tried to remove non-existent target version');
				return;
			}
			state.parallelFields.targets.splice(index, 1);
			if (state.advanced.targetQueries.length > index)
				state.advanced.targetQueries.splice(index, 1);
			if (state.expert.targetQueries.length > index)
				state.expert.targetQueries.splice(index, 1);
		}, 'parallelFields_removeTarget'),
		targetFields: b.commit(setTargetFields, 'parallelFields_targets'),
		alignBy: b.commit((state, payload: string|null) => {
			return (state.parallelFields.alignBy = payload == null ? UIStore.getState().search.shared.alignBy.defaultValue : payload);
		}, 'parallelFields_align_by'),
		reset: b.commit(state => {
			const defaultSourceField = CorpusStore.get.parallelAnnotatedFields()[0]?.id;
			debugLogCat('parallel', `parallelFields.reset: Selecting default source version ${defaultSourceField}`);
			state.parallelFields.source = defaultSourceField;
			state.parallelFields.targets = [];
			const v = UIStore.getState().search.shared.alignBy.defaultValue;
			state.parallelFields.alignBy = v;
		}, 'parallelFields_reset'),
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
		within: b.commit((state, payload: string|null) => {
			if (payload !== state.extended.within) {
				state.extended.within = payload;
				state.extended.withinAttributes = {};
			}
		}, 'extended_within'),
		withinAttributes: b.commit((state, payload: Record<string, string>) => {
			state.extended.withinAttributes = payload;
		}, 'extended_within_attributes'),
		setWithinAttribute: b.commit((state, payload: {name: string, value: string}) => {
			if (payload.value === '' || payload.value === null || payload.value === undefined)
				delete state.extended.withinAttributes[payload.name];
			state.extended.withinAttributes[payload.name] = payload.value;
		}, 'extended_set_within_attribute'),
		splitBatch: b.commit((state, payload: boolean) => state.extended.splitBatch = payload, 'extended_split_batch'),
		reset: b.commit(state => {
			Object.values(state.extended.annotationValues).forEach(annot => {
				annot.value = '';
				annot.case = false;
			});
			state.extended.within = null;
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
		actions.simple.reset();
		actions.extended.reset();
		actions.advanced.reset();
		actions.expert.reset();
		state.concept = null;
		state.glosses = null;
	}, 'reset'),

	replace: b.commit((state, payload: ModuleRootState) => {
		actions.parallelFields.reset();
		actions.parallelFields.alignBy(payload.parallelFields.alignBy);
		actions.parallelFields.sourceField(payload.parallelFields.source);
		actions.parallelFields.targetFields(payload.parallelFields.targets);

		actions.simple.reset();
		actions.simple.annotation(payload.simple.annotationValue);

		actions.extended.reset();
		actions.extended.within(payload.extended.within);
		actions.extended.withinAttributes(payload.extended.withinAttributes);
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
const init = () => {
	const parallelFields = CorpusStore.get.parallelAnnotatedFields();

	const defaultParallelVersion = parallelFields[0]?.id || '';
	debugLogCat('parallel', `init: Set default parallel version: ${defaultParallelVersion}`);
	privateActions.initParallel({
		source: defaultParallelVersion,
		targets: [],
		alignBy: null,
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

	debugLog('Finished initializing pattern module state shape');
};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults
};
