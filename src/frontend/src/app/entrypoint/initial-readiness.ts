import type { Loadable } from '@/shared/utils/loadable/loadable-core';

type InitialRoute = { name: string | symbol | null | undefined; matched: readonly unknown[]; params: { corpus?: unknown } };

export function isInitialPageReady(route: InitialRoute, context: Loadable<{ index?: unknown }>, contentReady: boolean, searchReadSettled: boolean): boolean {
	if (route.params.corpus && (context.isError() || (context.isLoaded() && !context.value.index))) return true;
	return (context.isError() || context.isLoaded()) && (contentReady || !route.matched.length) && (route.name !== 'search' || searchReadSettled);
}
