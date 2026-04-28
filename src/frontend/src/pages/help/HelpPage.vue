<template>
	<ServerRenderedContentPage :content="content"/>
</template>

<script setup lang="ts">
import { ApiError, frontend } from '@/_new/shared/api';
import ServerRenderedContentPage from '@/components/ServerRenderedContentPage.vue';
import * as CorpusStore from '@/features/corpus/model/corpus-state';
import { useMarkPageBootstrapSettledWhen } from '@/navigation/page-bootstrap';
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

useMarkPageBootstrapSettledWhen(computed(() => content.value.isLoaded() || content.value.isError()));

</script>

<style scoped>
/* Add your styles here */
</style>