<template>
	<div class="navbar navbar-inverse navbar-fixed-top">
		<div v-if="showBanner" class="container alert alert-dismissable navbar-alert">
			<div class="message" v-html="config.bannerMessage"></div>
			<button type="button" class="btn btn-link btn-lg" title="Hide banner for one week" @click="hideBanner"><span class="fa fa-times"></span></button>
		</div>

		<div class="container">
			<div class="navbar-header">
				<div class="navbar-logo-container">
					<div class="navbar-logo"></div>
				</div>

				<router-link :to="indexId ? {name: 'search', params: {corpus: indexId}} : {name: 'corpora'}" class="navbar-brand">{{ indexDisplayName }}</router-link>
			</div>

			<div class="navbar-collapse collapse navbar-logo-margin" :class="{collapse: collapsed, in: !collapsed}">
				<ul class="nav navbar-nav">
					<li v-for="link in links" :key="link.attributes.href">
						<router-link v-if="!link.isExternal" :to="link.attributes.href" v-bind="{...link.attributes, href: undefined}">{{ link.label }}</router-link>
						<a v-else v-bind="link.attributes">{{ link.label }}</a>
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
import { localStorageSynced } from '@/utils/localstore';
import { escapeRegex } from '@/utils';

export default Vue.extend({
	components: {LocaleSelector, LoginButton },
	props: {

	},
	data() {
		return {
			collapsed: true,
			CONTEXT_URL,

			bannerFromLocalStorage: localStorageSynced<string>('cf/banner-hidden', '', false, 24*7*3600)
		};
	},
	computed: {
		indexId(): string|null { return CorpusStore.get.indexId(); },
		index(): NormalizedIndex|null { return CorpusStore.getState(); },
		config(): CFPageConfig { return UIStore.getState().global.config; },
		// A little speficic, but this way on purpose, since the config and index are loaded async, and we want to show something asap.
		// If no index is loaded at all, show the default corpus-frontend name.
		indexDisplayName(): string { return this.config.displayName || this.index?.displayName || this.indexId || 'Corpus-Frontend' },
		links(): Array<CFNavbarLink&{isExternal: boolean}> { return this.config.navbarLinks.map(l => ({
			...l,
			attributes: {
				...l.attributes,
				// vue-router will automatically prepend the basepath to the href, so we need to remove it here
				// to avoid double basepath in the final href
				href: l.attributes.href.startsWith(CONTEXT_URL) ? l.attributes.href.replace(new RegExp('^' + escapeRegex(CONTEXT_URL)), '')  : l.attributes.href
			},
			isExternal: !l.attributes.href.startsWith(CONTEXT_URL)
		})) },
		showBanner(): boolean { return !!this.config.bannerMessage && this.bannerFromLocalStorage.value !== this.config.bannerMessage },
	},
	methods: {
		hideBanner() {
			this.bannerFromLocalStorage.value = this.config.bannerMessage!;
		}
	},
})
</script>

<style scoped>
/* Add your styles here */
</style>