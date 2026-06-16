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
		:options="i18n.availableLocales.value"
		:loading="i18n.loading.value"
		:showValues="false"
		:modelValue="i18n.localeState.value?.value"
		:onBeforeSelect="
			v => {
				i18n.setLocale(v.value);
				return false;
			}
		"
	>
		<template #option-label="{ option }">
			<span :class="option.error ? 'text-danger' : ''" :title="option.error">
				<Spinner inline v-if="option.loading" />
				<span class="fa fa-exclamation-triangle" v-if="option.error"></span> {{ option.label }}
			</span>
		</template>
	</SelectPicker>
</template>

<script setup lang="ts">
import { useI18nManager } from '@/shared/i18n';

import SelectPicker from '@/components/SelectPicker.vue';
import Spinner from '@/components/Spinner.vue';

const i18n = useI18nManager();
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
