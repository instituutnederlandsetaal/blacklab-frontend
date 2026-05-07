<template>
	<ServerRenderedContentPage :content="content"/>
</template>

<script setup lang="ts">
import { useFrontendApi } from '@/_new/app/plugins/installApi';
import { useMarkPageBootstrapSettledWhen } from '@/_new/app/routes/page-bootstrap';
import { ApiError } from '@/_new/shared/api/lib/api-types';
import { Loadable } from '@/_new/utils/loadable/loadable-streams';
import ServerRenderedContentPage from '@/components/ServerRenderedContentPage.vue';
import * as CorpusStore from '@/features/corpus/model/corpus-state';
import { useAsyncState } from '@vueuse/core';
import { computed } from 'vue';


const contentInput = useAsyncState(useFrontendApi().getAbout(CorpusStore.get.indexId() ?? undefined).request, '', { immediate: true });
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