<template>
	<HtmlRenderer :content="content" execute-scripts parse-string-as-html />
</template>

<script setup lang="ts">
import { watchEffect } from 'vue';

import { usePageBootstrap } from '@/navigation/page-bootstrap';
import { useCorpusId } from '@/navigation/page-context';

import { useFrontendApi } from '@/shared/api';
import { loadableFromStream } from '@/shared/utils/loadable/loadable-stream';

import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';

const frontend = useFrontendApi();
const pageBootstrap = usePageBootstrap();

const content = loadableFromStream(frontend.getHelp(useCorpusId().value).toObservable());
watchEffect(() => {
	if (content.isLoaded() || content.isError()) {
		pageBootstrap.markSettled();
	}
});
</script>

<style scoped>
/* Add your styles here */
</style>
