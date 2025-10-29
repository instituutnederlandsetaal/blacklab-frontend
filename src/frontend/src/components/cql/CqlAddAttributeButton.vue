<template>
	<div class="dropup bl-create-attribute-dropdown">
		<button
			type="button"
			class="btn btn-sm btn-default dropdown-toggle"
			data-toggle="dropdown"
			:title="$t('search.advanced.queryBuilder.attribute_create_button_title').toString()"
		>
			<span class="glyphicon glyphicon-plus"></span>&#8203;
		</button>
		<ul class="dropdown-menu">
			<li v-for="op in options.operatorOptions" :key="op.value">
				<a
					href="#"
					@click.prevent="onClick(op.value)"
				>
					<span class="glyphicon glyphicon-plus-sign text-success"></span>
					{{ op.label }}
				</a>
			</li>
		</ul>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { CqlQueryBuilderOptions } from '@/components/cql/cql-types';
export default Vue.extend({
	props: {
		options: Object as () => CqlQueryBuilderOptions
	},
	methods: {
		onClick(op: string) {
			this.$emit('click', op);
		}
	}
})
</script>

<style lang="scss">

.bl-token-attribute-group-label {
	font-weight: 600;
	align-self: center;
}

</style>