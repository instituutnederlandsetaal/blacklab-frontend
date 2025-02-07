<template>
	<div>
		<h4>{{$t('results.tableResults.heading')}}</h4>
		<hr>
		<div class="table-container">
			<table class="topic-table">
				<thead>
					<tr>
						<th v-for="column in columns" :key="column.prop"  style="text-align: center;">
							{{ $t('results.tableResults.'+column.label) }}
						</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in shownData" :key="item.key">
						<td v-for="column in columns" :key="column.prop">
							{{ item[column.prop] }}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		<div class="pagination-and-button-container">
			<Pagination slot="pagination"
				style="display: block; margin: 10px 0;"

				:page="this.shownPage"
				:maxPage="pagination.maxShownPage"
				:disabled="false"

				@change="handlePageChange"
			/>
			<div>  
				<button class="btn btn-default btn-sm" @click="exportToExcel">{{$t('results.tableResults.excel')}}</button>  
			</div>
		</div>	
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import * as XLSX from 'xlsx';  
import { saveAs } from 'file-saver';  

import * as GlobalViewSettings from '@/store/search/results/global';
import * as InterfaceStore from '@/store/search/form/interface';

import Pagination from '@/components/Pagination.vue';
import Export from '@/pages/search/results/Export.vue';

export default Vue.extend({
	components: {
		Pagination,
		Export,
	},
	props: {
		columns: Array,
		data: Array,
	},
	data() {  
		return {  
			shownPage: 0, // page number in shown in frontend
			pageCount: 0,
			shownData: [] as any[],
		};  
	},  
	computed: {
		pageSize: {
			get(): string { return this.itoa(GlobalViewSettings.getState().pageSize); },
		},
		pagination(): {
			maxShownPage: number
		} {
			if (!this.data || this.data.length === 0 || !this.columns || this.columns.length === 0) {
				return {
					maxShownPage: 0
				};
			}

			const pageSize = GlobalViewSettings.getState().pageSize;
			const totalResults = this.data!.length

			// subtract one page if number of results exactly diactive by page size
			// e.g. 20 results for a page size of 20 is still only one page instead of 2.
			const maxShownPage = Math.floor(totalResults / pageSize) - ((totalResults % pageSize === 0 && totalResults > 0) ? 1 : 0);
			//maxShownPage is based-0，pageCount is based-1
			this.pageCount = maxShownPage + 1

			this.updateShownData() 

			return {
				maxShownPage: maxShownPage
			};
		},
		activeForm: {
			get: InterfaceStore.get.form,
			set: InterfaceStore.actions.form
		},
	},
	methods: {
		itoa(n: number|null): string { return n == null ? '' : n.toString(); },
		atoi(s: string): number|null { return s ? Number.parseInt(s, 10) : null; },
		exportToExcel() {  
			const wb = XLSX.utils.book_new();  		
			const ws = XLSX.utils.json_to_sheet(this.data);  
			XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');  
			const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });  
			const blob = new Blob([wbout], { type: 'application/octet-stream' });  
			saveAs(blob, 'data.xlsx');  
		},  
		handlePageChange(newPage: any) {  
			this.shownPage = newPage
		},
		
		updateShownData() {  
			const pageSize = GlobalViewSettings.getState().pageSize;
			const start = (this.shownPage) * parseInt(this.pageSize, 10);  
			const end = start + parseInt(this.pageSize, 10);
			
			this.shownData =  this.data.slice(start, end); 
		}  
	},
	
})
</script>

<style lang="scss">

.table-container {
  width: 100%;  
  max-width: 100%;  
  overflow-x: auto;  
}

table {
	> tbody > tr > th,
	> tbody > tr > td {
		padding: 8px;
		&:first-child { padding-left: 6px; }
		&:last-child { padding-right: 6px; }
		text-align: center;
		white-space: nowrap; 
	}

	> thead > tr > th {
		color: #347ab6;
		padding: 8px;
		&:first-child { padding-left: 6px; }
		&:last-child { padding-right: 6px; }
		text-align: center;
		white-space: nowrap;  
	}

	&.topic-table {
		table-layout: fixed;
		border-collapse: separate;
		table-layout: auto;
		> tbody > tr {
			border-bottom: 1px solid #ffffff;

			> td {
				overflow: hidden;
				text-overflow: ellipsis;
			}

			&.concordance.open > td {
				overflow: visible;
			}
		}
	}
}

.pagination-and-button-container {  
  display: flex;  
  justify-content: space-between;  
  align-items: center;  
}  

</style>