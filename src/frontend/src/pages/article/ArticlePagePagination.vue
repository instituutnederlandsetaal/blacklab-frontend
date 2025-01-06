<template>
	<!-- TODO: i18n -->
	<div class="article-pagination" title="Hold to drag">
		<template v-if="paginationInfo">
			<div class="pagination-container">
				<label style="white-space: nowrap;">Page</label>
				<div class="pagination-wrapper">
					<Pagination v-bind="paginationInfo" :editable="false" :showOffsets="false" @change="handlePageNavigation"/><br>
				</div>
			</div>
			<hr v-if="hitInfo || loadingForAwhile">
		</template>

		<div v-if="hitInfo" class="pagination-container">
			<label>Hit</label>
			<div class="pagination-wrapper">
				<Pagination v-bind="hitInfo" :editable="false" :showOffsets="false" @change="handleHitNavigation"/><br>
			</div>
		</div>
		<template v-else-if="loadingForAwhile">
			<Spinner size="20"/>
			<label>Loading hits...</label>
		</template>
	</div>
</template>

<script lang="ts">

import Vue from 'vue';
import URI from 'urijs';

import { blacklab } from '@/api';
import { BLHitResults } from '@/types/blacklabtypes';

import Pagination from '@/components/Pagination.vue';
import { debugLogCat } from '@/utils/debug';
import { binarySearch } from '@/utils';

import Spinner from '@/components/Spinner.vue';

import * as ArticleStore from '@/store/article';

import 'jquery-ui';
import 'jquery-ui/ui/widgets/draggable';
import { Loadable, validPaginationParameters$ } from '@/pages/article/article';
import { Subscription } from 'rxjs';


// NOTE: wordend in blacklab parameters is exclusive (wordstart=0 && wordend=100 returns words at index 0-99)

type HitStuff = {
	pageSize: number|null,
	wordstart: number|null,
	wordend: number|null,
	findhit: number|null,
	hits: [number, number][]|null,
	docLength: number|null,
};

// NOTE: this is a ugly piece of code, but hey it works /shrug
export default Vue.extend({
	components: { Pagination, Spinner },
	props: {
		hits: Object as () => Loadable<[number, number][]>,
		hitElements: Array as () => HTMLElement[]|null,
		docLength: Number,
	},
	data: () => ({
		params: ValidPaginationAndDocDisplayParameters,
		subs: [] as Subscription[]
	}),
	computed: {
		wordstart: ArticleStore.get.wordstart,
		wordend: ArticleStore.get.wordend,
		pageSize: ArticleStore.get.pageSize,

		// firstVisibleHitIndex(): number { return this.hits && this.pageIsValid ? binarySearch(this.hits, h => this.wordstart - h[0]) : 0; },
		// /**
		//  * Global index of the hit in the document. E.g. wordstart=100 means hit that starts at wordstart=100, which is the 5th hit
		//  * in the document, then this would be 4.
		//  */
		// currentHitIndex(): number { return this.hits && this.pageIsValid ? this.firstVisibleHitIndex + this.currentHitInPage : 0; },

		paginationInfo(): undefined|{
			page: number,
			maxPage: number,
			minPage: number,
			disabled: boolean,
			pageActive: boolean
		} {
			// Don't bother if we're showing the entire document
			if (this.wordstart <= 0 && this.wordend >= this.docLength) {
				return undefined;
			}

			// It can happen we're not showing a page as intended, but showing a larger or smaller part.
			// (if the user edited the url manually for example)
			// We reflect this in the pagination widget. So we need to check here.
			const startOfPageAligns = this.wordstart % this.pageSize! === 0;
			const endOfPageAligns = this.wordend === (this.wordstart + this.pageSize!) || this.wordend === this.docLength;
			const isOnExactPage = startOfPageAligns && endOfPageAligns;
			return {
				page: Math.floor(this.wordstart / this.pageSize),
				maxPage: Math.floor(this.docLength / this.pageSize),
				minPage: 0,
				disabled: false,
				pageActive: isOnExactPage
			}
		},
		// hitInfo(): undefined|{
		// 	page: number,
		// 	maxPage: number,
		// 	minPage: number,
		// 	disabled: boolean,
		// 	pageActive: boolean
		// } {
		// 	if (!this.hits || this.hits.length <= 1) { return undefined; }
		// 	const isOnHit = this.currentHitInPage != null;
		// 	return {
		// 		page: this.currentHitIndex || 0,
		// 		maxPage: this.hits!.length-1,
		// 		minPage: 0,
		// 		disabled: false,
		// 		pageActive: isOnHit
		// 	}
		// },
	},
	methods: {
		/** Navigate to the page with specific index. Optionally to a specific hit within the page. (The hit number should be the index of the hit in the new page. I.e 0 for the first hit on that page) */
		// handlePageNavigation(page: number, hit?: number) {
		// 	let wordstart: number|undefined = page * this.pageSize;
		// 	let wordend: number|undefined = (page + 1) * this.pageSize;
		// 	if (wordstart <= 0) { wordstart = undefined; }
		// 	if (wordend >= this.docLength) { wordend = undefined; }

		// 	const newUrl = new URI().setSearch({wordstart, wordend, findhit: undefined}).fragment(hit ? hit.toString() : '').toString();
		// 	debugLogCat('history', `Setting window.location.href to ${newUrl}`);
		// 	window.location.href = newUrl;
		// },
		// handleHitNavigation(index: number) {
		// 	const indexInThisPage = index - this.firstVisibleHitIndex;
		// 	if (indexInThisPage >= this.hitElements.length || indexInThisPage < 0) {
		// 		const pageOfNewHit = Math.floor(this.hits![index][0] / this.pageSize!);
		// 		const startOfNewPage = pageOfNewHit * this.pageSize!;
		// 		const endOfNewPage = (pageOfNewHit + 1) * this.pageSize!;

		// 		// find index in new page
		// 		let firstHitOnNewPage = Number.MAX_SAFE_INTEGER;
		// 		for (let n = 0; n < this.hits!.length; ++n) {
		// 			const [s, e] = this.hits![n];
		// 			if (s >= startOfNewPage) { firstHitOnNewPage = Math.min(firstHitOnNewPage, n); }
		// 		}

		// 		const indexInNewPage = index - firstHitOnNewPage;

		// 		this.handlePageNavigation(pageOfNewHit, indexInNewPage)
		// 		return;
		// 	}

		// 	if (this.currentHitInPage != null) {
		// 		const prevHit = this.hitElements[this.currentHitInPage!];
		// 		prevHit.classList.remove('active');
		// 	}

		// 	const nextHit = this.hitElements[indexInThisPage];
		// 	nextHit.classList.add('active');
		// 	nextHit.scrollIntoView({block: 'center', inline: 'center'});
		// 	this.currentHitInPage = index - this.firstVisibleHitIndex;
		// }

		validatePage(cur: {
			wordstart: number|null;
			wordend: number|null;
			pageSize: number;
			docLength: number
		}) {
			// Fix nulls
			cur.wordstart = cur.wordstart ?? 0;
			cur.wordend = cur.wordend ?? cur.docLength;
			// Fix order (just in case)
			if (cur.wordstart > cur.wordend) [cur.wordstart, cur.wordend] = [cur.wordend, cur.wordstart];

			// Fix bounds.
			if (cur.wordstart < 0 || cur.wordstart >= cur.docLength) cur.wordstart = 0;
			if (cur.wordend > cur.docLength) cur.wordend = cur.docLength;

			// Clamp end to be max pageSize away from start
			cur.wordend = Math.min(cur.wordend, Math.max(cur.wordstart + cur.pageSize, cur.docLength));
			return cur;
		}
	},
	watch: {
		// currentHitInPage() {
		// 	const url = window.location.pathname + window.location.search + (this.currentHitInPage == null ? '' : `#${this.currentHitInPage.toString(10)}`);
		// 	debugLogCat('history', `Calling replaceState with URL: ${url}`);
		// 	window.history.replaceState(undefined, '', url);
		// },
		// hitStuff: {
		// 	handler(cur: HitStuff, prev: HitStuff) {
		// 		// we need to correct the pagestart/pageend
		// 		// there's a few cases
		// 		// 1. pagination disabled
		// 		// 2. pagination enabled, and we need to find a specific hit
		// 		// 3. pagination enabled, we just need to initialize the page
		// 		// 4. pagination enabled, everything is fine

		// 		// Make a copy so we can modify it and check against the new state.
		// 		const orig = cur;
		// 		cur = { ...cur };
		// 		if (cur.docLength == null) return; // waiting for doc info, can't do anything.
		// 		if (cur.findhit != null && cur.hits == null) return; // waiting for hits, can't do anything.

		// 		// 1. pagination disabled
		// 		if (cur.pageSize == null) {
		// 			cur.wordstart = null;
		// 			cur.wordend = null;
		// 		} else {
		// 			// Fix nulls
		// 			cur.wordstart = cur.wordstart ?? 0;
		// 			cur.wordend = cur.wordend ?? cur.docLength;
		// 			// Fix order (just in case)
		// 			if (cur.wordstart > cur.wordend) [cur.wordstart, cur.wordend] = [cur.wordend, cur.wordstart];

		// 			// Fix bounds.
		// 			if (cur.wordstart < 0 || cur.wordstart >= cur.docLength) cur.wordstart = 0;
		// 			if (cur.wordend > cur.docLength) cur.wordend = cur.docLength;

		// 			// Clamp end to be max pageSize away from start, and clamp to docLength
		// 			cur.wordend = Math.min(cur.wordend, Math.max(cur.wordstart + cur.pageSize, cur.docLength));


		// 			if (cur.findhit) {
		// 				// 2. pagination enabled, and we need to find a specific hit
		// 				// binary search to find the hit:
		// 				const index = binarySearch(cur.hits!, h => cur.findhit! - h[0]);
		// 				const [hitstart, hitend] = cur.hits![index >= 0 ? index : 0];
		// 				if (hitstart < cur.wordstart || hitstart > cur.wordend) {
		// 					cur.wordstart = Math.floor(hitstart / cur.pageSize) * cur.pageSize!;
		// 				}


		// 				if (index >= 0) {
		// 					let firstVisibleHitIndex = Math.abs(binarySearch(cur.hits!, h => cur.wordstart! - h[0]));
		// 					if (this.currentHitInPage != null) {
		// 						this.hitElements![this.currentHitInPage].classList.remove('active');
		// 					}
		// 					this.currentHitInPage = index - firstVisibleHitIndex;
		// 					this.hitElements![this.currentHitInPage].classList.add('active');
		// 					this.hitElements![this.currentHitInPage].scrollIntoView({block: 'center', inline: 'center'});
		// 				}
		// 				window.history.replaceState(undefined, '', new URI().removeSearch('findhit').toString());

		// 			}

		// 		}


		// 			this.validatePage(cur);
		// 			if (cur.findhit) this.findhit(cur);
		// 		}
		// 	},
		// 	immediate: true,
		// }
	},
	mounted() {
		this.$forceUpdate(); // updated() sometimes not called?
	},
	updated() {
		if (this.$el && this.$el.nodeType === 1) { // sometimes it's a comment if our top v-if is false.
			//@ts-ignore
			$(this.$el).draggable();
		}
	},
	created() {
		this.subs.push(validPaginationParameters$.subscribe({
			next: v => this.params = v;
		}));

		// There are two ways the url can contain a reference to a specific hit we should outline/scroll to
		// first: the hash as an index (#10 for the 10th hit on this page for example - this is when someone got sent the page from someone else, or when refreshing the page)
		// second: the ?findhit parameter, contains the token offset where the hit starts

		// case 1: the nth hit on the page

		// initially, highlight the correct hit, if there is any specified
		// otherwise just remove the window hash
		// if (!this.hitElements.length) {
		// 	this.currentHitInPage = undefined;
		// 	const url = window.location.pathname + window.location.search;
		// 	debugLogCat('history', `Calling replaceState with URL: ${url}`);
		// 	window.history.replaceState(undefined, '', url); // setting hash to '' won't remove '#'
		// } else {
		// 	let hitInPage = Number(window.location.hash ? window.location.hash.substring(1) : '0') || 0;
		// 	if (hitInPage >= this.hitElements.length || hitInPage < 0) {
		// 		hitInPage = 0;
		// 	}

		// 	this.hitElements[hitInPage].classList.add('active');
		// 	this.hitElements[hitInPage].scrollIntoView({block: 'center', inline: 'center'});
		// 	this.currentHitInPage = hitInPage;
		// }


		// case 2: the ?findhit parameter
		// we need to request all hits from blacklab for this
		//   (but we need these anyway, so we know how many hits there are and where, for navigating through them)


		// Load all hits in the document (also those outside this page)
		// @ts-ignore
		// const { query, field, searchfield }: {
		// 	query: string|undefined,
		// 	field: string|undefined,
		// 	searchfield: string|undefined, // override in parallel corpus (e.g. show contents from field a; search starts from field B)
		// } = new URI().search(true);

		// if (!query) { // no hits when no query, abort
		// 	this.hits = [];
		// 	return;
		// }

		// /**
		//  * Optionally request hits from a specific target field (parallel corpora).
		//  *
		//  * This is done by adding <code>rfield(..., targetField)</code> to the query.
		//  */
		// function optTargetField(query?: string, targetfield?: string) {
		// 	if (query && targetfield) {
		// 		const f = targetfield.replace(/'/g, "\\'");
		// 		return "rfield(" + query + ", '" + f + "')";
		// 	}
		// 	return query;
		// }

		// const spinnerTimeout = setTimeout(() => this.loadingForAwhile = true, 3000);
		// blacklab
		// .getHits(INDEX_ID, {
		// 	docpid: ArticleStore.getState().docId!,
		// 	field: searchfield ?? field,
		// 	patt: optTargetField(query, searchfield ? field : undefined),
		// 	first: 0,
		// 	number: Math.pow(2, 31)-1,
		// 	context: 0,
		// 	includetokencount: false,
		// 	listvalues: "__do_not_send_anything__", // we don't need this info
		// }).request
		// .then((r: BLHitResults) => r.hits.map(h => [h.start, h.end] as [number, number]))
		// .then(hits => {
		// 	// if specific hit passed from the previous page, find it in this page
		// 	let findHit: number = Number(new URI().search(true).findhit);

		// 	if (!isNaN(findHit)) {
		// 		// binary search to find the hit:
		// 		const index = binarySearch(hits, h => findHit - h[0]);

		// 		if (index >= 0) {
		// 			let firstVisibleHitIndex = Math.abs(binarySearch(hits, h => this.wordstart - h[0]));
		// 			if (this.currentHitInPage != null) {
		// 				this.hitElements[this.currentHitInPage].classList.remove('active');
		// 			}
		// 			this.currentHitInPage = index - firstVisibleHitIndex;
		// 			this.hitElements[this.currentHitInPage].classList.add('active');
		// 			this.hitElements[this.currentHitInPage].scrollIntoView({block: 'center', inline: 'center'});
		// 		}
		// 	}
		// 	window.history.replaceState(undefined, '', new URI().removeSearch('findhit').toString());


		// 	this.hits = hits;
		// })
		// .finally(() => { clearTimeout(spinnerTimeout);  this.loadingForAwhile = false; });
	}
});
</script>

<style lang="scss">
.article-pagination {
	&:not([style]) {
		top: 10%;
		right: 10%
	}
	position: fixed;
	z-index: 1000;
	border: 1px solid #ccc;
	background: white;
	box-shadow:  0px 3px 12px -2px rgba(0,0,0,0.6);
	border-radius: 3px;

	padding: 5px;

	> hr {
		margin: 5px 0;
	}

	>.pagination-container {
		display: flex;
		flex-direction: row;
		align-items: baseline;

		> label {
			margin: 0;
			flex: 0 auto;
			width: 5em;
			min-width: 5em;
			max-width: 5em;
		}

		>.pagination-wrapper {
			display: flex;
			justify-content: center;
			align-items: baseline;
			flex-wrap: nowrap;
			flex: 1 auto;
		}
	}
}

</style>