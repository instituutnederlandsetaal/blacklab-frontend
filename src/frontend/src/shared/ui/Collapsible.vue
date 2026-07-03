<template>
	<div>
		<button type="button" :class="buttonClass" :aria-expanded="open" :aria-controls="panelId" @click="open = !open">
			<slot name="button" :open="open">{{ label }}</slot>
		</button>
		<div :id="panelId" class="collapse" :class="{ in: open }">
			<slot></slot>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import useUid from '@/shared/utils/uid';

defineOptions({
	name: 'Collapsible',
});

const props = withDefaults(
	defineProps<{
		label?: string;
		id?: string;
		buttonClass?: string;
		initiallyOpen?: boolean;
	}>(),
	{
		label: 'Toggle',
		buttonClass: 'btn btn-default',
		initiallyOpen: false,
	},
);

const uid = useUid();
const open = ref(props.initiallyOpen);
const panelId = computed(() => props.id ?? `collapsible-${uid}`);
</script>
