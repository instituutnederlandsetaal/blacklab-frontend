import Vue from 'vue';

function useModel<T>() {
	return Vue.extend({
		props: {
			value: { type: Object as () => T, required: true },
		},
		data() {
			return {
				model: {} as T,
				isUpdatingFromProp: false
			};
		},
		created() { this.model = { ...this.value }; },
		watch: {
			value: {
				handler() {
					this.isUpdatingFromProp = true;
					this.model = { ...this.value };
					this.$nextTick(() => {
						this.isUpdatingFromProp = false;
					});
				},
				immediate: true,
			},
			model: {
				handler() {
					if (!this.isUpdatingFromProp) {
						this.$emit('input', this.model);
					}
				},
				deep: true,
			}
		}
	});
}

export default useModel;
