/** Return the path Vue Router expects for a URL inside its deployment base. */
export function routerPath(url: URL, base: string) {
	const prefix = base.replace(/\/+$/, '');
	if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return null;
	return (url.pathname.slice(prefix.length) || '/') + url.search + url.hash;
}
