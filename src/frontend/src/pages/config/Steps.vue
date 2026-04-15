<template>
	<div>
		<div class="btn-group">
			<button v-for="(s, i) in steps" :key="s.value"
				type="button"
				class="btn btn-default step"

				:title="s.title || ''"
				:class="{
					active: modelValue > i,
					active2: modelValue === i
				}"

				@click="$emit('update:modelValue', i)"
			>
				{{s.label}}
			</button>

		</div>
		<div><em class="text-muted">{{steps[modelValue].title}}</em></div>
	</div>
</template>

<script lang="ts">
import type { Option } from '@/utils/options';
import type { PropType } from 'vue';
import { defineComponent } from 'vue';

export default defineComponent({
	emits: ['update:modelValue'],
	props: {
		steps: { type: Array as PropType<Option[]>, required: true },
		modelValue: { type: Number, required: true }
	}
})
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