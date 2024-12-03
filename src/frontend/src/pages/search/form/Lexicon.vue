<template>
	<div class="lexicon">
		<input
			type="text"
			:class="{'form-control': true, 'loading': !posOptions || !wordOptions}"
			autocomplete="off"

			:id="inputId"
			:name="inputId"
			:placeholder="$tAnnotDisplayName(definition)"

			v-bind="$attrs"
			v-model="modelValue"
		/>
		<span v-if="!wordOptions" class="fa fa-spinner fa-spin text-muted"></span>

		<div v-if="wordOptions && wordOptions.length" style="margin: 10px 0;">
			<button
				type="button"
				class="btn btn-default"
				:disabled="selectedWords.length === renderedWords.length"
				@click="renderedWords.forEach(w => w.selected = w.count > 0)">{{$t('lexicon.selectAll')}}
			</button>
			<button
				type="button"
				class="btn btn-default"
				:disabled="!selectedWords.length"
				@click="renderedWords.forEach(w => w.selected = false)">{{$t('lexicon.deselectAll')}}
			</button>
		</div>

		<label v-for="opt in renderedWords" :key="opt.word"
			style="width: 10vw; min-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
			:role="opt.count > 0 ? 'button' : undefined"
			:class="{'disabled': opt.count === 0}"
			:title="`${opt.word} (${opt.count})`"
		>
			<input type="checkbox"
				:value="opt"
				:disabled="opt.count === 0"

				v-model="opt.selected"
			> {{opt.word}}<!-- ({{opt.count}})-->
		</label>
		<template v-if="wordOptions && wordOptions.length"> <!-- if we have wordOptions, we also have pos options -->
			<h4>{{$t('lexicon.limit')}}</h4>
			<label v-for="(checked, pos) in posOptions" :key="pos"
				style="width: 10vw; min-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
				role="button"
			>
				<input type="checkbox"
					v-model="posOptions[pos]"
					:value="pos"
				> {{pos}}
			</label>
		</template>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import Axios from 'axios';
import * as Observable from 'rxjs';
import { debounceTime, switchMap, mergeMap, map, toArray, catchError, mapTo, distinctUntilChanged, tap, filter } from 'rxjs/operators';

import * as CorpusStore from '@/store/search/corpus';
import * as UIStore from '@/store/search/ui';
import * as api from '@/api';
import SelectPicker from '@/components/SelectPicker.vue';
import UID from '@/mixins/uid';
import { escapeRegex, filterDuplicates, mapReduce } from '@/utils';

type LexiconParams1 = {lemma: string}|{wordform: string}
type LexiconParams = LexiconParams1&{
	database: string;

	dataset?: string;
	year_from?: string; // format to be determined (just yyyy?)
	year_to?: string;
	tweaked_queries?: boolean;
	lemma_provenance?: string;
	paradigm_provenance?: any; // not sure what this is?

	/** only one pos per query supported */
	pos?: string;
	/** Return split part of speech tags in the lexicon service? */
	split?: boolean;

	case_sensitive: boolean;
};

type LexiconLemmaIdResponse = {
	message: 'OK';
	lemmata_list: Array<{
		found_lemmata: Array<{
			lemma: string;
			lemma_id: string;
			pos: string;
		}>;
	}>;
};

type LexiconWordformsResponse = {
	message: 'OK';
	wordforms_list: Array<{
		found_wordforms: string[];
	}>;
};

const config = {
	getLemmaIdFromWordform: `https://sk.taalbanknederlands.inl.nl/LexiconService/lexicon/get_lemma/`,
	getLemmaIdFromLemma: `https://sk.taalbanknederlands.inl.nl/LexiconService/lexicon/get_lemma_id_from_lemma/`,
	getWordformsFromLemmaId: `https://sk.taalbanknederlands.inl.nl/LexiconService/lexicon/get_wordforms_from_lemma_id/`,
	case_sensitive: false,
};

type WordOption = {
	lemma: string;
	pos: string[];
	count: number;
	word: string;
	selected: boolean;
};

export default Vue.extend({
	components: { SelectPicker },
	inheritAttrs: false,
	props: {
		annotationId: String,
		value: null as any as () => null|string,
		definition: Object as () => CorpusStore.NormalizedAnnotation
	},
	data: () => ({
		uid: UID(),
		input$: new Observable.BehaviorSubject<string>(''),
		subscriptions: [] as Observable.Subscription[],

		wordOptions: [] as null|WordOption[],

		posOptions: {} as Record<string, boolean>,

		displayValue: '',
	}),
	computed: {
		/** Lexicon database to use */
		database(): string { return UIStore.getState().global.lexiconDb; },

		inputId(): string { return this.definition.id + '_' + (this as any).uid; },

		selectedWords(): WordOption[] { return this.renderedWords ? this.renderedWords.filter(w => w.selected) : []; },
		renderedWords(): WordOption[] { return this.wordOptions ? this.wordOptions.filter(w => w.pos.some(pos => this.posOptions[pos])) : []; },

		modelValue: {
			get(): string { return this.value || ''; },
			set(v: string) { this.$emit('input', v); this.input$.next(v); }
		}
	},
	methods: {
		reset() { this.wordOptions = []; this.posOptions = {}; this.modelValue = ''; }
	},
	created() {
		const isValidWord = /^[\w]+$/;
		const emptyResult = {posOptions: {} as Record<string, boolean>, wordList: [] as WordOption[]};

		// don't ever do anything (clear or search...) while a suggestion is selected, also not when search term is emptied (such as when deselecting all suggestions)
		const filteredInput$ = this.input$.pipe(filter(v => !this.selectedWords.length && !!v));

		// we need two outcome streams:
		// one that clears immediately to either: empty when something is typed that seems invalid, or to null (indicating pending results) otherwise
		const clearResults$ = filteredInput$.pipe(map(v => !v.match(isValidWord) ? emptyResult : null));
		// and one that (for valid inputs) gets the results
		const suggestions$: Observable.Observable<typeof emptyResult> = filteredInput$.pipe(
			debounceTime(1500),
			switchMap(term => {
				// non-actionable input, don't show any suggestions, they should already have been cleared.
				// We need to let these invalid inputs trickle through to here so that
				// old requests are not given an oppertunity to complete and show stale results
				if (!term.match(isValidWord)) { return Observable.empty(); }
				const lemmata1 = Axios.get<LexiconLemmaIdResponse>(config.getLemmaIdFromWordform, { params: { database: this.database, wordform: term, case_sensitive: config.case_sensitive } });
				const lemmata2 = Axios.get<LexiconLemmaIdResponse>(config.getLemmaIdFromLemma, { params: { database: this.database, lemma: term, case_sensitive: config.case_sensitive } });
				const lemmataRequest = Promise.all([lemmata1, lemmata2]).then(r => r.flatMap(rr => rr.data.lemmata_list.flatMap(l => l.found_lemmata)));

				// Do this inside an observable, the pending stages of pipe() will not be ran if this observable is old (e.g. a new lemma came in)
				// Whereas if we .then().then().then() chain a promise, it will all run regardless of whether the results are still needed.
				return Observable
				.from(lemmataRequest)
				.pipe(
					// Phase 2: get associated words
					mergeMap(lemmata => filterDuplicates(lemmata, 'lemma_id')), // unpack the array of found lemmata into one message per lemma, for ease of use
					// Get the words that map to this lemma
					mergeMap(lemma => Axios.get<LexiconWordformsResponse>(config.getWordformsFromLemmaId, {
						params: {
							database: this.database,
							lemma_id: lemma.lemma_id
						}
					}).then(response => ({...response.data, ...lemma}))),
					map(lemma => ({
						lemma: lemma.lemma,
						pos: lemma.pos,
						wordforms: lemma.message === 'OK' ? lemma.wordforms_list.flatMap(wfl => wfl.found_wordforms) : []
					})),

					// Phase 3: wait for all requests to the lexicon service to complete,
					// then coordinate with BlackLab to find out which of the found words actually exist in the corpus.
					toArray(),
					mergeMap(async (lemmata) => {
						if (!lemmata.length) { return emptyResult; }

						lemmata.forEach(l => l.pos = `${l.lemma} (${l.pos || 'unknown'})`);

						// Request occurance counts in the corpus from blacklab. Note we also request occurance count for the entered search term.
						const {termFreq: frequencies} = await api.blacklab.getTermFrequencies(INDEX_ID, this.annotationId, lemmata.flatMap(r => r.wordforms).concat(term));

						const options: Record<string, WordOption> = {};
						lemmata.forEach(({pos, wordforms, lemma}) => {
							wordforms.forEach((word, i) => {
								options[word] = options[word] || {
									lemma,
									pos: [],
									count: frequencies[word],
									word,
									selected: false
								} as WordOption;

								options[word].pos.push(pos);
							});

							options[lemma] = options[lemma] || {
								lemma,
								pos: [],
								count: frequencies[lemma],
								word: lemma,
								selected: false
							} as WordOption;
							options[lemma].pos.push(pos);
						});
						const posList = filterDuplicates(lemmata, 'pos').map(l => l.pos);

						// If the entered word is not known in the lexicon service, but does occur in the corpus, create an extra checkbox
						// that is always shown (as long as any pos is selected)
						if (frequencies[term] && !options[term]) {
							options[term] = {
								lemma: term,
								pos: posList, // always show
								count: frequencies[term],
								word: term,
								selected: false
							};
						}

						const wordList = Object.values(options).filter(word => word.count > 0);
						const posOptions = mapReduce(posList);
						return {posOptions, wordList};
					}),
					catchError(e => [emptyResult])
				);
			})
		);

		const results$ = Observable.merge(clearResults$, suggestions$);

		this.subscriptions.push(
			results$.subscribe(r => {
				this.posOptions = r ? r.posOptions : {};
				this.wordOptions = r ? r.wordList.sort((a, b) => ((a.count === 0) !== (b.count === 0)) ? (a.count === 0 ? 1 : -1) : 0) : null;
			}),
		);
	},
	destroyed() {
		this.subscriptions.forEach(s => s.unsubscribe());
	},
	watch: {
		selectedWords(v: WordOption[], prev: WordOption[]) {
			// We need to discern changed checkbox availability from actual changes
			// Take care not to remove user-input value when an empty batch of alternatives comes in.
			if (v.length !== prev.length && this.wordOptions && this.wordOptions.length > 0) {
				this.modelValue = v.map(w => escapeRegex(w.word)).map(w => w.includes(' ') ? '"'+w+'"' : w).join('|');
			}
		},
		posOptions: {
			handler(cur, prev) {
				if (Object.entries(prev).length) {
					this.renderedWords.forEach(wo => wo.selected = wo.pos.some(pos => this.posOptions[pos]));
				}
			},
			deep: true
		}
	}
});
</script>

<style lang="scss" scoped>

.lexicon {
	position: relative;
}

label[disabled],
label.disabled {
	opacity: 0.5;
	cursor: not-allowed;
	input {
		opacity: 1;
	}
}

.fa-spinner {
	position: absolute;
	right: 0;
	top: 0;
	font-size: 22px;
	padding: 6px;
	pointer-events: none;
}

.form-group-lg .fa-spinner {
	font-size: 32px;
	padding: 7px;
}

.form-control.loading {
	text-overflow: ellipsis;
	padding-right: 2.5em;
}

</style>