<template>
	<div class="monaco-editor-fallback">
		<textarea
			class="form-control"
			:style="{ minHeight: '200px', fontFamily: 'monospace' }"
			:value="modelValue || ''"
			@input="onInput"
		></textarea>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
	emits: ['update:modelValue', 'change'],
	props: {
		modelValue: String,
		language: { default: 'text' },
		filename: { default: 'file.text' },
		options: Object,
	},
	methods: {
		onInput(event: Event) {
			const target = event.target as HTMLTextAreaElement;
			this.$emit('update:modelValue', target.value);
			this.$emit('change', target.value);
		}
	}
});


</script>