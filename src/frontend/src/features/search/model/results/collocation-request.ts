import type { EffectiveCollocationParameters } from '@/features/search/model/results/result-types';
import type { BLSearchParameters } from '@/types/blacklabtypes';

type CollocationWindow = {
	before: number;
	after: number;
	within?: string;
};

const GROUP_SORTS = new Set(['identity', 'size', 'score']);
const INLINE_TAG = /^[\p{L}_][\p{L}\p{N}_.-]*(?::[\p{L}_][\p{L}\p{N}_.-]*)?$/u;

function parseWindow(context: number | string, within?: string): CollocationWindow | null {
	if (within && !INLINE_TAG.test(within)) return null;
	if (typeof context === 'number') return Number.isSafeInteger(context) && context >= 0 ? { before: context, after: context, within } : null;

	const value = context.trim();
	if (/^\d+$/.test(value)) {
		const size = Number(value);
		return Number.isSafeInteger(size) ? { before: size, after: size, within } : null;
	}

	const asymmetric = /^(\d+):(\d+)$/.exec(value);
	if (asymmetric) {
		const before = Number(asymmetric[1]);
		const after = Number(asymmetric[2]);
		return Number.isSafeInteger(before) && Number.isSafeInteger(after) ? { before, after, within } : null;
	}

	// BlackLab also accepts an inline tag name as context when no separate `within` is supplied.
	return !within && INLINE_TAG.test(value) ? { before: 0, after: 0, within: value } : null;
}

/** Convert the documented proximity-collocations shorthand to an ordinary all-hits request. */
export function createCollocationHitsParameters(params: EffectiveCollocationParameters): BLSearchParameters | null {
	if (!params.viewgroup) return null;
	const window = parseWindow(params.context, params.within);
	if (!window) return null;

	const { annotation, collpatt, colltype: _colltype, context, group: _group, patt, reltype: _reltype, scorertype: _scorertype, sensitive, sort, viewgroup, within: _within, ...shared } = params;
	const zeroWindow = window.before === 0 && window.after === 0;
	const lower = zeroWindow ? -1 : window.before === 0 ? 1 : -window.before;
	const upper = zeroWindow ? 1 : window.after === 0 ? -1 : window.after;
	const offsets = window.within && zeroWindow ? '' : `,${lower},${upper}`;
	const collocatePattern = collpatt || '[]';
	const hitsPattern = window.within ? `meet_within(${collocatePattern}, ${patt}, <${window.within}/>${offsets})` : `meet(${collocatePattern}, ${patt}${offsets})`;
	const hitSort = sort?.replace(/^-/, '');

	return {
		...shared,
		context,
		patt: hitsPattern,
		...(sort && hitSort && !GROUP_SORTS.has(hitSort) ? { sort } : {}),
		hitfiltercrit: `hit:${annotation}:${sensitive ? 's' : 'i'}`,
		hitfilterval: viewgroup,
	};
}
