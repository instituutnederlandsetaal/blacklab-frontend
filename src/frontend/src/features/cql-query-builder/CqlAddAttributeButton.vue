<template>
	<div class="dropup bl-create-attribute-dropdown">
		<button type="button" class="btn btn-sm btn-default dropdown-toggle" data-toggle="dropdown" :title="$t('search.advanced.queryBuilder.attribute_create_button_title').toString()" :disabled>
			<span class="glyphicon glyphicon-plus"></span>&#8203;
		</button>
		<ul class="dropdown-menu">
			<li v-for="op in options.operatorOptions" :key="op.value">
				<a href="#" @click.prevent="emitClick(op.value as CqlAnnotationCombinator)">
					<span class="glyphicon glyphicon-plus-sign text-success"></span>
					{{ optionLabel(op) }}
				</a>
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
import type { CqlAnnotationCombinator, CqlQueryBuilderOptions } from './model';

import { optionLabel } from '@/shared/utils/options';
const props = withDefaults(
	defineProps<{
		options: CqlQueryBuilderOptions;
		disabled?: boolean;
	}>(),
	{
		disabled: false,
	},
);
const emit = defineEmits<{
	click: [operator: CqlAnnotationCombinator];
}>();

function emitClick(operator: CqlAnnotationCombinator) {
	if (props.disabled) return;
	emit('click', operator);
}
</script>

<style lang="scss">
.bl-token-attribute-group-label {
	font-weight: 600;
	align-self: center;
}
</style>
