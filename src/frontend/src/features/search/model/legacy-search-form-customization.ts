import type { SearchFormConfigurationCallback, SearchFormWithinAttribute } from '@/features/search/model/search-form-customization';
import type { FilterDefinition } from '@/types/apptypes';

import { elementAndAttributeNameFromFilterId } from '@/shared/blacklab-helpers/span-filters-helper';
import type { Option } from '@/shared/utils/options';

type LegacyTab = {
	name: string;
	fields?: FilterDefinition<any>[];
	subtabs?: Array<{ fields: FilterDefinition<any>[] }>;
};

type LegacyWithin = {
	includeSpan(elementName: string): boolean | null;
	includeAttribute(elementName: string, attributeName: string): boolean | null;
};

function options(metadata: any): Option[] {
	const values = Array.isArray(metadata) ? metadata : metadata?.options;
	return Array.isArray(values) ? values.map(value => (typeof value === 'string' ? { value } : value)) : [];
}

/**
 * Keep legacy names and data shapes on this side of the new customization API.
 * Metadata-filter parity can be added here when the new surface grows beyond spans.
 */
export function adaptLegacySearchFormCustomizations(tabs: readonly LegacyTab[], within: LegacyWithin): SearchFormConfigurationCallback {
	return form => {
		form.configureWithin({
			includeElement: element => within.includeSpan(element) !== false,
			includeAttribute: (element, attribute) => within.includeAttribute(element, attribute) === true,
		});
		for (const tab of tabs) {
			for (const filter of tab.fields ?? tab.subtabs?.flatMap(subtab => subtab.fields) ?? []) {
				const type = filter.behaviourName;
				if (type !== 'span-text' && type !== 'span-select' && type !== 'span-range') continue;
				try {
					const [elementName, attributeName] = elementAndAttributeNameFromFilterId(filter.id);
					const control: SearchFormWithinAttribute['control'] = type === 'span-select' ? { type: 'select', options: options(filter.metadata) } : type === 'span-range' ? 'range' : 'text';
					form.addWithinAttribute({
						id: filter.id,
						elementName,
						attributeName,
						control,
						groupId: filter.groupId ?? tab.name,
						defaultDisplayName: filter.defaultDisplayName,
						defaultDescription: filter.defaultDescription,
					});
				} catch {
					console.warn(`Ignoring span filter with invalid id '${filter.id}'.`);
				}
			}
		}
	};
}
