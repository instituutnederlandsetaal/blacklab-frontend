<template>
	<div style="display: none;" id="custom-css">
		<link v-for="css in customCss" v-bind="css.attributes"/>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { CFCustomCssEntry } from '@/types/apptypes';
import * as UIStore from '@/store/ui';

export default Vue.extend({
	computed: {
		customCss(): CFCustomCssEntry[] {
			// @ts-ignore
			const pagename = this.$router.currentRoute.meta.name as string;
			const csses = UIStore.getState().global.config.customCss;
			return [...(csses[''] || []), ...(csses[pagename] || [])].sort((a, b) => a.index - b.index);
		}
	}
})
</script>