<template>
	<div>
		<div :class="{'form-group': true, 'form-group-lg': lg}">
			<label :class="{'col-xs-12': !block, 'col-md-3': !block, 'control-label': block}">{{ $t('search.parallel.inSourceVersion') }}</label>
			<div :class="{'col-xs-12': !block, 'col-md-9': !block}">
				<SelectPicker :options="pSourceOptions" v-model="pSourceValue" data-menu-width="grow" hideEmpty/>
				<transition name="flash">
					<span v-if="errorNoParallelSourceVersion" class="error">
						{{ $t('search.parallel.errorNoSourceVersion') }}
					</span>
				</transition>
			</div>
		</div>
		<div :class="{'form-group': true, 'form-group-lg': lg}">
			<label :class="{'col-xs-12': !block, 'col-md-3': !block, 'control-label': block}">{{ $t('search.parallel.andCompareWithTargetVersions') }}</label>
			<div :class="{'col-xs-12': !block, 'col-md-9': !block}">
				<MultiValuePicker :options="pTargetOptionsWithCurrent" v-model="pTargetValue" />
			</div>
		</div>
		<AlignBy :block="block" :lg="lg"/>
	</div>
</template>

<script lang="ts">
import ParallelFields from '@/pages/search/form/parallel/ParallelFields';

import SelectPicker from '@/components/SelectPicker.vue';
import MultiValuePicker from '@/components/MultiValuePicker.vue';
import AlignBy from '@/pages/search/form/AlignBy.vue';

export default ParallelFields.extend({
	components: {
		SelectPicker,
		MultiValuePicker,
		AlignBy,
	},
	props: {
		block: {default: false, type: Boolean},
		lg: {default: false, type: Boolean},
		errorNoParallelSourceVersion: {default: false, type: Boolean},
	},
});
</script>

<style lang="scss" scoped>

label { font-weight: bold; }

.error {
	color: red;
	margin: 0.5em 0 0 1em;
	font-weight: bold;
}

@keyframes flash {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.1; }
}

.flash-enter-active {
  animation: flash 0.5s ease-in-out 2;
}

</style>