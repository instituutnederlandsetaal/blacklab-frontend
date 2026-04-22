<template>
	<ServerRenderedContentPage :content="content"/>
</template>

<script setup lang="ts">
import { ApiError, frontend } from '@/api';
import ServerRenderedContentPage from '@/components/ServerRenderedContentPage.vue';
import * as CorpusStore from '@/store/corpus';
import { Loadable } from '@/utils/loadable-streams';
import { useAsyncState } from '@vueuse/core';
import { computed } from 'vue';


const contentInput = useAsyncState(frontend.getHelp(CorpusStore.get.indexId() ?? undefined).request, '', { immediate: true });
const content = computed<Loadable<string>>(() => {
	if (contentInput.isLoading.value) return Loadable.Loading();
	if (contentInput.error.value) return Loadable.LoadingError(ApiError.wrap(contentInput.error.value));
	if (contentInput.isReady.value) return Loadable.Loaded(contentInput.state.value);
	return Loadable.Empty();
});

</script>

<style scoped>
/* Add your styles here */
</style>