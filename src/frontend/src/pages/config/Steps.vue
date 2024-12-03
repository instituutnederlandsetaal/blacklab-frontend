<template>
	<div>
		<button v-for="(s, i) in steps" :key="s.value"
			type="button"
			class="btn btn-default step"

			:title="s.title || ''"
			:class="{
				active: step > i,
				active2: step === i
			}"

			@click="$emit('input', i)"
		>
			{{s.label}}
		</button>
		<div><em class="text-muted">{{steps[step].title}}</em></div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Option } from '@/types/apptypes';

export default Vue.extend({
	props: {
		steps: Array as () => Option[],
		step: Number
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