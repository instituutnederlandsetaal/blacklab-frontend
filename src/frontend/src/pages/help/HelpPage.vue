<template>
	<ServerRenderedContentPage :content="content" />
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core';
import { computed, watchEffect } from 'vue';

import * as CorpusStore from '@/features/corpus/model/corpus-state';
import { usePageBootstrap } from '@/navigation/page-bootstrap';

import { useFrontendApi } from '@/shared/api';
import { ApiError } from '@/shared/api/lib/api-types';
import { Loadable } from '@/shared/utils/loadable/loadable';

import ServerRenderedContentPage from '@/components/ServerRenderedContentPage.vue';

const frontend = useFrontendApi();
const pageBootstrap = usePageBootstrap();

const contentInput = useAsyncState(frontend.getHelp(CorpusStore.get.indexId() ?? undefined).request, '', { immediate: true });
const content = computed<Loadable<string>>(() => {
	if (contentInput.isLoading.value) return Loadable.Loading();
	if (contentInput.error.value) return Loadable.LoadingError(ApiError.wrap(contentInput.error.value));
	if (contentInput.isReady.value) return Loadable.Loaded(contentInput.state.value);
	return Loadable.Empty();
});
watchEffect(() => {
	if (content.value.isLoaded() || content.value.isError()) {
		pageBootstrap.markSettled();
	}
});
</script>

<style scoped>
/* Add your styles here */
</style>
