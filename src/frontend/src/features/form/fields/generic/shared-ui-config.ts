export type GenericFieldUiConfig = {
	/** Access for debug rendering of the field */
	id?: string;
	groupId?: string;
	displayName: string;
	description?: string;
	textDirection?: 'ltr' | 'rtl';
};

/**
 * Fields that operate on a range can generally pick whether the range is strict or permissive
 * I.e. whether the true value must fall wholly within, or only partially within the specified range.
 */
export type RangeMode = 'strict' | 'permissive';
