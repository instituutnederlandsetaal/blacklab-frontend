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

		:options="i18n.manager.availableLocales.value"
		:loading="i18n.manager.loading.value"
		:showValues="false"
		:value="i18n.manager.localeState.value?.value"
		@select="(v) => { i18n.manager.setLocale(v.value); return false; }"
	/>
</template>


<script setup lang="ts">
import SelectPicker from '@/components/SelectPicker.vue';
import i18n from '@/utils/i18n';
</script>

<style scoped>

.locale-select {
	display: inline-block;
}
/* .locale .placeholder {
	color: transparent!important;
	text-shadow: 0px 0px inherit;
} */
</style>
