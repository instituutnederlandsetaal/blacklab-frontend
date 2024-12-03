<template>
	<div class='conceptbox' style='text-align: left'>
		<div class="box-header">{{ $t('formConcept.conceptSearchBox.subquery') }} {{ id }}</div>

		<table>
			<tr>
				<td class="fn">
					<label :for="id + 'main_fields'">{{ $t('formConcept.conceptSearchBox.field') }}: </label>
				</td>
				<td>
					<SelectPicker data-width="100%" :data-id="id + 'main_fields'" v-model="search_field" :options="main_fields"/>
				</td>
			</tr>
			<tr>
				<td class="fn">
					<label :for="id + 'ac1'">{{ $t('formConcept.conceptSearchBox.concept') }}: </label>
				</td>
				<td>
					<Autocomplete
						:id="id + 'ac1'"
						class="form-control"
						placeholder="...concept..."

						:getData="getConceptAutocompletes"

						v-model="current_concept"
					/>
					<!-- <button @click="insertConcept" title="Add concept to lexicon">⤿ lexicon</button> -->
				</td>
			</tr>
			<tr>
				<td class="fn">
					<label :for="id + 'ac2'">{{ $t('formConcept.conceptSearchBox.term') }}: </label>
				</td>
				<td>
					<div class="input-group">
						<Autocomplete
							class="form-control"
							placeholder="...term..."
							:id="id + 'ac2'"
							:getData="getTermAutocompletes"
							v-model="current_term"
						/>

						<div class="input-group-btn">
							<button @click="insertTerm" :title="$t('formConcept.conceptSearchBox.addToLexicon').toString()" class="btn btn-default">⤿ lexicon</button>
						</div>
					</div>
				</td>
			</tr>
		</table>


		<div class="terms">
			<div v-for="t in terms" :key="t">
				<label>
					<input type="checkbox" :value="t" v-model="checked_terms[t]"/>
					{{ t }}
				</label>
			</div>
		</div>

		<button type="button" @click="resetQuery" class="btn btn-sm btn-default">{{ $t('formConcept.conceptSearchBox.clear') }}</button>
	 </div>
</template>

<script lang="ts">
import Vue from 'vue';

import Autocomplete from '@/components/Autocomplete.vue';
import * as CorpusStore from '@/store/search/corpus';
import * as ConceptStore from '@/store/search/form/conceptStore';
import { mapReduce, uniq } from '@/utils'

import SelectPicker from '@/components/SelectPicker.vue';
import { conceptApi, blacklab } from '@/api';

type Term = { term: string }

export default Vue.extend ( {
	name: 'ConceptSearchBox',
	components: { Autocomplete, SelectPicker },
	props: {
		id: String,
		field: String,
		settings: Object as () => ConceptStore.Settings,
		value: Array as () => Array<{field: string, value: string}>
	},
	data: () => ({
		/** A "field" of study, like "history", "philosophy", etc. */
		search_field: '',
		/** A "concept" within the "field", like the concept of "truth and falsehood" in the field of "philosophy" */
		current_concept : '',
		/** A world that falls within the concept, like "true", "false" */
		current_term : '',
		/** Which terms we're currently using. */
		checked_terms: {} as Record<string, boolean>,
		/** All available terms. */
		terms: [] as string[],

		WITH_CREDENTIALS,
	}),

	methods : {
		getConceptAutocompletes(prefix: string): Promise<string[]> {
			if (!prefix) return Promise.resolve([]);

			return conceptApi.getTerms(this.settings.instance, this.search_field, prefix)
		},
		/** Autocomplete. Find all terms starting with the string. Search both the database and Blacklab. */
		getTermAutocompletes(prefix: string): Promise<string[]> {
			if (!prefix) return Promise.resolve([]);

			const mainAnnotation = CorpusStore.get.firstMainAnnotation();
			// TODO use api module.
			return Promise.all([
				conceptApi.getTerms(this.settings.instance, this.search_field, this.current_concept, prefix),
				blacklab.getTermAutocomplete(INDEX_ID, mainAnnotation.annotatedFieldId, 'lemma', prefix)
			])
			.then(([pdb, corpus]) => uniq([...pdb, ...corpus]))
		},

		get_cluster_values(d: { data: ConceptStore.LexiconEntry[] }): string[] {
			const vals = uniq(d.data.map(x  => x.cluster))
			return vals
		},
		insertConcept() {
			if (!this.current_concept) return;
			this.addToDatabase(this.current_concept);
		},
		insertTerm() {
			if (!this.current_term || this.checked_terms[this.current_term]) return;
			this.$set(this.checked_terms, this.current_term, true);
			this.addToDatabase(this.current_concept, this.current_term);
		},
		addToDatabase(concept: string, term?: string) {
			if (!this.settings) return;
			conceptApi.addConceptOrTermToDatabase(
				this.settings.instance,
				INDEX_ID,
				this.search_field,
				concept,
				term
			)
			.then(() => console.log('inserted term'), console.error);
		},
		resetQuery() {
			this.current_concept = ''
			this.current_term = ''
			this.terms = []
			this.checked_terms = {}
		}
	},

	computed : {
		main_fields: ConceptStore.get.main_fields,
		fieldAndConcept(): {field: string, concept: string} {
			return {field: this.search_field, concept: this.current_concept}
		},
		newValue(): ConceptStore.AtomicQuery[] {
			return Object
			.keys(this.checked_terms)
			.filter(t => this.checked_terms[t])
			.map(t => ({field: 'lemma', value: t})); // TODO don't hardcode lemma!.
		},
	},
	watch: {
		/** Get the terms for the current field+concept from the database */
		fieldAndConcept(): void {
			const {field, concept} = this.fieldAndConcept;
			conceptApi
				.getTerms(this.settings.instance, field, concept)
				.then(terms => {
					this.terms = terms;
					this.checked_terms = mapReduce(terms); // check all terms.
				})
				.catch(e => console.error(`Failed to retrieve terms for concept ${concept} in field ${field}`, e));
		},
		// Update selected field when main fields change.
		// can be removed when we update selectpicker to the component library/vue 3 version
		// as v-model autocorrects the value in that version.
		main_fields(n: string[]) {
			if (n && n.length > 0)
				this.search_field = n[0]
		},
		// v-model helper.
		newValue() {
			// don't remove the type cast, so we get a warning here if we change something.
			this.$emit('input', this.newValue as ConceptStore.AtomicQuery[]);
		},
	},
})
</script>

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

img {
	width: 400px;
}

.conceptbox {
	border-style: solid;
	text-align: left;
	margin: 1em;
	padding: 0em;
	box-shadow: 10px 5px 5px grey;
	border-radius: 10px;
	font-size: 9pt
}

.fn {
	width: 5em;
}
.terms {
	height: 15em;
	overflow-y: auto;
	column-count: 2;
	border-style: solid;
	border-width: 1pt;
	margin-top: 1em;
	margin-left: 1em;
	margin-right: 1em;
	margin-bottom: 1em;

}

tr {
	border-spacing: 0 10px;
	border-collapse: separate;
}
.t1 {
	table-layout: auto;
}
.box-header
{
	color: white;
	background-color: #ae0932 !important;
}
</style>
@/store/search/form/conceptStore