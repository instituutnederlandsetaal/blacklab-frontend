import type { Meta, StoryObj } from '@storybook/vue3-vite';

import type { HitContext, NormalizedAnnotation } from '@/types/apptypes';
import type { BLHit, BLMatchInfoRelation } from '@/types/blacklabtypes';

import DepTree from './DepTree.vue';

const annotation = (id: string, isMainAnnotation = false): NormalizedAnnotation => ({
	annotatedFieldId: 'contents',
	caseSensitive: false,
	defaultDescription: '',
	defaultDisplayName: id,
	hasForwardIndex: true,
	id,
	isInternal: false,
	isMainAnnotation,
	offsetsAlternative: '',
	uiType: 'text',
});
const token = (word: string, lemma: string, upos: string) => ({ annotations: { lemma, upos, word }, punct: ' ' });
const relation = (relType: string, sourceStart: number | null, targetStart: number, relClass = 'dep'): BLMatchInfoRelation => ({
	type: 'relation',
	relClass,
	relType,
	...(sourceStart == null ? {} : { sourceStart, sourceEnd: sourceStart + 1 }),
	targetStart,
	targetEnd: targetStart + 1,
	start: Math.min(sourceStart ?? targetStart, targetStart),
	end: Math.max(sourceStart ?? targetStart, targetStart) + 1,
});

const context: HitContext = {
	before: [token('The', 'the', 'DET'), token('quick', 'quick', 'ADJ'), token('brown', 'brown', 'ADJ'), token('fox', 'fox', 'NOUN')],
	match: [token('jumps', 'jump', 'VERB')],
	after: [token('over', 'over', 'ADP'), token('the', 'the', 'DET'), token('lazy', 'lazy', 'ADJ'), token('dog', 'dog', 'NOUN')],
};
const matchInfos: NonNullable<BLHit['matchInfos']> = Object.fromEntries(
	[
		relation('root', null, 104),
		relation('nsubj', 104, 103),
		relation('det', 103, 100),
		relation('amod', 103, 101),
		relation('amod', 103, 102),
		relation('obl', 104, 108),
		relation('case', 108, 105),
		relation('det', 108, 106),
		relation('amod', 108, 107),
		relation('agent', 103, 108, 'semantic'),
	].map((value, index) => [`relation-${index}`, value]),
);

const meta = {
	title: 'Pages/Search/Results/Dependency Tree',
	component: DepTree,
	parameters: { layout: 'padded' },
	args: {
		context,
		dir: 'ltr',
		hitStart: 104,
		matchInfos,
		preferredRelationClass: 'dep',
		primaryAnnotation: annotation('word', true),
		secondaryAnnotations: [annotation('lemma'), annotation('upos')],
	},
	argTypes: {
		context: { control: false },
		dir: { control: 'inline-radio', options: ['ltr', 'rtl'] },
		hitStart: { control: false },
		matchInfos: { control: false },
		preferredRelationClass: { control: 'inline-radio', options: ['dep', 'semantic'] },
		primaryAnnotation: { control: false },
		secondaryAnnotations: { control: false },
	},
} satisfies Meta<typeof DepTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
