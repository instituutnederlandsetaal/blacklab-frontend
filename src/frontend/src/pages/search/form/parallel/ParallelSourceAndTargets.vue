<template>
	<div>
		<div :class="{ 'form-group': true, 'form-group-lg': lg }">
			<label :class="{ 'col-xs-12': !block, 'col-md-3': !block, 'control-label': block }">{{ $t('search.parallel.searchSourceVersion') }}</label>
			<div :class="{ 'col-xs-12': !block, 'col-md-9': !block }">
				<SelectPicker :options="parallel.sourceFieldOptions.all" v-model="parallel.sourceFieldModel" data-menu-width="grow" hideEmpty />
				<transition name="flash">
					<span v-if="errorNoParallelSourceVersion" class="error">
						{{ $t('search.parallel.errorNoSourceVersion') }}
					</span>
				</transition>
			</div>
		</div>
		<div :class="{ 'form-group': true, 'form-group-lg': lg }">
			<label :class="{ 'col-xs-12': !block, 'col-md-3': !block, 'control-label': block }">{{ $t('search.parallel.andCompareWithTargetVersions') }}</label>
			<div :class="{ 'col-xs-12': !block, 'col-md-9': !block }">
				<MultiValuePicker :options="parallel.targetFieldOptions.all" v-model="parallel.targetFieldsModel" />
			</div>
		</div>
		<AlignBy :block="block" :lg="lg" />
	</div>
</template>

<script setup lang="ts">
import useParallel from '@/pages/search/form/composables/useParallel';

import AlignBy from '@/pages/search/form/parallel/AlignBy.vue';
import MultiValuePicker from '@/shared/ui/MultiValuePicker.vue';

defineProps<{
	block?: boolean;
	lg?: boolean;
	errorNoParallelSourceVersion?: boolean;
}>();

const parallel = useParallel();
</script>

<style lang="scss" scoped>
label {
	font-weight: bold;
}

.error {
	color: red;
	margin: 0.5em 0 0 1em;
	font-weight: bold;
}

@keyframes flash {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.1;
	}
}

.flash-enter-active {
	animation: flash 0.5s ease-in-out 2;
}
</style>
