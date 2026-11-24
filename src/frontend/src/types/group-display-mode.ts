export const groupDisplayModes = ['table', 'docs', 'hits', 'relative docs', 'relative hits', 'tokens'] as const;
export type GroupDisplayMode = (typeof groupDisplayModes)[number];
