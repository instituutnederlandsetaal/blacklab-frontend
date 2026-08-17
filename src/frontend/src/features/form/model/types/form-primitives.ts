/** A plain value or a runtime resolver evaluated while rendering/compiling. */
export type FormValue<T> = T | (() => T);

export type QueryCombineMode = 'and' | 'or' | 'sequence';
export type BooleanType = Exclude<QueryCombineMode, 'sequence'>;

/** Open-ended presentation names with the variants supported by the built-in renderer. */
export type ContainerPresentation = 'list' | 'tabs' | 'small-tabs' | 'tab-badges' | 'columns' | 'panel-tabs' | (string & {});
export type FieldPresentation = 'simple' | 'large' | 'small' | 'horizontal' | 'default' | (string & {});

export type FormNodeKind = 'container' | 'form' | 'field' | 'view';
export type RangeMode = 'strict' | 'permissive';
