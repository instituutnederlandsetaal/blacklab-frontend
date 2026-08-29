<template>
	<ol class="breadcrumb resultscrumb">
		<!-- no disabled state; use active class instead... -->
		<li v-for="(crumb, index) in crumbs" :key="index" :class="{ active: !(crumb.onClick && !disabled) /* activate state is inverted, i.e. active is noninteractable */ }">
			<a v-if="crumb.onClick && !disabled" role="button" :title="crumb.title" @click.prevent="crumb.onClick()">{{ crumb.label }}</a>
			<template v-else>{{ crumb.label }}</template>
		</li>
	</ol>
</template>

<script setup lang="ts">
defineProps<{
	crumbs: Array<{
		label: string;
		title?: string;
		onClick?: () => void;
	}>;
	disabled?: boolean;
}>();
</script>

<style lang="scss">
.crumbs-totals {
	margin: 0 -15px 10px;
	display: flex;
	flex-wrap: nowrap;
	align-items: flex-start;
	justify-content: space-between;

	@at-root .breadcrumb.resultscrumb {
		background: white;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 0;
		padding: 12px 15px;
		margin-bottom: 0;
		flex-grow: 1;
	}
}
</style>
