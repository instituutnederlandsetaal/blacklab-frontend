<template>
	<div class="navbar-inverse navbar-fixed-top">
		<div class="navbar-alert container" v-if="showBanner">
			<div class="navbar-brand" v-html="config.bannerMessage"></div>
			<button type="button" class="btn btn-navbar" title="Hide banner for one week" @click="hideBanner"><span class="fa fa-times"></span></button>
		</div>

		<div class="navbar-main container">
			<div class="navbar-logo-container">
				<div class="navbar-logo"></div>
			</div>

			<div class="navbar-content-container">
				<router-link class="navbar-brand" :to="indexId ? {name: 'search', params: {corpus: indexId}} : {name: 'corpora'}" >{{ indexDisplayName }}</router-link>

				<ul class="nav navbar-nav navbar-collapse" :class="{visible: !collapsed}">
					<li v-for="link in links" :key="link.attributes.href">
						<router-link v-if="!link.isExternal" :to="link.attributes.href" v-bind="{...link.attributes, href: undefined}">{{ link.label }}</router-link>
						<a v-else v-bind="link.attributes">{{ link.label }}</a>
					</li>
				</ul>

				<div class="navbar-buttons">
					<LoginButton/>
					<LocaleSelector/>
					<button class="btn btn-navbar navbar-toggle" type="button" @click="collapsed = !collapsed">
						<span class="fa fa-bars"></span>
						<!-- <span class="icon-bar"></span>
						<span class="icon-bar"></span>
						<span class="icon-bar"></span> -->
					</button>
				</div>
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
	data() {
		return {
			collapsed: true,
			bannerFromLocalStorage: localStorageSynced<string>('cf/banner-hidden', '', false, 24*7*3600)
		};
	},
	computed: {
		indexId: CorpusStore.get.indexId, // separate from index - the ID is available before the index is loaded
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

<style lang="scss">

body { padding-top: 60px; }

.btn.btn-navbar {
	border: none;
	color: #9d9d9d;
	* { color: inherit; }
	background: transparent;
	background-color: transparent;
	margin: 0;
	&:not(:disabled, .disabled) { &:active, &:focus, &:hover {
		color: #ddd;
		background-color: #333;
	}}
	&:disabled {opacity: 1;}
}
.combobox {vertical-align: baseline!important;} // selectpicker
.menu-caret { margin: 0; }

// clear some bootstrap float, padding and clearfix stuff
.navbar-inverse {
	&, * {
		float: none!important;
		&:not(.fa, .menu-value) { &:before, &:after {display: none!important; content: "";} }
	}

	> .container { padding: 0; } // padding comes from content, we only use this for margin/width

	button.btn {
		padding: 15px;
		margin: 0;
	}
}
.navbar-brand {
	height: unset;
	color: #ddd!important;
}


// own layout.
.navbar-alert {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	> .navbar-hide {
		padding: 9px 10px;
		color: #ddd;
	}
	& + .navbar-main {
		box-shadow: inset 0 1px 0 rgba(255,255,255,.1);
		border-top: 1px solid #101010;
	}
}

.navbar-main {
	display: flex;
	align-items: baseline;
	flex-wrap: nowrap;

	@at-root .navbar-logo-container {
		display: none; // logo must enabled by user customization
		flex: 0;
		align-self: flex-start;
		padding: 5px 15px 15px;
		height: 1px;
		overflow: visible;
		width: auto; // from child

		@at-root .navbar-logo {
			width: 100px;
			height: 100px;
			z-index: 9000;
			background-image: url(~@/assets/img/logo_100x100.png)
		}
	}
	@at-root .navbar-content-container {
		display: flex;
		flex-wrap: wrap;
		flex-grow: 1;
		align-items: baseline;

		> .navbar-nav { margin: 0; padding: 0; flex-grow: 1; }
		> .navbar-nav > li { display: inline-block; }
		// > .navbar-buttons { flex-grow: 1; text-align: right; }

		@media(max-width: 767px) {
			justify-content: space-between;

			.navbar-nav {
				width: 100%;
				order: 3;
				padding: 7.5px 0;

				> li { display: block; }
				&:not(.visible) { display: none; }
			}
		}
	}
}

</style>