<template>
	<router-view/>
</template>

<script lang="ts">
import Vue from 'vue';

import {i18n} from '@/utils/i18n';
import {store} from '@/store';
import router from '@/router';

export default Vue.extend({
	router,
	i18n,
	store,
})
</script>

<style lang="scss">

</style>