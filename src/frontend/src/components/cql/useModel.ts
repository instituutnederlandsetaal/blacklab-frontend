import Vue from 'vue';

function useModel<T>() {
	return Vue.extend({
		props: {
			value: { type: Object as () => T, required: true },
		},
		data() {
			return {
				model: {} as T
			};
		},
		created() { this.model = { ...this.value }; },
		watch: {
			value: {
				handler() { this.model = { ...this.value }; },
				immediate: true,
			},
			model: {
				handler() { this.$emit('input', this.model); },
				deep: true,
			}
		}
	});
}

export default useModel;
