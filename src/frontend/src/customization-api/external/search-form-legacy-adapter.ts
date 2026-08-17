/** Bridges legacy form settings into the public pre-construction form API. */

import type { SearchFormConfigurationApi, SearchFormOption } from './external-api';
import type { LegacyCustomizationApi } from './legacy';

import { elementAndAttributeNameFromFilterId } from '@/shared/blacklab-helpers/span-filters-helper';

function legacyOptions(metadata: any): SearchFormOption[] {
	const values = Array.isArray(metadata) ? metadata : metadata?.options;
	return Array.isArray(values) ? values.map(value => (typeof value === 'string' ? { value } : value)) : [];
}

export function applyLegacySearchFormConfiguration(api: SearchFormConfigurationApi, legacy: LegacyCustomizationApi): void {
	api.configureWithin({
		includeElement: elementName => legacy.search.within.includeSpan(elementName) !== false,
		includeAttribute: (elementName, attributeName) => legacy.search.within.includeAttribute(elementName, attributeName) === true,
	});
	for (const tab of legacy.search.metadata._customTabs) {
		for (const filter of tab.fields ?? tab.subtabs?.flatMap(subtab => subtab.fields) ?? []) {
			const type = filter.behaviourName;
			if (type !== 'span-text' && type !== 'span-select' && type !== 'span-range') continue;
			try {
				const [elementName, attributeName] = elementAndAttributeNameFromFilterId(filter.id);
				api.addSpanFilter({
					elementName,
					attributeName,
					control: type === 'span-select' ? 'select' : type === 'span-range' ? 'range' : 'text',
					options: type === 'span-select' ? legacyOptions(filter.metadata) : undefined,
					groupId: filter.groupId ?? tab.name,
					defaultDisplayName: filter.defaultDisplayName,
					defaultDescription: filter.defaultDescription,
				});
			} catch {
				console.warn(`Ignoring span filter with invalid id '${filter.id}'.`);
			}
		}
	}
	api.filterMetadataFields(field => legacy.search.metadata.showField(field.id) !== false);
}
