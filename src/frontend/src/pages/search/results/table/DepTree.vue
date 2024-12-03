<template>
	<reactive-dep-tree v-if="connlu && renderTree" ref="tree"
		minimal
		interactive
		:shown-features="shownFeatures"
		:conll="connlu"
	></reactive-dep-tree>
</template>

<script lang="ts">
// https://github.com/kirianguiller/reactive-dep-tree/
import Vue from 'vue';

// @ts-ignore
import {ReactiveDepTree} from '@/../node_modules/reactive-dep-tree/dist/reactive-dep-tree.umd.js';
import {HitRowData} from '@/pages/search/results/table/HitRow.vue';
import { BLHit, BLHitSnippetPart, BLMatchInfoRelation } from '@/types/blacklabtypes';
import Spinner from '@/components/Spinner.vue';
import { NormalizedAnnotation } from '@/types/apptypes';


/* https://universaldependencies.org/format.html
Sentences consist of one or more word lines, and word lines contain the following fields:

ID:     Word index, integer starting at 1 for each new sentence; may be a range for multiword tokens; may be a decimal number for empty nodes (decimal numbers can be lower than 1 but must be greater than 0).
FORM:   Word form or punctuation symbol.
LEMMA:  Lemma or stem of word form.
UPOS:   Universal part-of-speech tag.
XPOS:   Optional language-specific (or treebank-specific) part-of-speech / morphological tag; underscore if not available.
FEATS:  List of morphological features from the universal feature inventory or from a defined language-specific extension; underscore if not available.
HEAD:   Head of the current word, which is either a value of ID or zero (0).
DEPREL: Universal dependency relation to the HEAD (root iff HEAD = 0) or a defined language-specific subtype of one.
DEPS:   Enhanced dependency graph in the form of a list of head-deprel pairs.
MISC:   Any other annotation.
*/
// const conllExample =
// `# text = I am eating a pineapple
// 1	I	_	PRON	_	_	2	suj	_	_
// 2	am	_	AUX	_	_	0	root	_	_
// 3	eating	_	VERB	_	_	2	aux	_	highlight=red
// 4	a	_	DET	_	_	5	det	_	_
// 5	pineapple	_	NOUN	_	_	3	obj	_	_`

/**
 * Transform from arrays of strings to an array of objects with keys.
 * E.g: {
 *   word: ['I', 'am', 'eating', 'a', 'pineapple'],
 *   lemma: ['i', 'be', 'eat', 'a', 'pineapple'],
 * }
 * to
 * [{word: 'I', lemma: 'i'}, {word: 'am', lemma: 'be'}, ...]
 */
function flatten(h?: BLHitSnippetPart, values?: string[]): Array<Record<string, string>> {
	const r = [] as Array<Record<string, string>>;
	if (!h) return r;
	if (values) {
		values.forEach(k => {
			if (k in h) {
				h[k].forEach((v, i) => {
					r[i] = r[i] || {};
					r[i][k] = v;
				})
			}
		});
	} else {
		Object.entries(h).forEach(([k, v]) => {
			v.forEach((vv, i) => {
				r[i] = r[i] || {};
				r[i][k] = vv;
			})
		})
	}
	return r;
}

export default Vue.extend({
	components: {
		ReactiveDepTree,
		Spinner
	},
	props: {
		data: Object as () => HitRowData,
		fullSentence: Object as () => BLHit|undefined,

		// TODO
		dir: String as () => 'ltr'|'rtl',
		mainAnnotation: Object as () => NormalizedAnnotation,
		otherAnnotations: Object as () => Record<'lemma'|'upos'|'xpos'|'feats', NormalizedAnnotation|null>,
	},
	data: () => ({
		renderTree: true,
	}),
	computed: {
		shownFeatures(): string {
			const extraFeatures = Object.entries(this.otherAnnotations).filter(([featureName, annotationForFeature]) => annotationForFeature != null).map(([k, v]) => k.toUpperCase()).join(',');
			return `FORM${extraFeatures ? ',' + extraFeatures : ''}`;
		},

		// We only need this to know where our hit starts and ends.
		hit(): BLHit|undefined { return 'start' in this.data.hit ? this.data.hit : undefined; },
		// The full sentence is the context in which the hit was found. Unless we don't have the sentence (yet), then it's the same hit ;)
		context(): BLHit|undefined { return this.fullSentence || this.hit },

		// Make the hit array make sense, since indexing into three non-0 indexed objects is a bit of a pain.
		// Basically just make an array of key-value maps that contain the annotations for each token. e.g. [{word: 'I', lemma: 'i'}, {word: 'am', lemma: 'be'}, ...]
		sensibleArray(): undefined|Array<Record<string, string>> {
			if (!this.context?.matchInfos) return undefined;
			/** Which annotations are we interested in, punct and the main annotation, but maybe more. */
			const extract = ['punct', this.mainAnnotation.id].concat(Object.values(this.otherAnnotations).filter((a): a is NormalizedAnnotation => !!a).map(a => a.id));
			const {left, match, right} =  this.context;
			return flatten(left, extract).concat(flatten(match, extract)).concat(flatten(right, extract));
		},

		/**
		 * Convert BlackLab's returned relation object into something representing connl-u relations.
		 * Meaning a list of "tokens" (i.e. positions in the sentence), pointing at their parent ("sourceIndex" property).
		 */
		relationInfo(): undefined|Array<undefined|{parentIndex: number; label: string;}> {
			if (!this.hit || !this.context || !this.sensibleArray) return undefined;

			const {start} = this.hit!;
			const leftLength = this.context!.left?.punct?.length || 0;
			const indexOffset = start - leftLength;

			const r: Array<{parentIndex: number;label: string;}> = [];
			const doRelation = (v: BLMatchInfoRelation) => {
				// CoNNL-U can only have one parent, so skip if the relation is not one-to-one
				if (!(v.targetEnd - v.targetStart > 1) && (v.sourceStart == null || !(v.sourceEnd! - v.sourceStart > 1))) {
					// translate the indices to something that makes sense
					const sourceIndex = v.sourceStart != null ? v.sourceStart - indexOffset : -1; // 0 signifies root.
					const targetIndex = v.targetStart - indexOffset;
					// add the relation to the sensible array

					r[targetIndex] = {
						// might be undefined for root?
						parentIndex: sourceIndex,
						label: v.relType,
					}
				}
			}

			Object.entries(this.context.matchInfos || {}).forEach(mi => {
				const [k, v] = mi;
				// Not interested in non-relation matches.
				if (v.type === 'relation') doRelation(v);
				else if (v.type === 'list') v.infos.forEach(doRelation);
			})
			return r.length ? r : undefined;
		},
		connlu(): string {
			if (!this.relationInfo) return '';

			let header = '# text = ';
			let rows: string[][] = [];

			for (let i = 0; i < this.sensibleArray!.length; ++i) {
				const rel = this.relationInfo[i];
				const token = this.sensibleArray![i];
				// Sometimes relations contains relations point outside the matched hit.
				// We could compute the sensibleArray based on the hit snippet
				// (which is larger and probably does contain the tokens), but then the tree component would end up rendering something like 50 tokens, which is way too wide.
				if (!token) continue;

				// ID   FORM     LEMMA   UPOS    XPOS     FEATS  HEAD    DEPREL   DEPS   MISC
				// # text = I am eating a pineapple
				// 1    I         _      PRON    _        _      2       suj      _      _
				// 2    am        _      AUX     _        _      0       root     _      _
				// 3    eating    _      VERB    _        _      2       aux      _      highlight=red
				// 4    a         _      DET     _        _      5       det      _      _
				// 5    pineapple _      NOUN    _        _      3       obj      _      _

				// omit punctuation before first word of sentence.
				if (i !== 0) header = header + token.punct;
				header += token[this.mainAnnotation.id];

				const row = [] as string[];
				row.push((1+i).toString()); // index
				row.push(token[this.mainAnnotation.id]); // form (usually word)
				if (this.otherAnnotations.lemma) row.push(token[this.otherAnnotations.lemma.id]); else row.push('_'); // lemma
				if (this.otherAnnotations.upos)  row.push(token[this.otherAnnotations.upos.id]);  else row.push('_'); // upos
				if (this.otherAnnotations.xpos)  row.push(token[this.otherAnnotations.xpos.id]);  else row.push('_'); // xpos
				if (this.otherAnnotations.feats) row.push(token[this.otherAnnotations.feats.id]); else row.push('_'); // feats
				row.push(rel && rel.parentIndex < this.sensibleArray!.length  ? (rel.parentIndex + 1).toString() : '_'); // head
				row.push(rel ? rel.label : '_'); // deprel
				row.push('_'); // deps
				row.push('_'); // highlight.
				// row.push(i + this.indexOffset >= this.hit!.start && i + this.indexOffset < this.hit!.end ? `highlight=red` : '_'); // misc

				rows.push(row);
			}

			if (!rows.length) return '';

			return header + '\n' + rows.map(row => row.join('\t')).join('\n');
		},
	},
	watch: {
		connlu() {
			// Tree component is somehow not reactive..
			this.renderTree = false;
			this.$nextTick(() => this.renderTree = true);
		}
	}
});
</script>

<style lang="scss" scoped>
</style>