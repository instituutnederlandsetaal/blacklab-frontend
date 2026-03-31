import $ from 'jquery';

// Bootstrap 3 expects jQuery on the global object at module evaluation time.
const globalScope = globalThis as typeof globalThis & {
	$: typeof $;
	jQuery: typeof $;
};

globalScope.$ = $;
globalScope.jQuery = $;

export default $;
