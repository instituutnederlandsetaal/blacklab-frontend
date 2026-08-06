<template>
	<div v-if="relationClasses.length" class="dependency-tree">
		<label v-if="relationClasses.length > 1">
			<span>{{ $t('results.table.dependencySet') }}</span>
			<select v-model="relationClass" class="form-control input-sm">
				<option v-for="value in relationClasses" :key="value" :value="value">{{ value }}</option>
			</select>
		</label>
		<svg ref="svg" :aria-label="$t('results.table.showFullSentence')" :dir="dir" role="img" focusable="false" />
	</div>
</template>

<script setup lang="ts">
import dependencyTree from 'dependencytreejs/lib';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { HitContext, NormalizedAnnotation } from '@/types/apptypes';
import type { BLHit, BLMatchInfoRelation } from '@/types/blacklabtypes';

const props = withDefaults(
	defineProps<{
		context: HitContext;
		hitStart: number;
		matchInfos: BLHit['matchInfos'];
		primaryAnnotation: NormalizedAnnotation;
		secondaryAnnotations: NormalizedAnnotation[];
		dir: 'ltr' | 'rtl';
		preferredRelationClass?: string | null;
	}>(),
	{ preferredRelationClass: null },
);

const svg = ref<SVGElement | null>(null);
const selectedRelationClass = ref<string | null>(null);
const tokens = computed(() => [...props.context.before, ...props.context.match, ...props.context.after]);
const contextStart = computed(() => props.hitStart - props.context.before.length);
const relationSets = computed(() => {
	const positions = new Set(tokens.value.map((_, index) => contextStart.value + index));
	const sets = new Map<string, Map<number, BLMatchInfoRelation>>();
	const infos = Object.values(props.matchInfos ?? {}).flatMap(info => (info.type === 'list' ? info.infos : [info]));

	for (const relation of infos) {
		if (
			relation.type !== 'relation' ||
			relation.targetField ||
			relation.targetEnd - relation.targetStart !== 1 ||
			(relation.sourceStart != null && (relation.sourceEnd == null || relation.sourceEnd - relation.sourceStart !== 1)) ||
			!positions.has(relation.targetStart) ||
			(relation.sourceStart != null && !positions.has(relation.sourceStart))
		)
			continue;

		const set = sets.get(relation.relClass) ?? new Map<number, BLMatchInfoRelation>();
		if (!set.has(relation.targetStart)) set.set(relation.targetStart, relation);
		sets.set(relation.relClass, set);
	}

	return sets;
});
const relationClasses = computed(() => [...relationSets.value.keys()].sort((a, b) => a.localeCompare(b)));
const relationClass = computed({
	get() {
		const classes = relationClasses.value;
		if (selectedRelationClass.value && classes.includes(selectedRelationClass.value)) return selectedRelationClass.value;
		if (props.preferredRelationClass && classes.includes(props.preferredRelationClass)) return props.preferredRelationClass;
		return classes.includes('dep') ? 'dep' : (classes.find(value => !/^al(?:__|$)/i.test(value)) ?? classes[0] ?? null);
	},
	set(value: string | null) {
		selectedRelationClass.value = value;
	},
});
const secondaryAnnotations = computed(() => props.secondaryAnnotations.filter(annotation => annotation.id !== props.primaryAnnotation.id));

type ReactiveSentence = InstanceType<(typeof dependencyTree)['ReactiveSentence']>;
type SentenceSvg = InstanceType<(typeof dependencyTree)['SentenceSVG']>;
let reactiveSentence: ReactiveSentence | null = null;
let sentenceSvg: SentenceSvg | null = null;

function clearTree() {
	if (sentenceSvg) {
		reactiveSentence?.detach(sentenceSvg);
		sentenceSvg.clearTree();
	}
	reactiveSentence = null;
	sentenceSvg = null;
	svg.value?.replaceChildren();
}

function renderTree() {
	clearTree();
	const relations = relationClass.value ? relationSets.value.get(relationClass.value) : null;
	if (!svg.value || !relations?.size) return;

	const tokenIds = new Map(tokens.value.map((_, index) => [contextStart.value + index, index + 1]));
	const nextReactiveSentence = new dependencyTree.ReactiveSentence();
	nextReactiveSentence.state.metaJson.rtl = props.dir === 'rtl' ? 'yes' : 'no';

	for (const [index, token] of tokens.value.entries()) {
		const id = String(index + 1);
		const relation = relations.get(contextStart.value + index);
		nextReactiveSentence.state.treeJson.nodesJson[id] = {
			ID: id,
			FORM: token.annotations[props.primaryAnnotation.id] ?? '',
			LEMMA: '',
			UPOS: '',
			XPOS: '',
			FEATS: Object.fromEntries(secondaryAnnotations.value.map(annotation => [annotation.id, token.annotations[annotation.id]]).filter(([, value]) => value)),
			HEAD: relation ? (relation.sourceStart == null ? 0 : (tokenIds.get(relation.sourceStart) ?? -1)) : -1,
			DEPREL: relation?.relType ?? '',
			DEPS: {},
			MISC: {},
		};
	}

	const nextSentenceSvg = new dependencyTree.SentenceSVG(svg.value, nextReactiveSentence, {
		...dependencyTree.defaultSentenceSVGOptions(),
		arcHeight: 40,
		shownFeatures: ['FORM', ...secondaryAnnotations.value.map(annotation => `FEATS.${annotation.id}`)],
		tokenSpacing: 40,
	});
	reactiveSentence = nextReactiveSentence;
	sentenceSvg = nextSentenceSvg;
}

onMounted(renderTree);
watch([tokens, relationSets, relationClass, secondaryAnnotations, () => props.primaryAnnotation, () => props.dir], renderTree, { deep: true, flush: 'post' });
onBeforeUnmount(clearTree);
</script>

<style lang="scss" scoped>
.dependency-tree {
	margin: 0.5rem 0 1rem;

	> label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	select {
		display: inline-block;
		width: auto;
	}

	svg {
		display: block;
		max-width: none;
		overflow: visible;
	}
}
</style>
