<template>
	 <div>
		<SelectPicker v-if="fieldDescription.type.values.length" :options="fieldDescription.type.values" v-model="currentValue" @click.native.stop />
		<input v-else type="text" class="form-control" :placeholder="fieldName" style="min-width: 250px;" v-model.lazy="currentValue" @click.stop />
	</div>
</template>

<script lang="ts">

import Vue from 'vue';
import * as GlossStore from '@/store/form/glossStore';
import SelectPicker from '@/components/SelectPicker.vue'

export default Vue.extend ({
	name: 'GlossField',
	components: {
		SelectPicker
	},
	props: {
		fieldDescription: Object as () => GlossStore.GlossFieldDescription,
		fieldName: String,
		hitId : String,
		hit_first_word_id: String,
		hit_last_word_id: String
	},
	computed : {
		currentValue: {
			get(): string { return GlossStore.get.getGlossValue(this.hitId, this.fieldName) },
			set(v: string) {
				GlossStore.actions.setOneGlossField({
					hitId: this.hitId,
					fieldName: this.fieldName,
					fieldValue: v,
					hit_first_word_id: this.hit_first_word_id,
					hit_last_word_id: this. hit_last_word_id
				})
			}
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
