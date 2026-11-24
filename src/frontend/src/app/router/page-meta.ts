type CustomScriptTiming = 'immediate' | 'after-page-bootstrap';

/**
 * We need some metadata about the current route in order for customJs and customCss to work correctly.
 * Store it in a standardized object so we can be sure it's available as expected.
 */
export type PageMeta = {
	name: string;
	getTitle?: (corpusDisplayName: string) => string;
	customScriptTiming?: CustomScriptTiming;
};
