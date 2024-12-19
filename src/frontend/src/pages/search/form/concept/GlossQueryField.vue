<template>
	<div class='glossQueryField'>
		<label :for="id">{{ fieldDescription.fieldName }}</label>
		<SelectPicker v-if="fieldDescription.type.values.length" :options="fieldDescription.type.values" v-model="currentValue" :id="id"/>
		<input v-else
			type="text"
			class="form-control"
			:placeholder="fieldDescription.fieldName"
			:id="id"
			v-model.lazy="currentValue"
		/>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as GlossStore from '@/store/form/glossStore';

import SelectPicker from '@/components/SelectPicker.vue'

export default Vue.extend ({
	name: 'GlossQueryField',
	components: { SelectPicker },
	props: {
		fieldDescription: Object as () => GlossStore.GlossFieldDescription
	},
	computed : {
		id(): string {
			return 'gloss-query-field-' + this.fieldDescription.fieldName ;
		},
		currentValue: {
			get(): string { return GlossStore.get.getGlossQueryFieldValue(this.fieldDescription.fieldName); },
			set(v: string) { GlossStore.actions.setOneGlossQueryField({fieldName: this.fieldDescription.fieldName, fieldValue : v }); }
		}
	},
})

</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
	margin: 40px 0 0;
}
ul {
	list-style-type: none;
	padding: 0;
}
li {
	display: inline-block;
	margin: 0 10px;
}
a {
	color: #42b983;
}

img {
	width: 400px;
}

.boxes {
	display: flex
}

.glossQueryField {
	margin-bottom: 4pt;
	text-align: left;
}

.fieldName {
	display: inline-block;
	width: 7em;
}
.code {
	display: block;
	padding: 9.5px;
	margin: 0 0 10px;
	font-size: 13px;
	line-height: 1.42857143;
	color: #333;

	background-color: #f5f5f5;
	border: 1px solid #ccc;
	border-radius: 4px;
	font-family: Menlo,Monaco,Consolas,"Courier New",monospace;
}
</style>
