import { isObject } from '@vueuse/core';

import type { HighlightSection } from '@/pages/search/results/table/hit-highlighting';
import type * as AppTypes from '@/types/apptypes';
import type * as BLTypes from '@/types/blacklabtypes';
import { spanFilterId } from '@/utils';

import type { Translate } from '@/shared/i18n';
import type { OptGroup, Option } from '@/shared/utils/options';

const unwrappedImplementation = Symbol('unwrappedImplementation');
const isProxiedSym = Symbol('proxyMark');
const dontProxyMe = Symbol('dontProxyMe');

function mark(obj: any, marker: symbol) {
	if (typeof obj === 'object' && obj !== null && !Object.isFrozen(obj) && !(isProxiedSym in obj) && !(dontProxyMe in obj)) {
		Object.defineProperty(obj, marker, {
			value: true,
			enumerable: false,
			configurable: false,
			writable: false,
		});
	}
	return obj;
}
// Check if the value is already proxied to avoid re-wrapping
// And some things we don't want to proxy
function canAndShouldProxy(obj: any): obj is object {
	return typeof obj === 'object' && obj !== null && !Object.isFrozen(obj) && !(isProxiedSym in obj) && !(dontProxyMe in obj);
}
function dontProxy<T>(obj: T): T {
	return mark(obj, dontProxyMe);
}
/**
 * Looks scary, is pretty mundane really
 * Recursively wrap everything in the object in a getter/setter pair.
 *
 * This allows us to wrap any function the user sets in the object, so we can
 * catch any errors thrown by the new implementation, log them, and
 * call the original implementation instead.
 *
 * This prevents us from having wrap every customization function call in a try/catch block.
 *
 * There's a few little gotchas like proxying new values put in the object, checking if such values are already proxied,
 * and recursion (proxy getter/setter only applies to the direct object, so deep.property.access doesn't call the proxy for nested values).
 */
function wrapWithErrorHandling<T extends object>(obj: T) {
	// Mark the proxied object to avoid re-proxying
	mark(obj, isProxiedSym);
	return new Proxy(obj, {
		get(target, prop, receiver) {
			let value = Reflect.get(target, prop, receiver);
			// Before we return a nested array/object, make sure it's wrapped,
			// otherwise this proxy won't be called when properties in that object are accessed.
			if (canAndShouldProxy(value)) {
				value = wrapWithErrorHandling(value);
				Reflect.set(target, prop, value, receiver);
			}
			return value;
		},
		set(this: any, target, prop, newValue, receiver) {
			let currentValue: any = Reflect.get(target, prop, receiver);
			if (typeof currentValue !== 'function' || typeof newValue !== 'function') {
				// Not a function we should wrap, just save the value.
				Reflect.set(target, prop, newValue, receiver);
				// propagate the dontProxyMe marker to the new value
				if (currentValue != null && currentValue[dontProxyMe]) mark(newValue, dontProxyMe);
				return true;
			}

			// Someone is replacing one of the function!
			// wrap their implementation, and use the original implementation if the new implementation ever errors.
			const defaultImplementation = currentValue[unwrappedImplementation] || currentValue;
			currentValue = function (this: any, ...args: any[]) {
				try {
					return newValue.apply(this, args);
				} catch (e) {
					console.error(`Error in customization function ${String(prop)}:`, e);
					return defaultImplementation.apply(this, args);
				}
			};
			// Store the default implementation so we don't stack multiple wrappers if the function is every replaced another time
			currentValue[unwrappedImplementation] = defaultImplementation;
			// Finally store and return the wrapped function
			Reflect.set(target, prop, currentValue, receiver);
			return true;
		},
	});
}

/**
 * This object contains any customization "hook" functions for this corpus.
 *  It defines defaults that can be overridden from custom JS file(s); see below.
 */
export const corpusCustomizations = wrapWithErrorHandling({
	// Registered customize function(s), to be called once the corpus info has been loaded
	customizeFunctions: dontProxy([] as ((corpus: any) => void)[]),

	/** index information */
	_corpus: dontProxy({}) as AppTypes.NormalizedIndex | null,

	search: {
		pattern: {
			/** Customize the uiType for an annotation.
			 *  Return null to use the default (value specified by BLS).
			 */
			uiType(fieldName: string, annotationName: string): AppTypes.NormalizedAnnotation['uiType'] | null {
				return null;
			},

			/** Should we add _within-spans(...) around the query,
			    so all tags are captured and we can group on them?
				[Default: only if there's span filters defined] */
			shouldAddWithSpans(q: string) {
				return null;
			},
		},

		within: {
			/** Should we include this span in the within widget? (default: all) */
			includeSpan(spanName: string) {
				return true;
			},

			/** Should we include this span attribute in the within widget? (default: none) */
			includeAttribute(spanName: string, attrName: string) {
				return null;
			},
		},

		metadata: {
			/** Show this metadata search field? */
			showField(filterId: string): boolean | null {
				return null;
			},

			/** Any custom metadata tabs to add (INTERNAL) */
			_customTabs: dontProxy([]) as any[],

			/** Add a custom tab with some (span) filter fields */
			addCustomTab(name: string, fields: any[]) {
				this._customTabs.push({ name, fields });
			},

			// TODO refactor this to be more type-safe and more user-friendly for custom scripts.
			/** Create a span filter for corpus.search.metadata.customTabs */
			createSpanFilter(
				spanName: string,
				attrName: string,
				widget: string = 'auto',
				displayName: string,
				metadata: unknown = {},
			): AppTypes.FilterDefinition<{ name: string; attribute: string; options?: Option[] }> {
				// Try and parse out options from provided info for the filter
				let valuesForAttribute: Option[] | undefined =
					// If user passed in just an array, assume these are the options.
					Array.isArray(metadata)
						? (metadata as Option[])
						: // Otherwise, look for an options property in the metadata.
							isObject(metadata) && 'options' in metadata && Array.isArray(metadata.options)
							? (metadata.options as Option[])
							: undefined;
				// No options provided - retrieve from corpus.
				if (!valuesForAttribute) {
					// Find available values for this attribute from the corpus info
					// If no explicit options are provided, we'll use those. (at least, if the widget is supposed to show options, i.e. select or autocomplete)
					const corpus = corpusCustomizations._corpus;
					const span = corpus?.relations.spans?.[spanName];
					const attr = span?.attributes?.[attrName];
					if (attr && attr.valueListComplete) valuesForAttribute = Object.keys(attr.values).map(value => ({ value }));
				}
				// ensure all entries in the array is valid options objects
				valuesForAttribute = valuesForAttribute?.map(option => (typeof option === 'string' ? { value: option } : option));
				// Infer widget type if not provided, pretty basic, but it works for now: if there are options, we can show them in a select, otherwise we need a text input.
				if (widget === 'auto') {
					widget = valuesForAttribute ? 'select' : 'text';
				}

				// FilterValueFunctions entry
				const behaviourName = widget === 'select' || widget === 'range' ? `span-${widget}` : 'span-text';

				// use an intermediate object to avoid setting the 'options' key if we have no options
				// we want to avoid returning {options: Option[]|undefined}
				const optionsMetadata = valuesForAttribute ? { options: valuesForAttribute } : {};

				return {
					id: spanFilterId(spanName, attrName),
					componentName: `filter-${widget}`,
					behaviourName, // i.e. generate a "within ..." BCQL query
					defaultDisplayName: displayName ?? `tag ${spanName}, attribute ${attrName}`,
					metadata: {
						name: spanName,
						attribute: attrName,
						...optionsMetadata,
					},
					// (groupId will be set automatically when creating the custom tabs)
				};
			},
		},
	},

	results: {
		/**
		 * How to highlight match info in the hits table.
		 *
		 * Default behaviour is to always highlight if the user "captured"
		 * (i.e. labelled this token in the query), OR if this is a relation and
		 * there are no explicit captures.
		 *
		 * @param matchInfo the highlight section to get the style for
		 * @returns 'none' (no highlighting), 'static' (always highlight), 'hover'
		 *   (highlight on mouseover) or null for default behaviour.
		 */
		matchInfoHighlightStyle: (matchInfo: HighlightSection): 'none' | 'static' | 'hover' | null => {
			return null; // use default behaviour
		},

		/** CSV export customizations */
		export: {
			/**
			 * Description of the search query to add to the CSV export. Default: none.
			 */
			description: (blSummary: any, fieldDisplayNameFunc: any) => {
				return null; // use default behaviour
			},

			/** Should this span attribute be included in the export?
			 *  (default: no)
			 */
			includeSpanAttribute(spanName: string, attrName: string): boolean | null {
				return null; // use default behaviour
			},
		},

		// #region docscustomhitinfocolumn
		/** Should the custom hit info column be shown for this result set?
		 *
		 * If true, uses the customHitInfo function to determine what to show.
		 */
		hasCustomHitInfoColumn: (results: BLTypes.BLHitResults | BLTypes.BLHitGroupResults, isParallelCorpus: boolean): boolean => {
			return isParallelCorpus;
		},

		/**
		 * Determine custom hit info for this hit.
		 *
		 * Shows some custom text (with doc link) left of the hit.
		 *
		 * Default shows versionPrefix if it's set (i.e. if it's a parallel corpus).
		 * Otherwise, nothing extra is shown.
		 * @param hit the hit
		 * @param annotatedFieldDisplayName the name of the field the hit is in. This is already translated to the user's locale.
		 *  In the case of non-parallel corpora, this will always be the main annotated field.
		 * @param docInfo document metadata
		 */
		customHitInfo: (hit: BLTypes.BLHit | BLTypes.BLHitSnippet | BLTypes.BLHitInOtherField, annotatedFieldDisplayName: string | null, docInfo: BLTypes.BLDoc): string | null => {
			return annotatedFieldDisplayName;
		},
		// #endregion docscustomhitinfocolumn
	},

	sort: {
		/** Perform customizations on these sort options */
		customize(optGroup: OptGroup): OptGroup | null {
			return null; // use default behaviour [no change]
		},
	},

	group: {
		/** Should this span attribute be included in group by?
		 *  (return null to fall back to default: "only if there's a span filter defined for it")
		 */
		includeSpanAttribute(spanName: string, attrName: string): boolean | null {
			return null; // use default behaviour
		},

		/** Perform customizations on these group options */
		customize(optGroup: OptGroup, i18n: Translate): OptGroup | null {
			return null; // use default behaviour [no change]
		},
	},
});
