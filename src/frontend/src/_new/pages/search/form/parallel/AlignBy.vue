<template>
	<div :class="{ 'form-group': true, 'form-group-lg': lg }">
		<label :class="{ 'col-xs-12': !block, 'col-md-3': !block, 'control-label': block }">{{ $t('search.parallel.alignBy') }}</label>
		<div class="btn-group clearfix" style="display: block" :class="{ 'col-xs-12': !block, 'col-md-9': !block }">
			<button
				v-for="option in parallel.alignByOptions"
				type="button"
				:class="['btn', parallel.alignByModel === option.value ? 'active btn-primary' : 'btn-default']"
				:key="option.value"
				:value="option.value"
				:title="option.title || option.value"
				@click="parallel.alignByModel = option.value"
			>
				{{ option.label || option.value || 'document' }}
			</button>
			<!-- empty value searches across entire documents -->
		</div>
	</div>
</template>

<script setup lang="ts">
import useParallel from '@/_new/pages/search/form/composables/useParallel';

defineProps<{
	block?: boolean;
	lg?: boolean;
}>();

const parallel = useParallel();
</script>

<style lang="scss" scoped></style>
