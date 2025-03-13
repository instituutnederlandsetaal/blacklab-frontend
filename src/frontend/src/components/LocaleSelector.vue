<template>
<SelectPicker
	class="locale"
	data-class="btn-navbar"
	data-width="auto"
	data-menu-width="auto"
	right
	hideEmpty
	:placeholder="'🌐\uFE0E'"

	:options="availableLocales"
	:loading="loading.value"
	:showValues="false"

	v-model="$i18n.locale"
/>

</template>

<script lang="ts">
import Vue from 'vue';
import SelectPicker from '@/components/SelectPicker.vue';

import {i18n, loading, availableLocales} from '@/utils/i18n';

export default Vue.extend({
	i18n,
	components: { SelectPicker },
	data: () => ({ loading, availableLocales }),
});

</script>

<style scoped>

/* .locale .placeholder {
	color: transparent!important;
	text-shadow: 0px 0px inherit;
} */
</style>
