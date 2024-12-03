import 'bootstrap';
import $ from 'jquery';
import Vue from 'vue';
// @ts-ignore
import * as Highcharts from 'highcharts';
// @ts-ignore
import HighchartsVue from 'highcharts-vue';
import HighchartsExporting from 'highcharts/modules/exporting';
import HighchartsExportingData from 'highcharts/modules/export-data';
import HighchartsBoost from 'highcharts/modules/boost';

//@ts-ignore
import VuePlausible from 'vue-plausible/lib/esm/vue-plugin.js';

import * as RootStore from '@/store/article';
import * as UIStore from '@/store/search/ui';
import ArticlePageComponent from '@/pages/article/ArticlePage.vue';
import ArticlePagePaginationComponent from '@/pages/article/ArticlePagePagination.vue';
import ArticlePageParallelComponent from '@/pages/article/ArticlePageParallel.vue';
import debug from '@/utils/debug';
import initTooltips from '@/modules/expandable-tooltips';
import * as loginSystem from '@/utils/loginsystem';

import '@/global.scss';
import '@/article.scss';
import { init as initApi } from '@/api';
import '@/utils/i18n';

// Article-related functions.
// Takes care of tooltips and highlighting/scrolling to anchors.


// ---------------------------
// Vue initialization & config
// ---------------------------

HighchartsExporting(Highcharts);
HighchartsExportingData(Highcharts);
HighchartsBoost(Highcharts);

if (PLAUSIBLE_DOMAIN && PLAUSIBLE_APIHOST) {
	Vue.use(VuePlausible, {
		domain: PLAUSIBLE_DOMAIN,
		trackLocalhost: true,
		apiHost: PLAUSIBLE_APIHOST,
	});
	//@ts-ignore
	Vue.$plausible.trackPageview();
}
Vue.use(HighchartsVue);

$(document).ready(async () => {
	const user = await loginSystem.awaitInit();
	initApi('blacklab', BLS_URL, user);
	initApi('cf', CONTEXT_URL, user);
	await RootStore.init();

	// Trick to get ui.ts to load (and window.frontend object to be created, for custom.js)
	UIStore.get;

	// Statistics tab
	new ArticlePageComponent().$mount(document.getElementById('vue-root-statistics')!);

	// Pagination widget
	new ArticlePagePaginationComponent().$mount(document.getElementById('vue-root-pagination')!);

	// Show document version name and length
	// (i.e. the display name and length of the specific annotated field we're showing, e.g. contents__nl, shown as "Dutch")
	new ArticlePageParallelComponent().$mount(document.getElementById('vue-root-parallel-version')!);

	(window as any).Vue = Vue;

	// Add debug tab if we're in debug mode.
	//
	// This is pretty horrendous: we need a callback when some Vue.observable changes
	// The easy way is through a store watcher, since that works even when the variable is outside the store
	// and even when the store is completely ignored other than that.
	// And since debug.debug is observable, this works!
	RootStore.store.watch(store => ({debug: debug.debug, document: store.document}), ({debug, document}) => {
		if (debug && document) {
			// Add the debug tab
			const queryParamsForContents = {
				wordstart: PAGE_START,
				wordend: PAGE_END,
			} as any;
			if (!PAGE_START) delete queryParamsForContents.wordstart
			if (!PAGE_END || PAGE_END === document.docInfo.lengthInTokens) delete queryParamsForContents.wordend;

			const queryString = new URLSearchParams(queryParamsForContents).toString();

			const s =
			`<div id="debug-info">
				<hr>
				<h2>Debug info</h2>

				<table class="table table-striped" style="table-layout: fixed">
					<tr>
						<th>Field</th>
						<th>Values</th>
					</tr>
					${Object.entries(document.docInfo).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `<tr><td>${k}</td><td>${JSON.stringify(v)}</td></tr>`).join('')}
				</table>

				<a href="${BLS_URL}${INDEX_ID}/docs/${DOCUMENT_ID}/contents${queryString && ('?' + queryString)}" target="_blank">Open raw document</a>
			</div>`

			$('#articleTabs').append(`<li id="debug-tab"><a href="#debug" data-toggle="tab">Debug</a></li>`)
			$('.tab-content').append(`<div id="debug" class="tab-pane">${s}</div>`)
		} else {
			// Remove debug tab if present
			$('#debug').remove();
			$('#debug-tab').remove();
		}
	}, { immediate: true})

	initTooltips({
		mode: 'attributes',
		contentAttribute: 'data-tooltip-content',
		previewAttribute: 'data-tooltip-preview'
	});

	initTooltips({
		mode: 'title',
		excludeAttributes: ['toggle', 'tooltip-content', 'tooltip-preview'],
		tooltippableSelector: '.word[data-toggle="tooltip"]'
	});
});
