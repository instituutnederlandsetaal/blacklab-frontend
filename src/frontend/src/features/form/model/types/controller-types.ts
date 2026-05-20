export type FilterPanelGroup = {
	id: string;
	title: string;
	subtabs: Array<{
		id: string;
		title?: string;
		fields: string[];
	}>;
	query?: Record<string, string[]>;
};
