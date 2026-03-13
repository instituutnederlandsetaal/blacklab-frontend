<template>
	<SelectPicker
		class="locale-select navbar-dropdown"
		data-class="btn-link navbar-brand navbar-dropdown-button"
		data-width="auto"
		data-menu-width="auto"
		right
		hideEmpty
		placeholder="🌐"
		allowUnknownValues

		:options="availableLocales"
		:loading="loading"
		:showValues="false"
		v-model="value"
	/>
</template>


<script lang="ts">
import Vue from 'vue';
import SelectPicker from '@/components/SelectPicker.vue';

import {i18n, i18nManager} from '@/utils/i18n';

export default Vue.extend({
	i18n,
	components: { SelectPicker },
	computed: {
		value: {
			get(): string|null|undefined { return i18nManager.localeState.value?.value; },
			set(v: string) { i18nManager.setLocale(v); }
		},
		loading(): boolean { return i18nManager.loading.value; },
		availableLocales() { return i18nManager.availableLocales.value; }
	},
});

</script>

<style scoped>

/* .locale .placeholder {
	color: transparent!important;
	text-shadow: 0px 0px inherit;
} */
</style>
