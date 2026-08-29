<template>
	<HtmlRenderer :content="content" execute-scripts parse-string-as-html />
</template>

<script setup lang="ts">
import { useTerminalPageContent } from '@/pages/useTerminalPageContent';

import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';

const content = useTerminalPageContent('getHelp');
</script>
