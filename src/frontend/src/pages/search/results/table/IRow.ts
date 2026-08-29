import type { ColumnDefs, DisplaySettingsForRendering, Maxima } from '@/pages/search/results/table/table-layout';
import type { BLSearchParameters } from '@/types/blacklabtypes';

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
	type: 'hits' | 'docs';
	query?: BLSearchParameters;

	/** which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora) */
	hoverMatchInfos?: string[];
	row: T;
};
