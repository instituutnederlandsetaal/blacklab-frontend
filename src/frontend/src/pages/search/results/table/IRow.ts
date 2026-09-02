import type { ColumnDefs, DisplaySettingsForRendering, Maxima } from '@/pages/search/results/table/table-layout';
import type { BLCollocationsParameters, BLSearchParameters } from '@/types/blacklabtypes';

/**
 * A base component for result rows in the results table.
 * It only serves a generic prop interface for the row data.
 * Defining all props here prevents Vue outputting attribute="[object object]" in the html if a row doesn't use a prop.
 */
export type IRowProps<T> = {
	info: DisplaySettingsForRendering;
	cols: ColumnDefs;

	maxima?: Maxima;

	open?: boolean;
	disabled?: boolean;
	detailsEnabled?: boolean;
	detailsId?: string;
	type: 'hits' | 'docs';
	operation?: 'hits' | 'docs' | 'collocations';
	query?: BLSearchParameters | BLCollocationsParameters;

	/** which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora) */
	hoverMatchInfos?: string[];
	row: T;
};
