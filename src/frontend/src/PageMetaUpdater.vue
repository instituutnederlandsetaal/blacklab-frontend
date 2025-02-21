<template>
	<div>
		<div style="display: none;" id="custom-js"></div>
		<div style="display: none;" id="custom-css">
			<link v-for="css in customCss" v-bind="css.attributes"/>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { CFCustomCssEntry, CFCustomJsEntry, CFPageConfig } from '@/types/apptypes';
import * as UIStore from '@/store/ui';
import { compareAsSortedJson } from '@/utils/loadable-streams';

export default Vue.extend({
	data: () => ({
		hasCustomJs: false,
	}),
	computed: {
		config(): CFPageConfig { return UIStore.getState().global.config; },
		pageName(): string { return this.$route.meta?.name as string || ''; },
		customJs(): CFCustomJsEntry[] {
			const js = this.config.customJs;
			const jses = [...(js[''] || []), ...(js[this.pageName] || [])].sort((a, b) => a.index - b.index);
			return jses;
		},
		customCss(): CFCustomCssEntry[] {
			const csses = this.config.customCss;
			return [...(csses[''] || []), ...(csses[this.pageName] || [])].sort((a, b) => a.index - b.index);
		}
	},
	watch: {
		customJs(prev: CFCustomJsEntry[], next: CFCustomJsEntry[]) {
			if (compareAsSortedJson(prev, next)) return;
			// TODO refactor customizing to avoid having to do this.
			// This is a large job however.
			if (this.hasCustomJs) {
				console.info('Triggering page reload due to polluted global scope (customJs is present)')
				window.location.reload();
			}

			this.hasCustomJs = next.length > 0;
			this.loadScripts();
		},
		config: {
			immediate: true,
			handler() {
				this.updateMeta();
				this.updateTitle();
			}
		},
		pageName: {
			immediate: true,
			handler() {
				this.updateTitle();
			}
		},
	},
	methods: {
		loadScripts() {
			this.customJs.forEach(js => {
				const script = document.createElement('script');
				Object.entries(js.attributes).forEach(([k, v]) => v && script.setAttribute(k, v.toString()));
				this.$el.appendChild(script);
			});
		},

		updateTitle() {
			const newTitle = this.$route.meta?.getTitle?.(this.config.displayName) ?? this.config.displayName;
			document.title = newTitle;
		},

		// TODO this needs to be modernized. We also need things like a manifest?
		updateMeta() {
			const head = document.head;

			// Update favicon links
			const favicons = [
				{ rel: 'icon', type: 'image/png', sizes: '32x32', href: `${this.config.faviconDir}/favicon-32x32.png` },
				{ rel: 'icon', type: 'image/png', sizes: '16x16', href: `${this.config.faviconDir}/favicon-16x16.png` },
				{ rel: 'icon', href: `${this.config.faviconDir}/favicon.ico` },
				{ rel: 'mask-icon', href: `${this.config.faviconDir}/safari-pinned-tab.svg`, color: '#3b3b3b' },
				{ rel: 'shortcut icon', href: `${this.config.faviconDir}/favicon.ico` },
				{ rel: 'apple-touch-icon', href: `${this.config.faviconDir}/apple-touch-icon.png` }
			];

			favicons.forEach(attrs => {
				let link = document.querySelector(`link[rel="${attrs.rel}"][sizes="${attrs.sizes || ''}"]`) as HTMLLinkElement;
				if (!link) {
					link = document.createElement('link') as HTMLLinkElement;
					Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
					head.appendChild(link);
				} else {
					Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
				}
			});

			const descriptionContent = !!this.config.displayName?.length
				? `${this.config.displayName} provided by the Dutch Language Institute in Leiden.`
				: 'AutoSearch provided by the Dutch Language Institute in Leiden.';

			// Update meta tags
			const metaTags = [
				{ name: 'msapplication-config', content: `${this.config.faviconDir}/browserconfig.xml` },
				{ name: 'theme-color', content: '#ffffff' },
				{ name: 'og:description', content: descriptionContent },
				{ name: 'description', content: descriptionContent },
				{ name: 'referrer', content: 'no-referrer' }
			];

			metaTags.forEach(attrs => {
				let meta = document.querySelector(`meta[name="${attrs.name}"]`)as HTMLMetaElement;
				if (!meta) {
					meta = document.createElement('meta');
					Object.entries(attrs).forEach(([k, v]) => meta.setAttribute(k, v));
					head.appendChild(meta);
				} else {
					Object.entries(attrs).forEach(([k, v]) => meta.setAttribute(k, v));
				}
			});


		}
	}
})
</script>