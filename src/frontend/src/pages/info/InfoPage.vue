<template>
	<HtmlRenderer :content="content" execute-scripts parse-string-as-html @settled="pageBootstrap.markScriptsReady" />
</template>

<script setup lang="ts">
import { usePageBootstrap } from '@/app/router/page-bootstrap';

import { useFrontendApi } from '@/shared/api';
import { useRequestResource } from '@/shared/utils/loadable/loadable-request-resource';

import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';

const props = defineProps<{ endpoint: 'getAbout' | 'getHelp'; corpusId?: string }>();
const api = useFrontendApi();
const pageBootstrap = usePageBootstrap();
const { current: content } = useRequestResource(({ endpoint, corpusId }) => api[endpoint](corpusId), {
	source: () => ({ endpoint: props.endpoint, corpusId: props.corpusId }),
});
</script>
