<template>
<SelectPicker
	class="locale-select navbar-dropdown"
	data-class="btn-link navbar-brand navbar-dropdown-button"
	data-width="auto"
	data-menu-width="auto"
	right
	hideEmpty
	placeholder="🌐"

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