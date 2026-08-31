<template>
	<div>
		<button type="button" class="btn btn-default" :aria-expanded="open" :aria-controls="id" @click="open = !open">
			{{ label }}
		</button>
		<div :id class="collapse" :class="{ in: open }">
			<slot></slot>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
	id: string;
	label: string;
}>();

const open = ref(false);
</script>
