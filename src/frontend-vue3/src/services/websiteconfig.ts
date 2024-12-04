import type { ApiError, Canceler, frontend } from './api';

export type Pages = 'search'|'article'|'corpora'|'about'|'help'|'error'|'notfound';

export type WebsiteConfig = {
	displayName: string;
	// need more stuff here.
	links: Array<{href: string, blank: boolean, label: string}>;
	customCss: Record<Pages, Array<{
		href: string;
		attributes: Record<string, string>;
	}>>;
	customJs: Record<Pages, Array<{
		href: string;
		attributes: Record<string, string>;
	}>>;
}

const cache: Record<string, Promise<WebsiteConfig|ApiError>> = {};

export default async function loadConfig(corpus: string): Promise<WebsiteConfig|ApiError> {
	if (!cache[corpus]) {
		cache[corpus] = frontend.getCustomizations(corpus);
	}
	return cache[corpus];
}
