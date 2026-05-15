<template>
	<div class="navbar-inverse navbar-fixed-top">
		<div class="navbar-alert container" v-if="showBanner">
			<div class="navbar-brand" v-html="config.bannerMessage"></div>
			<button type="button" class="btn btn-navbar" title="Hide banner for one week" @click="hideBanner"><span class="fa fa-times"></span></button>
		</div>

		<div class="navbar-main container">
			<div class="navbar-logo-container">
				<router-link :to="indexId ? { name: 'search', params: { corpus: indexId } } : { name: 'corpora' }">
					<div class="navbar-logo"></div>
				</router-link>
			</div>

			<div class="navbar-content-container">
				<!-- <router-link class="navbar-brand" :to="indexId ? {name: 'search', params: {corpus: indexId}} : {name: 'corpora'}" >{{ indexDisplayName }}</router-link> -->

				<ul class="nav navbar-nav navbar-collapse" :class="{ visible: !collapsed }">
					<li v-if="isUserCorpus">
						<router-link :to="{ name: 'corpora' }">{{ $t('navbar.myCorpora') }}</router-link>
					</li>
					<li v-for="link in links" :key="link.attributes.href">
						<component :is="link.isExternal ? 'a' : 'router-link'" v-bind="link.attributes">{{ link.label }}</component>
					</li>
				</ul>

				<div class="navbar-buttons">
					<LoginButton style="display: inline-block" />
					<LocaleSelector style="display: inline-block" />
					<button class="btn btn-navbar navbar-toggle" type="button" @click="collapsed = !collapsed">
						<span class="fa fa-bars"></span>
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useCurrentConfig } from '@/app/plugins/installCorpusData';
import { useCurrentCorpusId } from '@/app/plugins/installRouter';

import { getCorpusOwner } from '@/shared/blacklab-helpers/normalize-responses';
import { localStorageSynced } from '@/shared/utils/localstore';

import LoginButton from '@/shared/auth/LoginButton.vue';
import LocaleSelector from '@/shared/i18n/LocaleSelector.vue';

const collapsed = ref(true);
const bannerFromLocalStorage = localStorageSynced<string>('cf/banner-hidden', '', false, 24 * 7 * 3600);

const indexId = useCurrentCorpusId();
const config = useCurrentConfig();
const router = useRouter();

const isUserCorpus = computed(() => Boolean(indexId.value && getCorpusOwner(indexId.value)));

const links = computed(() =>
	config.navbarLinks.map<{ label: string; attributes: Record<string, string>; isExternal: boolean }>(l => {
		const parsed = new URL(l.attributes.href, window.location.origin);
		const routerBase = router.options.history.base || '/';
		const isExternal = parsed.origin !== window.location.origin || !parsed.pathname.startsWith(routerBase);
		if (isExternal) return { ...l, isExternal };
		// else we need to remove the router's base from the link, or it will double up
		// so reconstruct the link..
		// Also we need to make sure that 'href' is not in the attributes (or router-link will not add the href attribute to its <a> at all???)
		const { href, target, ...attributesWithoutHref } = l.attributes;
		return {
			isExternal,
			...l,
			attributes: {
				...attributesWithoutHref,
				to: parsed.pathname.substring(routerBase.length) + parsed.search + parsed.hash,
			},
		};
	}),
);
const showBanner = computed(() => !!config.bannerMessage && bannerFromLocalStorage.value !== config.bannerMessage);

function hideBanner() {
	bannerFromLocalStorage.value = config.bannerMessage!;
}
</script>

<style lang="scss">
body {
	padding-top: 60px;
}

.btn.btn-navbar {
	border: none;
	color: #9d9d9d;
	* {
		color: inherit;
	}
	background: transparent;
	background-color: transparent;
	margin: 0;
	&:not(:disabled, .disabled) {
		&:active,
		&:focus,
		&:hover {
			color: #ddd;
			background-color: #333;
		}
	}
	&:disabled {
		opacity: 1;
	}
}
.combobox {
	vertical-align: baseline !important;
} // selectpicker
.menu-caret {
	margin: 0;
}

// clear some bootstrap float, padding and clearfix stuff
.navbar-inverse {
	&,
	* {
		float: none !important;
		&:not(.fa, .menu-value) {
			&:before,
			&:after {
				display: none !important;
				content: '';
			}
		}
	}

	> .container {
		padding: 0;
	} // padding comes from content, we only use this for margin/width

	button.btn {
		padding: 15px;
		margin: 0;
	}
}
.navbar-brand {
	height: unset;
	color: #ddd !important;
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
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
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
		}
	}
	@at-root .navbar-content-container {
		display: flex;
		flex-wrap: wrap;
		flex-grow: 1;
		align-items: baseline;

		> .navbar-nav {
			margin: 0;
			padding: 0;
			flex-grow: 1;
		}
		> .navbar-nav > li {
			display: inline-block;
		}
		> .navbar-buttons {
			flex-grow: 1;
			text-align: right;
		}

		@media (max-width: 767px) {
			justify-content: space-between;

			.navbar-nav {
				width: 100%;
				order: 3;
				padding: 7.5px 0;

				> li {
					display: block;
				}
				&:not(.visible) {
					display: none;
				}
			}
		}
	}
}
</style>
