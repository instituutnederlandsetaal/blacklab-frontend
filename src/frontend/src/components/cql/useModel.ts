import Vue, { toRaw } from 'vue';
import cloneDeep from 'clone-deep';

function cloneModelValue<T>(value: T): T {
	return cloneDeep(toRaw(value));
}

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
		created() { this.model = cloneModelValue(this.value); },
		watch: {
			value: {
				handler() {
					this.isUpdatingFromProp = true;
					this.model = cloneModelValue(this.value);
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
