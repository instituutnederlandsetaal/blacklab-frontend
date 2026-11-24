import $ from 'jquery';

// Bootstrap 3 expects jQuery on the global object at module evaluation time.
const globalScope = globalThis as typeof globalThis & {
	$: typeof $;
	jQuery: typeof $;
	jquery: typeof $;
};

globalScope.$ = $;
globalScope.jQuery = $;
globalScope.jquery = $;
