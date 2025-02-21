<template>
	<div style="display: none;" id="custom-js">
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { CFCustomJsEntry } from '@/types/apptypes';
import * as UIStore from '@/store/ui';
import { compareAsSortedJson } from '@/utils/loadable-streams';

export default Vue.extend({
	data: () => ({
		hasCustomJs: false,
	}),
	computed: {
		// @ts-ignore
		pageName(): string { return this.$route.meta.name as string; },
		customJs(): CFCustomJsEntry[] {
			const js = UIStore.getState().global.config.customJs;
			const jses = [...(js[''] || []), ...(js[this.pageName] || [])].sort((a, b) => a.index - b.index);
			return jses;
		},
		scripts(): string {
			// Escaped forward slash in the close tag is on purpose,
			// there's a bug in the vue compiler or typescript that breaks if it EVER sees a script close tag anywhere.
			// Probably the vue compiler thinking we're closing the script section early.
			// The backslash seems to work around it.
			return this.customJs.map(js => `<script ${Object.entries(js.attributes).map(([k,v]) => v ? `${k}="${v.toString().replace('"', '&quot;')}"` : '').join(' ')}><\/script>`).join('');
		}
	},
	watch: {
		customJs(prev: CFCustomJsEntry[], next: CFCustomJsEntry[]) {
			if (compareAsSortedJson(prev, next)) return;
			// TODO make customjs so that we don't have to do this.
			if (this.hasCustomJs) {
				console.info('Triggering page reload due to polluted global scope (customJs is present)')
				window.location.reload();
			}

			this.hasCustomJs = next.length > 0;
			this.loadScripts();
		}
	},
	methods: {
		loadScripts() {
			this.customJs.forEach(js => {
				const script = document.createElement('script');
				Object.entries(js.attributes).forEach(([k, v]) => v && script.setAttribute(k, v.toString()));
				this.$el.appendChild(script);
			});
		}
	}
})
</script>