<template>
	<div id="custom-js-css"></div>
</template>

<script lang="ts">
import Vue from 'vue';
import { CFCustomCssEntry, CFCustomJsEntry, CFPageConfig } from '@/types/apptypes';
import * as UIStore from '@/store/ui';
import { compareAsSortedJson } from '@/utils/loadable-streams';

export default Vue.extend({
	data: () => ({
		hasCustomJs: false,
		elementMarker: 'data-vue-meta'
	}),
	computed: {
		// Vue-router sometimes take one tick to properly set the route.
		// If we already mounted customJs etc for the empty route, and the corpus defines customJs for the empty route,
		// Then once we load the actual route, we'd trigger a refresh
		// So try to prevent all logic from running until the route is properly set.
		// That way we can be sure that a navigation is actually happening when we update.
		routerIsInitialized(): boolean { return this.$route.name != null; },
		config(): CFPageConfig { return UIStore.getState().global.config; },
		pageName(): string { return this.$route.meta?.name as string || ''; },

		title(): string {
			if (!this.routerIsInitialized) return '';
			return this.$route.meta?.getTitle?.(this.config.displayName) ?? this.config.displayName;
		},
		customJs(): CFCustomJsEntry[] {
			if (!this.routerIsInitialized) return [];
			const js = this.config.customJs;
			const jses = [...(js[''] || []), ...(js[this.pageName] || [])].sort((a, b) => a.index - b.index);
			return jses;
		},
		customCss(): CFCustomCssEntry[] {
			if (!this.routerIsInitialized) return [];
			const csses = this.config.customCss;
			return [...(csses[''] || []), ...(csses[this.pageName] || [])].sort((a, b) => a.index - b.index);
		},
		meta(): Array<{tagName: string}&Record<string, string>> {
			if (!this.routerIsInitialized) return [];

			const descriptionContent = !!this.config.displayName?.length
				? `${this.config.displayName} provided by the Dutch Language Institute in Leiden.`
				: 'AutoSearch provided by the Dutch Language Institute in Leiden.';

			return [
				// base favicon at the top - Firefox gives up if it encounters an unloadable icon, so try the most common icon first.
				// (we don't know which icons the user added, so this is a best-effort)
				{ tagName: 'link', rel: 'icon', href: `${this.config.faviconDir}/favicon.ico` },
				{ tagName: 'link', rel: 'icon', type: 'image/png', sizes: '32x32', href: `${this.config.faviconDir}/favicon-32x32.png` },
				{ tagName: 'link', rel: 'icon', type: 'image/png', sizes: '16x16', href: `${this.config.faviconDir}/favicon-16x16.png` },
				{ tagName: 'link', rel: 'mask-icon', href: `${this.config.faviconDir}/safari-pinned-tab.svg`, color: '#3b3b3b' },
				{ tagName: 'link', rel: 'shortcut icon', href: `${this.config.faviconDir}/favicon.ico` },
				{ tagName: 'link', rel: 'apple-touch-icon', href: `${this.config.faviconDir}/apple-touch-icon.png` },

				{ tagName: 'meta', name: 'msapplication-config', content: `${this.config.faviconDir}/browserconfig.xml` },
				{ tagName: 'meta', name: 'theme-color', content: '#ffffff' },
				{ tagName: 'meta', name: 'og:description', content: descriptionContent },
				{ tagName: 'meta', name: 'description', content: descriptionContent },
				{ tagName: 'meta', name: 'referrer', content: 'no-referrer' }
			]
		}
	},
	watch: {
		title: {
			immediate: true,
			handler() { if (this.title) document.title = this.title; }
		},
		/** Javascript only works when manually appending script elements. Therefor we can't do this in the template. */
		customJs: {
			immediate: true,
			handler(next: CFCustomJsEntry[], prev: CFCustomJsEntry[]) {
				// TODO refactor customizing to avoid having to reload the page.
				// This is a large job however.
				if (this.hasCustomJs) {
					console.info('Triggering page reload due to polluted global scope (customJs is present)')
					window.location.reload();
				}
				this.hasCustomJs = next.length > 0;

				this.removeScripts()
				this.customJs.forEach(js => {
					const script = document.createElement('script');
					Object.entries(js.attributes).forEach(([k, v]) => v && script.setAttribute(k, v.toString()));
					script.setAttribute(this.elementMarker, '');
					this.$el.appendChild(script);
				});
			},
		},
		customCss: {
			immediate: true,
			handler(next: CFCustomCssEntry[], prev: CFCustomCssEntry[]) {
				if (compareAsSortedJson(next, prev)) return;

				this.removeCss();
				this.customCss.forEach(css => {
					const link = document.createElement('link');
					Object.entries(css.attributes).forEach(([k, v]) => v && link.setAttribute(k, v.toString()));
					link.setAttribute(this.elementMarker, '');
					this.$el.appendChild(link);
				});
			}
		},
		meta: {
			immediate: true,
			handler() {
				this.removeMeta();
				this.meta.forEach(attrs => {
					const el = document.createElement(attrs.tagName) as HTMLElement;
					Object.entries(attrs).forEach(([k, v]) => { if (k !== 'tagName') el.setAttribute(k, v); });
					el.setAttribute(this.elementMarker, '');
					document.head.appendChild(el);
				});
			}
		}
	},
	methods: {
		removeScripts() { this.$el?.querySelectorAll?.(`script[${this.elementMarker}]`).forEach(e => e.remove()); },
		removeMeta() { document.head.querySelectorAll?.(`[${this.elementMarker}]`).forEach(e => e.remove()); },
		removeCss() { this.$el?.querySelectorAll?.(`link[${this.elementMarker}]`).forEach(e => e.remove()); },
	},
	beforeDestroy() {
		this.removeScripts();
		this.removeMeta();
		this.removeCss();
	}
})
</script>