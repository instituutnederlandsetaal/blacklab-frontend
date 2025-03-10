<template>
	<ul id="tlyPageGuide" data-tourtitle="Searching the corpus">
		<li class="tlypageguide_top" data-tourtarget="a[href='#simple']">
			<div v-html="$t('pageGuide.simple')"></div>
		</li>
		<li class="tlypageguide_top" data-tourtarget="a[href='#extended']">
			<div v-html="$t('pageGuide.extended')"></div>
		</li>

		<li class="tlypageguide_bottom" data-tourtarget="#extended_split_batch">
			<div v-html="$t('pageGuide.split')"></div>
		</li>

		<li class="tlypageguide_left" data-tourtarget=".propertyfield .file-input-button">
			<div v-html="$t('pageGuide.upload')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget="a[href='#advanced']">
			<div v-html="$t('pageGuide.querybuilder')"></div>
		</li>




		<li class="tlypageguide_top" data-tourtarget=".bl-token .panel-heading">
			<div v-html="$t('pageGuide.token')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget=".bl-token-create">
			<div v-html="$t('pageGuide.tokenButton')"></div>
		</li>

		<li class="tlypageguide_right" data-tourtarget=".bl-token-attribute">
			<div v-html="$t('pageGuide.attribute')"></div>
		</li>


		<li class="tlypageguide_top" data-tourtarget="a[href='#expert']">
			<div v-html="$t('pageGuide.CQLeditor')"></div>
		</li>

		<li class="tlypageguide_bottom" data-tourtarget="#gapFilling">
			<div v-html="$t('pageGuide.TSVbutton')"></div>
		</li>

		<li class="tlypageguide_bottom" data-tourtarget="#importQuery">
			<div v-html="$t('pageGuide.importQuery')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget="#filterContainer">
			<div v-html="$t('pageGuide.metedata')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget="#resultTabs">
			<div v-html="$t('pageGuide.results')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget=".results-table th .dropdown">
			<div v-html="$t('pageGuide.sortHits')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget=".doctitle a">
			<div v-html="$t('pageGuide.showHit')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget=".results-table tr.concordance">
			<div v-html="$t('pageGuide.clickHit')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget=".groupselect">
			<div v-html="$t('pageGuide.resultsGrouped')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget=".group-size-indicator">
			<div v-html="$t('pageGuide.clickGroup')"></div>
		</li>

		<li class="tlypageguide_top" data-tourtarget=".open-concordances">
			<div v-html="$t('pageGuide.clickGoBack')"></div>
		</li>

		<li class="tlypageguide_right" data-tourtarget="tr.document">
			<div v-html="$t('pageGuide.documentInfo')"></div>
		</li>
	</ul>
</template>

<script>
import Vue from 'vue';
import $ from 'jquery';

import '@/vendor/pageguide.min.js';

/**
 * Enable pageguide-js tutorials on the page and augment its behavior a little.
 */

/**
 * Search an element's parents to find if any of them creates a new stacking context, and if so, get that element's z-index.
 * If no parent creates a new stacking context, get the element's own z-index.
 * If that is set to "auto", returns 1.
 *
 * @param {JQuery} $el the element for which to determine the stacking context root
 */
function getStackingContextZIndex($el) {
	var $stackingContexts = $el.parents().filter(function() {
		var $this = $(this);

		return this !== document && this !== document.documentElement && (
			(($this.css('position') === 'absolute' || $this.css('position') === 'relative') && $this.css('z-index') !== 'auto') ||
			($this.parent().css('display') === 'flex' && $this.parent().css('z-index') !== 'auto') ||
			$this.css('position') === 'fixed' || $this.position === 'sticky' ||
			$this.css('opacity') != 1 ||
			$this.css('transform') !== 'none'
			// uncommon and commonly unsupported settings omitted
		);
	});

	var $ctxElement = $stackingContexts.length ? $stackingContexts.last() : $el;
	var index = $ctxElement.css('z-index');
	return index !== 'auto' ? Number.parseInt(index) : 1;
}

/**
 * We replace the checkTargets function to enhance the z-index handling.
 * Normally tooltips inherit the z-index of the element they're attached to.
 * This is fine, except when that target element is within a different stacking context than the tooltip.
 * In this case we need to know the z-index of the root of that stacking context, instead of the z-index of the direct target element.
 * Or we could end up way too low or high.
 */
function monkeyPatchPageguide() {
	window.tl.pg.PageGuide.prototype.checkTargets = function () { //eslint-disable-line
		var self = this;
		var visibleIndex = 0;
		var newVisibleTargets = [];
		for (var target in self.targetData) {
			var $elements = $(target);
			var $el;
			// assume all invisible
			var newTargetData = {
				targetStyle: {
					display: 'none'
				}
			};
			// find first visible instance of target selector per issue #4798
			for(var i = 0; i < $elements.length; i++){
				if($($elements[i]).is(':visible') ){
					$el = $($elements[i]); // is it weird to '$($x)'?

					newTargetData.targetStyle.display = 'block';
					var offset = $el.offset();
					$.extend(newTargetData.targetStyle, {
						top: offset.top,
						left: offset.left,
						width: $el.outerWidth(),
						height: $el.outerHeight(),
						'z-index': getStackingContextZIndex($el)
					});
					visibleIndex++;
					newTargetData.index = visibleIndex;
					newVisibleTargets.push(target);
					break;
				}
			}
			var diff = {
				target: target
			};
			// compare new styles with existing ones
			for (var prop in newTargetData.targetStyle) {
				if (newTargetData.targetStyle[prop] !== self.targetData[target][prop]) {
					if (diff.targetStyle == null) {
						diff.targetStyle = {};
					}
					diff.targetStyle[prop] = newTargetData.targetStyle[prop];
				}
			}
			// compare index with existing index
			if (newTargetData.index !== self.targetData[target].index) {
				diff.index = newTargetData.index;
			}
			// push diff onto changequeue if changes have been made
			if (diff.targetStyle != null || diff.index != null) {
				self.changeQueue.push(diff);
			}
			$.extend(self.targetData[target], newTargetData);
		}
		self.visibleTargets = newVisibleTargets;
	};
}

let inited = false;

export default Vue.extend({
	mounted() {
		if (!inited) {
			monkeyPatchPageguide();

			window.tl.pg.init({ // eslint-disable-line
				auto_refresh: true,
				default_zindex: 1, // don't use auto, or overlays will appear beneath elements on the same layer as content is inserted at the top of the page
			});

			inited = true;
		}

	}
})

</script>