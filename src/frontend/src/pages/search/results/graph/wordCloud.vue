<template>
	<div>
		<h4>{{$t('results.wordCloud.heading')}}</h4>
		<hr>
		<div id="echarts-container" style="width: 100vh;height:100vh;"></div>
	</div>
</template>

<script lang="ts">

import Vue from 'vue';
import * as echarts from 'echarts';
import 'echarts-wordcloud';
import * as InterfaceStore from '@/store/search/form/interface';

export default Vue.extend({
	props: {
		columns: Array,
		data: Array,
	},
	methods: {
		generateWordCloud() {
			let words;
			const analyseMode = InterfaceStore.get.analyseMode()
			if (analyseMode === 'wordlist') {
				words = this.data.map((item: any)=> ({
					name: item.word,
					value: item.absoluteFreq,
					relativeFreq: item.relativeFreq
				}));
			} else {
				words = this.data.map((item: any)=> ({
					name: item.word,
					value: item.weight
				}));
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
						}
					}
				},
				tooltip: {
					formatter: function(params: any) {
						if (analyseMode === 'wordlist') {
							return 'Word: ' + params.data.name + '<br>' +
							'Absolute Frequency: ' + params.data.value + '<br>' +
							'Relative Frequency: ' + params.data.relativeFreq;
						} else {
							return 'Word: ' + params.data.name + '<br>' +
							'Weight: ' + params.data.value;
						}						
					}
				},
				grid: {
					left: 1,
					top: 1,
					right: 1,
					bottom: 1,
				},
				series: [{
					type: 'wordCloud',
					shape: 'circle',
					gridSize: 20,
					sizeRange: [12, 60],
					rotationRange: [-90, 90],
					textStyle: {
						normal: {
						fontFamily: 'sans-serif',
						fontWeight: 'bold',
						}
					},
					emphasis: {
						textStyle: {
						shadowBlur: 10,
						shadowColor: '#333'
						}
					},
					data: words
				}]
			};

			chart.setOption(option);
		}
	},
	mounted() {
    	this.generateWordCloud();
	},
	watch: {
		data: {
			handler: 'generateWordCloud',
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