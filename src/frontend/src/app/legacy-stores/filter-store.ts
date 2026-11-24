/** Legacy filter definitions can supply labels and span attributes for result grouping. */
import { reactive } from 'vue';

import { type CorpusContext } from '@/features/corpus/corpus-context';
import type { FilterDefinition } from '@/types/apptypes';

import { debugLog } from '@/shared/debug/debug';

const state = reactive<{ filters: Record<string, FilterDefinition<unknown>> }>({ filters: {} });
const getState = () => state;

export function isSpanFilter(filter: FilterDefinition<unknown>) {
	return ['span-text', 'span-select', 'span-range'].includes(filter.behaviourName ?? filter.componentName);
}

const get = {
	filterValue: (id: string) => state.filters[id],
};

const actions = {
	registerFilter: (filter: FilterDefinition<unknown>) => {
		if (state.filters[filter.id]) {
			// Registration is idempotent.
			return;
		}

		// Older scripts use displayName and description.
		const legacy = filter as FilterDefinition<unknown> & { displayName: string; description?: string };
		filter.defaultDisplayName = filter.defaultDisplayName || legacy.displayName;
		filter.defaultDescription = filter.defaultDescription || legacy.description;

		state.filters[filter.id] = { ...filter };
	},
};

const init = (state: CorpusContext) => {
	getState().filters = {};
	if (!state.index) return;

	state.index.allMetadataFields.forEach(f => {
		let componentName;
		let metadata: unknown;
		switch (f.uiType) {
			case 'checkbox':
				componentName = 'filter-checkbox';
				metadata = f.values || [];
				break;
			case 'combobox':
				componentName = 'filter-autocomplete';
				metadata = f.id;
				break;
			case 'radio':
				componentName = 'filter-radio';
				metadata = f.values || [];
				break;
			case 'range':
				componentName = 'filter-range';
				metadata = undefined;
				break;
			case 'select':
				componentName = 'filter-select';
				metadata = f.values || [];
				break;
			case 'date':
				componentName = 'filter-date';
				metadata = {
					field: f.id,
				};
				break;
			case 'text':
			default:
				componentName = 'filter-text';
				metadata = undefined;
				break;
		}

		actions.registerFilter({
			componentName,
			defaultDescription: f.defaultDescription,
			defaultDisplayName: f.defaultDisplayName,
			id: f.id,
			metadata,
		});
	});

	debugLog('init', 'Finished initializing filter module state shape');
};

export { actions, get, getState, init };
