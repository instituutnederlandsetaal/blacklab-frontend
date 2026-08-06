<template>
	<div v-if="relationClasses.length" class="dependency-tree">
		<label v-if="relationClasses.length > 1">
			<span>{{ $t('results.table.dependencySet') }}</span>
			<select v-model="relationClass" class="form-control input-sm">
				<option v-for="value in relationClasses" :key="value" :value="value">{{ value }}</option>
			</select>
		</label>
		<svg v-if="tree" :aria-label="$t('results.table.showFullSentence')" :dir="dir" :height="tree.height" :viewBox="`0 0 ${tree.width} ${tree.height}`" :width="tree.width" role="img" focusable="false">
			<g class="relations">
				<g v-for="arc in tree.arcs" :key="arc.key">
					<path :d="arc.path" />
					<text :x="arc.labelX" :y="arc.labelY" :text-anchor="arc.root ? 'start' : 'middle'">{{ arc.label }}</text>
				</g>
			</g>
			<g v-for="token in tree.tokens" :key="token.position" :transform="`translate(${token.x})`" text-anchor="middle">
				<text class="form" :y="tree.tokenY">{{ token.form }}</text>
				<text v-for="(feature, index) in token.features" :key="feature" class="feature" :y="tree.tokenY + (index + 1) * 16">{{ feature }}</text>
			</g>
		</svg>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

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
const tree = computed(() => {
	const relations = relationClass.value ? relationSets.value.get(relationClass.value) : null;
	if (!relations?.size) return null;

	const orderedTokens = tokens.value.map((token, index) => ({ index, token }));
	if (props.dir === 'rtl') orderedTokens.reverse();

	let width = 12;
	const positions = new Map<number, { index: number; x: number }>();
	const laidOutTokens = orderedTokens.map(({ index, token }, visualIndex) => {
		const form = token.annotations[props.primaryAnnotation.id] ?? '';
		const features = secondaryAnnotations.value.flatMap(annotation => {
			const value = token.annotations[annotation.id];
			return value ? [`${annotation.id}=${value}`] : [];
		});
		const tokenWidth = Math.max(40, form.length * 8, ...features.map(feature => feature.length * 6)) + 24;
		const position = contextStart.value + index;
		const x = width + tokenWidth / 2;
		width += tokenWidth;
		positions.set(position, { index: visualIndex, x });
		return { features, form, position, x };
	});

	const arcs = [...relations.values()].map((relation, index) => {
		const source = relation.sourceStart == null ? null : positions.get(relation.sourceStart)!;
		const target = positions.get(relation.targetStart)!;
		return {
			end: source ? Math.max(source.index, target.index) : target.index,
			key: `${relation.sourceStart ?? 'root'}-${relation.targetStart}-${index}`,
			label: relation.relType,
			level: 0,
			root: !source,
			sourceX: source?.x ?? target.x,
			start: source ? Math.min(source.index, target.index) : target.index,
			targetX: target.x,
		};
	});
	const lanes: Array<Array<[number, number]>> = [];
	for (const arc of arcs.filter(arc => !arc.root).sort((a, b) => a.end - a.start - (b.end - b.start))) {
		let lane = 0;
		while (lanes[lane]?.some(([start, end]) => arc.start < end && start < arc.end)) lane++;
		(lanes[lane] ??= []).push([arc.start, arc.end]);
		arc.level = lane + 1;
	}

	const levels = Math.max(1, lanes.length + (arcs.some(arc => arc.root) ? 1 : 0));
	const tokenY = 24 + levels * 36 + 18;
	const arcY = tokenY - 18;
	return {
		arcs: arcs.map(arc => {
			const topY = arc.root ? 24 : arcY - arc.level * 36;
			return {
				...arc,
				labelX: arc.root ? arc.targetX + 7 : (arc.sourceX + arc.targetX) / 2,
				labelY: topY - 6,
				path: `${arc.root ? `M${arc.targetX},${topY} L${arc.targetX},${arcY}` : `M${arc.sourceX},${arcY} C${arc.sourceX},${topY} ${arc.targetX},${topY} ${arc.targetX},${arcY}`} M${arc.targetX - 4},${arcY - 7} L${arc.targetX},${arcY} L${arc.targetX + 4},${arcY - 7}`,
			};
		}),
		height: tokenY + Math.max(1, ...laidOutTokens.map(token => token.features.length)) * 16 + 12,
		tokenY,
		tokens: laidOutTokens,
		width: width + 12,
	};
});
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

		.relations {
			path {
				fill: none;
				stroke: currentColor;
				stroke-width: 1.1;
			}

			text {
				fill: #4a0984;
				font-size: 12px;
			}
		}

		.form {
			font-size: 16px;
		}

		.feature {
			fill: #b352ac;
			font-size: 10px;
		}
	}
}
</style>
