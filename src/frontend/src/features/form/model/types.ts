// =====================================================================
// On to the controllers and stateful runtime aspects of the form system
// =====================================================================

// export type DraftFormState = {
// 	activeForm: string;
// 	forms: Record<string, FormState>;
// };

// Compilation/controller stuff.

// export type FormFilterDefinition<MetadataType = unknown> = {
// 	id: string;
// 	defaultDisplayName: string;
// 	defaultDescription?: string;
// 	componentName: string;
// 	behaviourName?: string;
// 	groupId?: string;
// 	metadata?: MetadataType;
// };

// export type FilterPanelGroup = {
// 	id: string;
// 	title: string;
// 	subtabs: Array<{
// 		id: string;
// 		title?: string;
// 		fields: string[];
// 	}>;
// 	query?: Record<string, string[]>;
// };

// export type AnnotationFieldState = {
// 	value: string;
// 	caseSensitive: boolean;
// };

// export type AnnotationFieldConfig = {
// 	annotationId: string;
// 	annotatedFieldId?: string;
// 	displayName: string;
// 	description?: string;
// 	caseSensitive?: boolean;
// 	uiType?: 'text' | 'select' | 'combobox' | 'pos' | 'lexicon';
// 	options?: Options;
// 	autocomplete?: (term: string) => Promise<string[]>;
// };

// export type MetadataFilterFieldState = unknown;

// export type MetadataFilterFieldConfig = {
// 	definition: FormFilterDefinition;
// 	textDirection?: 'ltr' | 'rtl';
// };

// export type WithinFieldState = {
// 	element: string | null;
// 	attributes: Record<string, string>;
// };

// export type WithinFieldOption = Option & {
// 	attributes?: Option[];
// };

// export type WithinFieldConfig = {
// 	label?: string;
// 	options: WithinFieldOption[];
// };

// export type ExpertQueryFieldState = {
// 	query: string;
// 	targetQueries: string[];
// };

// export type ExpertQueryFieldConfig = {
// 	label?: string;
// 	helpUrl?: string;
// 	rows?: number;
// };

// export type ParallelFieldState = {
// 	source: string | null;
// 	targets: string[];
// 	alignBy: string | null;
// };

// export type ParallelFieldConfig = {
// 	label?: string;
// 	sourceLabel?: string;
// 	targetLabel?: string;
// 	alignByLabel?: string;
// 	sourceOptions: Option[];
// 	targetOptions?: Option[];
// 	alignByOptions?: Option[];
// };

// export type HeadingViewConfig = {
// 	title: string;
// 	description?: string;
// };

// export type SummaryViewConfig = {
// 	title?: string;
// 	showRaw?: boolean;
// };

// export type TotalsViewConfig = {
// 	title?: string;
// 	baseDocuments: number;
// 	baseTokens: number;
// };

// Runtime stuff.
