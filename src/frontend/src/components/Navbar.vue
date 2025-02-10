<template>
	<div class="navbar navbar-inverse navbar-fixed-top">
		<!-- <div v-if="showBanner" class="container alert alert-dismissable navbar-alert">
			<div class="message" v-html="bannerMessage"></div>
			<button type="button" class="btn btn-link btn-lg" data-dismiss="alert" title="Dismiss" @click="dismissBanner"><span class="fa fa-times"></span></button>
		</div> -->

		<div class="container">
			<div class="navbar-header">
				<div class="navbar-logo-container">
					<div class="navbar-logo"></div>
				</div>

				<a v-if="index" class='navbar-brand' :href="`${CONTEXT_URL}/${index.id}/search/`">{{ indexDisplayName }}</a>
				<a v-else class='navbar-brand' :href="`${CONTEXT_URL}/`">{{ indexDisplayName }}</a>
			</div>

			<div class="navbar-collapse collapse navbar-logo-margin" :class="{collapse: collapsed, in: !collapsed}">
				<ul class="nav navbar-nav">
					<li v-for="link in links" :key="link.attributes.href">
						<a v-bind="link.attributes">{{ link.label }}</a>
					</li>
				</ul>
			</div>

			<div class="navbar-buttons">
				<LoginButton/>
				<LocaleSelector/>
				<button class="navbar-toggle" type="button" @click="collapsed = !collapsed">
					<span class="icon-bar"></span>
					<span class="icon-bar"></span>
					<span class="icon-bar"></span>
				</button>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import LocaleSelector from '@/components/LocaleSelector.vue';
import LoginButton from '@/components/LoginButton.vue';
import { CFNavbarLink, CFPageConfig, NormalizedIndex } from '@/types/apptypes';
import * as UIStore from '@/store/ui';
import * as CorpusStore from '@/store/corpus';

export default Vue.extend({
	components: {LocaleSelector, LoginButton },
	props: {
		// bannerMessage: String,
		// bannerMessageCookie: String,
		// indexId: String,
		// cfUrlOnClient: String,
		// displayName: String,
		// links: Array as () => Array<{label: string, attributes: Record<string, string>}>
	},
	data() {
		return {
			showBanner: true,
			collapsed: true,
			CONTEXT_URL,
		};
	},
	computed: {
		index(): NormalizedIndex|null { return CorpusStore.getState(); },
		config(): CFPageConfig { return UIStore.getState().global.config; },
		// bannerMessage(): string|undefined { return UIStore.getState().global.config.bannerMessage }
		indexDisplayName(): string { return this.index ? (this.config.displayName || this.index.displayName) : this.config.displayName },
		links(): CFNavbarLink[] { return this.config.navbarLinks },
	},
	methods: {
		// checkBannerCookie() {
		// 	const cookieValue = localStorage.getItem(this.bannerMessageCookie);
		// 	if (cookieValue === this.bannerMessage) {
		// 		this.showBanner = false;
		// 	}
		// },
		// dismissBanner() {
		// 	localStorage.setItem(this.bannerMessageCookie, this.bannerMessage);
		// 	this.showBanner = false;
		// }
	},
	// created() {
	// 	this.checkBannerCookie();
	// },
})
</script>

<style scoped>
/* Add your styles here */
</style>