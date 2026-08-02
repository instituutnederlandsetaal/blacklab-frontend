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

<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent } from 'vue';

import { optionText, type Option } from '@/shared/utils/options';

export default defineComponent({
	emits: ['update:modelValue'],
	methods: {
		optionText,
	},
	props: {
		steps: { type: Array as PropType<Option[]>, required: true },
		modelValue: { type: Number, required: true },
	},
});
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
