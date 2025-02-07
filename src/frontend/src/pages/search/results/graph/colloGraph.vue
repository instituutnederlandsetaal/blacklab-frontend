<template>
	<div>
		<h4>{{$t('results.relationalGraph.heading')}}</h4>
		<hr>
		<div id="echarts-container" style="width: 100;height:400px;"></div>
	</div>
</template>

<script lang="ts">

import Vue from 'vue';

import * as InterfaceStore from '@/store/search/form/interface';
import * as echarts from 'echarts';

export default Vue.extend({
	props: {
		columns: Array,
		data: Array,
		points: {
			type: Array,
			default: () => []
		}
	},
	methods: {
		generateNetwork() {
			const data = this.data;			
			let edges, points, categories;
			const analyseMode = InterfaceStore.get.analyseMode()
			if ( analyseMode === 'collocation') {
				edges = data.map((item: any) => ({
						source: item.keyword,
						target: item.collocation,
						value:  item.absoluteFreq,
						weight: item.absoluteFreq
					}));
				const showGraphPoint = Array.from(new Set([...data.map((item: any) => item.keyword), ...data.map((item: any) => item.collocation)]));
				points = showGraphPoint.map((name) => {
					let x, y;
					x = this.getRandomCoordinate();
					y = this.getRandomCoordinate();

					return {
						name,
						x,
						y,
						itemStyle: {
							color: data.find((item: any) => item.keyword === name) ? '#5C2223' : '#2775B6',
						},
						symbolSize: data.find((item: any) => item.keyword === name) ? 15 : 10,
					};
				});					
			} else if (analyseMode === 'cooccur') {
				edges = data.map((item: any) => ({
						source: item.keyword,
						target: item.cooccurWord,
						value: item.edgeWeight.replace('%', ''),
						weight: item.edgeWeight
					}));
				const showGraphPoint = Array.from(new Set([...data.map((item: any) => item.keyword), ...data.map((item: any) => item.cooccurWord)]))
				points = showGraphPoint.map((name) => {
					let x, y;
					x = this.getRandomCoordinate();
					y = this.getRandomCoordinate();

					return {
						name,
						x,
						y,
						itemStyle: {
							color: data.find((item: any) => item.keyword === name) ? '#5C2223' : '#2775B6',
						},
						symbolSize: data.find((item: any) => item.keyword === name) ? 15 : 10,
					};
				});
			} else if (analyseMode === 'network') {
				edges = data.map((item: any) => {  
					if (item.edgeWeight === '0.000000') {  
						return null;  
					}  
					return {  
						source: item.word1,  
						target: item.word2,  
						value: item.edgeWeight.replace('%', ''),  
						weight: item.edgeWeight  
					};  
				}).filter(edge => edge !== null);

				let minAbsFreq = Math.min(...this.points.map((item: any) => item.absoluteFreq)); // max freq
				let maxAbsFreq = Math.max(...this.points.map((item: any) => item.absoluteFreq));  // min freq			
				if (minAbsFreq === maxAbsFreq) {  
					minAbsFreq -= 1; 
				}  
				points = this.points.map((item: any) => {
					let x, y;
					x = this.getRandomCoordinate();
					y = this.getRandomCoordinate();

					let symbolSize = 5 + ((item.absoluteFreq - minAbsFreq) / (maxAbsFreq - minAbsFreq)) * 10;  
					// Make sure the symbolSize is within the range [5, 15]
					symbolSize = Math.min(15, Math.max(5, symbolSize));
					return {						
						name: item.word,
						x,
						y,
						symbolSize: symbolSize ,
						absoluteFreq: item.absoluteFreq,
						relativeFreq: item.relativeFreq,
						degree: item.degree,
						edgeWeightSum: item.edgeWeightSum,
						category: item.community
					}					
				})
				categories = this.points.map(function (item: any) {
					return item.community;
				})
			}

			const chart = echarts.init(document.getElementById('echarts-container'));
			const option = {
				toolbox: {
					show: true,
					feature: {
						mark: {
							show: true
						},
						saveAsImage: {
							show: true
						},
					}
				},
				tooltip: {
					formatter: function(params: any) {
						// Check whether the tooltip activates edges or points 
						if (params.dataType === 'edge') {
							if(analyseMode === 'collocation' )
							{
								return 'Keyword: ' + params.data.source + '<br>' +
										'Collocation Word: ' + params.data.target + '<br>' +
										'Absolute Frequency: ' + params.data.weight;
							} else if(analyseMode === 'cooccur' ) {
								return 'Keyword: ' + params.data.source + '<br>' +
										'Cooccur Word: ' + params.data.target + '<br>' +
										'Edge Weight: ' + params.data.weight;
							} else if(analyseMode === 'network' ) {
								return 'Word1: ' + params.data.source + '<br>' +
										'Word2: ' + params.data.target + '<br>' +
										'Edge Weight: ' + params.data.weight;
							} else {
								return '';
							}		
						} else { 
							if(analyseMode === 'network' )
							{
								return 'Word: ' + params.data.name + '<br>' +
										'Absolute Frequency: ' + params.data.absoluteFreq + '<br>' +
										'Relative Frequency: ' + params.data.relativeFreq + '<br>' +
										'Degree: ' + params.data.degree + '<br>' +
										'Edge Weight Sum: ' + params.data.edgeWeightSum + '<br>' +
										'Community: ' + params.data.category ;
							} else {
								return '';
							}							
						}
					},
				},
				animationDurationUpdate: 1500,
				animationEasingUpdate: 'elasticOut' as 'elasticOut',
				series: [
				{
					type: 'graph',
					layout: 'force',
					symbolSize: 50,
					roam: true,
					label: {
						show: true
					},
					edgeSymbol: analyseMode === 'network' ? ['circle'] : ['circle', 'arrow'],
					edgeSymbolSize: [4, 10],
					edgeLabel: {
						fontSize: 20
					},
					zoom: 5, 
					data: points,
					categories: categories,
					links: edges,
					lineStyle: {
						opacity: 0.9,
						width: 2,
						curveness: 0
					},
					force: {
						repulsion: 100,
						edgeLength: [10, 50]
					}
				}
				]
			};
			chart.setOption(option);
		},
		getRandomCoordinate() {
			const min = 100;
			const max = 900;
			return Math.floor(Math.random() * (max - min + 1) + min);
		},
	},
	mounted() {
    	this.generateNetwork();
	},
	watch: {
		data: {
			handler: 'generateNetwork',
			deep: true
		}
	}
})
</script>

<style lang="scss">

.table-container {
  width: 100%; 
  max-width: 100%; 
  overflow-x: auto; 
}
</style>