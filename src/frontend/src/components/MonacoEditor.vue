<template>
	<div class="monaco-editor-fallback">
		<textarea
			class="form-control"
			:style="{ minHeight: '200px', fontFamily: 'monospace' }"
			:value="value || ''"
			@input="onInput"
		></textarea>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
	props: {
		value: String,
		language: { default: 'text' },
		filename: { default: 'file.text' },
		options: Object,
	},
	methods: {
		onInput(event: Event) {
			const target = event.target as HTMLTextAreaElement;
			this.$emit('input', target.value);
			this.$emit('change', target.value);
		}
	}
});


</script>