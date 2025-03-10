<template>
	<ul class="pagination pagination-sm">
		<li :class="['first', {'disabled': !prevEnabled || disabled}]">
			<a v-if="prevEnabled" role="button" title="first" @click.prevent="changePage(minPage)">&laquo;</a>
			<span v-else title="first">&laquo;</span>
		</li
		><li v-if="prevEnabled" :class="['prev', {'disabled': !prevEnabled || disabled}]">
			<a role="button" title="previous" @click.prevent="changePage(page-1)">&lsaquo;</a>
		</li
		><template v-if="showOffsets"
			><li v-for="i in lowerPages" :key="i" :class="{'disabled': disabled}">
				<a role="button" @click.prevent="changePage(i)">{{(i+1).toLocaleString()}}</a>
			</li
		></template
		><li v-if="lowerPages.length || higherPages.length" :class="{
			current: pageActive,
			active: pageActive,
			disabled
		}">
			<template v-if="editable">
				<input
					type="number"
					class="form-control"

					:value="page+1"
					:disabled="disabled"
					@keypress.enter.prevent="isValid($event.target.value-1) ? changePage($event.target.value - 1) : $event.target.value=page+1"
					@keyup.esc.prevent="$event.target.value=page+1; $event.target.blur();"
					@change.prevent="isValid($event.target.value-1) ? changePage($event.target.value-1) : $event.target.value=page+1"
					ref="maincontrol"
				/>
				<span v-if="editable" class="fa fa-pencil"></span>
			</template>
			<a v-else-if="!pageActive" role="button" @click.prevent="changePage(page)">{{(page+1).toLocaleString()}}</a>
			<span v-else>{{page+1}}</span>
		</li
		><li v-else class="active"> <!-- no available pages -->
			<span>{{(page+1).toLocaleString()}}</span>
		</li
		><template v-if="showOffsets"
			><li v-for="i in higherPages" :key="i" :class="{'disabled': disabled}">
				<a role="button" @click.prevent="changePage(i)">{{(i+1).toLocaleString()}}</a>
			</li
		></template
		><li v-if="nextEnabled" :class="['next', {'disabled': !nextEnabled || disabled}]">
			<a role="button" title="next" @click.prevent="changePage(page+1)">&rsaquo;</a>
		</li
		><li :class="['last', {'disabled': !nextEnabled || disabled}]">
			<a v-if="nextEnabled" role="button" :title="(maxPage+1).toLocaleString() +' (last)'" @click.prevent="changePage(maxPage)">&raquo;</a>
			<span v-else :title="(maxPage+1).toLocaleString() + ' (last)'">&raquo;</span>
		</li>
	</ul>
</template>

<script lang="ts">
import Vue from 'vue';

/** Renders pagination controls, inputs are 0-based, meaning page === 0 will render as 1 on the label */
export default Vue.extend({
	props: {
		page: Number,
		pageActive: {
			type: Boolean,
			default: true
		},
		maxPage: {
			type: Number,
			default: Number.MAX_VALUE,
		},
		minPage: {
			type: Number,
			default: 0,
		},
		disabled: Boolean,
		editable: {
			type: Boolean,
			default: true
		},
		showOffsets: {
			type: Boolean,
			default: true
		}
	},
	data: () => ({
		focus: false,
	}),
	computed: {
		lowerPages(): number[] {
			return this.calcOffsets(this.boundedPage - this.minPage).reverse().map(o => this.boundedPage - o);
		},
		higherPages(): number[] {
			return this.calcOffsets(this.maxPage - this.boundedPage).map(o => this.boundedPage + o);
		},
		nextEnabled(): boolean {
			return this.boundedPage < this.maxPage;
		},
		prevEnabled(): boolean {
			return this.boundedPage > this.minPage;
		},

		boundedPage(): number { return Math.max(this.minPage, Math.min(this.page, this.maxPage)); }
	},
	methods: {
		calcOffsets(range: number) {
			if (range <= 0) return [];
			if (range <= 1) return [1];
			if (range <= 2) return [1,2];
			if (range <= 5) return [1,2,range];
			if (range <= 10) return [1,2,5,range];
			return [1,2,3,5,10];
		},
		isValid(page: any): page is number {
			return typeof page === 'number' &&
				!isNaN(page) &&
				(page !== this.page || !this.pageActive) && // emit event for current page if the page is not active (i.e. is page is just center of the pagination, but not the "current" page)
				page >= this.minPage &&
				page <= this.maxPage
		},
		changePage(page: any) {
			if (!this.disabled && this.isValid(page)) {
				this.$emit('change', page)
			}
		}
	},
	beforeUpdate() {
		this.focus = document.activeElement === this.$refs.maincontrol;
	},
	updated() {
		if (this.focus) {
			(this.$refs.maincontrol as HTMLInputElement).focus();
		}
	},

})
</script>

<style lang="scss" scoped>
.pagination {
	$color: darken(#337ab7, 5);
	$border-color: lighten(#337ab7, 20);
	margin: 0;
	display: inline-block!important;

	vertical-align: middle; // this is done for buttons, but not for ul? align with neighboring buttons.

	>li {
		> a,
		> span {
			display: inline-block;
			float: none;
			user-select: none;
		}

		display: inline-block;
		&.current {
			color: #555;
			position: relative;
			vertical-align: bottom;
			> .fa {
				align-items: center;
				background: none;
				border: none;
				bottom: 2px;
				color: $color;
				display: flex;
				justify-content: center;
				margin: 0;
				opacity: 0.8;
				padding: 0;
				position: absolute;
				right: 6px;
				top: 0;
				z-index: 10;

				&:hover {
					z-index: 0;
				}
			}
			> input {
				border-color: $border-color;
				box-sizing: content-box;
				color: $color;
				border-radius: 0;
				font-size: 12px;
				height: 1.5em;
				line-height: 1.5em;
				padding: 5px;
				position: relative;
				text-align: center;
				width: 36px;
				z-index: 5;

				&:focus,
				&:hover {
					z-index: 15;
				}
				&:not(:focus):not(:hover) {
					-moz-appearance: textfield;
				}
			}
		}
		&.first,
		&.prev,
		&.next,
		&.last {
			> a,
			> span {
				padding-left: 6px;
				padding-right: 6px;
				box-sizing: content-box;
				width: 6px;
				text-align: center;
				font-weight: bold;
			}
		}
	}
	li+li.current {
		margin-left: -1px;
	}
}
</style>