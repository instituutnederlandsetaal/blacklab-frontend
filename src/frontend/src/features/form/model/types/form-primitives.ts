/** A plain value or a runtime resolver evaluated while rendering/compiling. */
export type FormValue<T> = T | (() => T);

export type QueryCombineMode = 'and' | 'or' | 'sequence';
export type BooleanType = Exclude<QueryCombineMode, 'sequence'>;

export type NodeAppearance = {
	/** CSS classes on the node's root element. */
	class?: string;
	/** Inline CSS on the node's root element. */
	style?: string;
};

export type ContainerBehavior = {
	/** Render all direct children (default), or only the selected tab. Does not change query participation. */
	mode?: 'all' | 'tabs';
	/** Count descendant fields with query contributions on each tab; hide zero counts. */
	tabBadges?: FormValue<boolean>;
};

export type ContainerPresentation = NodeAppearance & {
	frame?: 'none' | 'panel';
	/** Arrange rendered direct children; defaults to list. */
	layout?: 'list' | 'columns';
	tabSize?: 'normal' | 'small';
	tabTone?: 'plain' | 'secondary' | 'primary';
	bodyClass?: string;
	bodyStyle?: string;
	tabsClass?: string;
	tabsStyle?: string;
};

export type FieldPresentation = NodeAppearance & {
	layout?: 'vertical' | 'horizontal';
	size?: 'normal' | 'small' | 'large';
};

/** Controls offered by text fields, independently of their appearance. */
export type TextFieldControls = 'full' | 'simple';

export type FormNodeKind = 'container' | 'form' | 'field' | 'view';
export type RangeMode = 'strict' | 'permissive';
