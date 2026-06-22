<template>
	<div ref="content"></div>
</template>

<script setup lang="ts">
import { useTemplateRef, watchEffect } from 'vue';

const props = defineProps<{
	value: HTMLElement | null | undefined | string;
}>();

const content = useTemplateRef<HTMLDivElement>('content');

watchEffect(() => {
	if (props.value) content.value?.replaceChildren(props.value);
	else content.value?.replaceChildren();
});
</script>
