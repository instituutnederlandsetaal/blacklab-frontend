<template>
	<div>
		<div class="btn-group">
			<button
				v-for="(s, i) in steps"
				:key="s.value"
				type="button"
				class="btn btn-default step"
				:title="optionText(s.title) || ''"
				:class="{
					active: modelValue > i,
					active2: modelValue === i,
				}"
				@click="$emit('update:modelValue', i)"
			>
				{{ optionText(s.label) }}
			</button>
		</div>
		<div>
			<em class="text-muted">{{ optionText(steps[modelValue].title) }}</em>
		</div>
	</div>
</template>

<script setup lang="ts">
import { optionText, type Option } from '@/shared/utils/options';

defineProps<{
	steps: Option[];
	modelValue: number;
}>();
defineEmits<{
	'update:modelValue': [value: number];
}>();
</script>

<style lang="scss" scoped>
.step {
	background: white;
	padding: 5px 10px;
	cursor: pointer;

	&.active {
		background: green;
	}
	&.active2 {
		background: greenyellow;
		cursor: initial;
	}
}
</style>
