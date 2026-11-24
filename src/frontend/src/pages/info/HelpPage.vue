<template>
	<HtmlRenderer :content="content" execute-scripts parse-string-as-html @settled="onContentSettled" />
</template>

<script setup lang="ts">
import { usePageContent } from '@/pages/info/use-page-content';

import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';

const { content, onContentSettled } = usePageContent('getHelp');
</script>
