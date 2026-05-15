/**
 * Contains the current ui state for the simple/extended/advanced/expert query editors.
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */

import { useMemoize } from '@vueuse/core';
import cloneDeep from 'clone-deep';
import { reactive, ref } from 'vue';

import type { CorpusChange } from '@/app/plugins/installCorpusData';
import * as CorpusStore from '@/features/corpus/store/corpus-store';
import * as UIStore from '@/pages/search/config/ui-customization-store';
import { debugLogCat } from '@/shared/debug/debug';
import type { AnnotationValue } from '@/types/apptypes';
import type { CqlQueryBuilderData } from '@/widgets/cql-query-builder/model';

type ModuleRootState = {
	// Parallel fields (shared between multiple states, e.g. simple, extended, etc.)
	shared: {
		/** Id of the annotated field that is the source we're searching in. Note that this is the full id of the annotatedField (e.g. "contents__nl") */
		source: string;
		/** Ids of the annotated fields that we're comparing to. Note that these are the full ids of the annotatedFields (e.g. "contents__nl") */
		targets: string[];
		/** tag to align by, e.g. <l>, or <p> or <s> for line, paragraph, or sentence (though these are just fictional examples for common usages, real values can be anything, depending on the corpus/dataset. */
		alignBy: string | null;

		/** Selected element in Within widget (extended/advanced). Uses the same set of elements as the alignBy, e.g. <l>, <p>, <s> */
		within: string | null;

		/** Attribute values entered in Within widget, if any (extended/advanced). E.g. 'id' for a <s> sentence.  */
		withinAttributes: Record<string, string>;
	};
	/** Simple search only allows searching on a single annotation. Entered value stored in a fixed field: 'annotationValue' */
	simple: {
		annotationValue: AnnotationValue;
	};
	/** Extended search allows searching on multiple annotations. Entered values are stored in a map: 'annotationValues' */
	extended: {
		annotationValues: {
			[annotationId: string]: AnnotationValue;
		};
	};
	advanced: {
		query: CqlQueryBuilderData;
		targetQueries: CqlQueryBuilderData[];
	};
	expert: {
		gapValue: string | null;
		query: string | null;
		targetQueries: string[];
	};
};

// There are three levels of state initialization
// First: the basic state shape (this)
// Then: the basic state shape with the appropriate annotation and filters created
// Finally: the values initialized from the page's url on first load.
const initialState: ModuleRootState = {
	/**
	 * State for 'within' and source/target (parallel) querying.
	 * This is shared between the different pattern modes (simple/extended/advanced/expert),
	 * mostly for simplicity.
	 * From a UX standpoint it also doesn't really make a difference whether you select your parallel versions in the simple or advanced form,
	 * it's all part of the same "parallel search" feature, so it makes sense to keep this state shared.
	 */
	shared: {
		source: '__should_be_initialized__',
		targets: [],
		alignBy: null,
		within: null,
		withinAttributes: {},
	},
	simple: {
		annotationValue: { case: false, id: '', value: '', type: 'text' },
	},
	extended: {
		annotationValues: {},
	},
	advanced: {
		query: { tokens: [], within: '' },
		targetQueries: [],
	},
	expert: {
		gapValue: null,
		query: null,
		targetQueries: [],
	},
};

const state = reactive(structuredClone(initialState));
const getState = () => state;

const get = {
	/** Last submitted properties, these are already filtered to remove empty values, etc */
	activeAnnotations: useMemoize(() => Object.values(state.extended.annotationValues).filter(p => !!p.value)),
	/** Get the annotation's search value in the extended form */
	annotationValue: (annotatedFieldId: string, id: string) => state.extended.annotationValues[id],
	simple: () => state.simple,
	/** Selected parallel source and target versions. Note that these are the full ids of the annotatedFields (e.g. "contents__nl") */
	shared: () => state.shared,
	gapValue: () => state.expert.gapValue,
};

const privateActions = {
	clear: () => Object.assign(state, structuredClone(initialState)),

	initExtendedAnnotation: (payload: AnnotationValue) => (state.extended.annotationValues[payload.id] = payload),
	initSimpleAnnotation: (payload: ModuleRootState['simple']) => Object.assign(state.simple, structuredClone(payload)),
	initShared: (payload: ModuleRootState['shared']) => Object.assign(state.shared, structuredClone(payload)),
};

const actions = {
	shared: {
		sourceField: (payload: string) => {
			if (payload && !CorpusStore.get.parallelAnnotatedFieldsMap()[payload]) {
				console.error(`Tried to set source version to non-existent or non-parallel annotated field ('${payload}'). Ignoring`);
				return;
			}
			state.shared.source = payload;
		},
		addTarget: (version: string) => {
			debugLogCat('parallel', `shared.addTargetVersion: Adding '${version}'`);
			if (!version) {
				console.warn('Tried to add null target version');
				return;
			}
			actions.shared.targetFields([...state.shared.targets, version]);
		},
		removeTarget: (version: string) => {
			if (!CorpusStore.get.parallelAnnotatedFieldsMap()[version]) {
				console.error(`Tried to remove non-existent or non-parallel target version ('${version}')`);
				return;
			}

			debugLogCat('parallel', `parallelFields.removeTargetVersion: Removing '${version}'`);
			const index = state.shared.targets.indexOf(version);
			if (index < 0) {
				console.warn(`Tried to remove a target version ('${version}') that is not currently selected`);
				return;
			}
			state.shared.targets.splice(index, 1);
			if (state.advanced.targetQueries.length > index) state.advanced.targetQueries.splice(index, 1);
			if (state.expert.targetQueries.length > index) state.expert.targetQueries.splice(index, 1);
		},
		/** Replace the entire set of selected target fields at once. */
		targetFields: (payload: string[]) => {
			// sanity check:
			const nonexistentFields = payload.filter(annotatedFieldId => !CorpusStore.get.parallelAnnotatedFieldsMap()[annotatedFieldId]);
			if (nonexistentFields.length) {
				console.error(`Tried to set target fields to non-existent annotated field(s): ${nonexistentFields}, maybe mixup between version and annotatedField`);
				return state.shared.targets;
			}

			if (payload?.length) {
				while (state.advanced.targetQueries.length < payload.length) {
					state.advanced.targetQueries.push({ tokens: [], within: '' });
				}
				while (state.expert.targetQueries.length < payload.length) {
					state.expert.targetQueries.push('');
				}
			}
			state.shared.targets = payload;
		},
		alignBy: (payload: string | null) => (state.shared.alignBy = payload ?? UIStore.getState().search.shared.alignBy.defaultValue),
		within: (payload: string | null) => (state.shared.within = payload),
		withinAttributes: (payload: Record<string, string>) => (state.shared.withinAttributes = payload),
		reset: () => {
			state.shared.source = initialState.shared.source;
			state.shared.targets = [];
			state.shared.alignBy = UIStore.getState().search.shared.alignBy.defaultValue;
			state.shared.within = null;
			state.shared.withinAttributes = {};
		},
	},
	simple: {
		annotation: ({ id, type, ...safeValues }: Partial<AnnotationValue> & { id: string }) => {
			// Never overwrite annotatedFieldId or type, even when they're submitted through here.
			Object.assign(state.simple.annotationValue, safeValues);
		},
		reset: () => {
			state.simple.annotationValue.value = '';
			state.simple.annotationValue.case = false;
		},
	},
	extended: {
		annotation: ({ id, type, ...safeValues }: Partial<AnnotationValue> & { id: string }) => {
			// Never overwrite annotatedFieldId or type, even when they're submitted through here.
			Object.assign(state.extended.annotationValues[id], safeValues);
		},
		reset: () => {
			Object.values(state.extended.annotationValues).forEach(annot => {
				annot.value = '';
				annot.case = false;
			});
		},
	},
	advanced: {
		query: (payload: CqlQueryBuilderData | null) => (state.advanced.query = payload || structuredClone(initialState.advanced.query)),
		changeTargetQuery: ({ index, value }: { index: number; value: CqlQueryBuilderData }) => {
			if (index >= state.advanced.targetQueries.length) {
				console.error('Tried to set target query for non-existent index');
				return;
			}
			state.advanced.targetQueries[index] = value;
		},
		targetQueries: (payload: CqlQueryBuilderData[]) => (state.advanced.targetQueries = structuredClone(payload)), // copy, don't reference
		reset: () => (state.advanced = structuredClone(initialState.advanced)),
	},
	expert: {
		query: (payload: string | null) => (state.expert.query = payload),
		changeTargetQuery: ({ index, value }: { index: number; value: string }) => {
			if (index >= state.expert.targetQueries.length) {
				console.error('Tried to set target query for non-existent index');
				return;
			}
			state.expert.targetQueries[index] = value;
		},
		targetQueries: (payload: string[]) => (state.expert.targetQueries = structuredClone(payload)), // copy, don't reference
		gapValue: (payload: string | null) => (state.expert.gapValue = payload || null),
		gapValueFile: (payload: File) =>
			new Promise<void>((resolve, reject) => {
				const fr = new FileReader();
				fr.onload = () => {
					actions.expert.gapValue(fr.result as string);
					resolve();
				};
				fr.readAsText(payload);
			}),
		reset: () => {
			state.expert.query = null;
			state.expert.gapValue = null;
			state.expert.targetQueries = [];
		},
	},
	reset: () => {
		actions.shared.reset();
		actions.simple.reset();
		actions.extended.reset();
		actions.advanced.reset();
		actions.expert.reset();
		resetSignal.value++;
	},

	replace: (payload: ModuleRootState) => {
		actions.shared.reset();
		actions.shared.alignBy(payload.shared.alignBy);
		actions.shared.sourceField(payload.shared.source);
		actions.shared.targetFields(payload.shared.targets);
		state.shared.within = payload.shared.within;
		state.shared.withinAttributes = payload.shared.withinAttributes;

		actions.simple.reset();
		actions.simple.annotation(payload.simple.annotationValue);

		actions.extended.reset();
		Object.values(payload.extended.annotationValues).forEach(actions.extended.annotation);

		actions.advanced.reset();
		actions.advanced.query(payload.advanced.query);
		actions.advanced.targetQueries(payload.advanced.targetQueries);

		actions.expert.reset();
		actions.expert.query(payload.expert.query);
		actions.expert.targetQueries(payload.expert.targetQueries);
		actions.expert.gapValue(payload.expert.gapValue);
	},
};

/** We need to call some function from the module before creating the root store or this module won't be evaluated (e.g. none of this code will run) */
const init = (state: CorpusChange) => {
	if (!state.index) {
		Object.assign(getState(), cloneDeep(initialState));
		return;
	}

	// To ease logic between parallel and non-parallel fields
	// always rely on explicitly specifying the source field for query
	// even in non-parallel corpora.
	// We simply select the mainAnnotatedField in that case (that's the first annotated field defined in the corpus)
	// For parallel corpora, make sure to get a real parallel field for the default.
	// TODO we should probably factor out this logic, and just return the first paralle field from mainAnnotatedField() directly.
	// and simply default to that.
	const sourceField = CorpusStore.get.isParallelCorpus() ? CorpusStore.get.parallelAnnotatedFields().find(f => f.isParallel)!.id : CorpusStore.get.mainAnnotatedField();

	debugLogCat('parallel', `init: Set default annotated field to: ${sourceField}`);
	privateActions.initShared({
		source: sourceField,
		targets: [],
		alignBy: null,
		within: null,
		withinAttributes: {},
	});
	CorpusStore.get.allAnnotations().forEach(({ id, uiType }) => {
		privateActions.initExtendedAnnotation({
			id,
			value: '',
			case: false,
			type: uiType,
		});
	});
	privateActions.initSimpleAnnotation({
		annotationValue: {
			id: CorpusStore.get.firstMainAnnotation().id,
			value: '',
			case: false,
			type: CorpusStore.get.firstMainAnnotation().uiType,
		},
	});

	debugLogCat('init', 'Finished initializing pattern module state shape');
};

const resetSignal = ref(0);

export { actions, initialState as defaults, get, getState, init, resetSignal };
export type { ModuleRootState };
