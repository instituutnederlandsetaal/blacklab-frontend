import type { FrontendApi } from "@/_new/shared/api";
import { createBlackLabApi } from "@/_new/shared/api/blacklabApi";
import { createEndpoint } from "@/_new/shared/api/lib/api-endpoint";
import type { User } from "oidc-client-ts";
import type { MaybeRef, ObjectPlugin } from "vue";

export const frontendApiSymbol = Symbol('frontendApi');
export function useFrontendApi(): FrontendApi {
	
}


/** Initialize an endpoint. In a function because urls might be set asynchronously (such as from customjs). */
export function init(which: keyof typeof endpoints, url: string, user: User|null) {
	if (!(which in endpoints)) throw new Error(`Unknown endpoint ${which}`);
	if (endpoints[which]) throw new Error(`Endpoint ${which} already initialized`);
	const headers = {};
	if (user) {
		// Authorization header must be re-created on each request, as the token might have changed
		// So wrap in a getter
		Object.defineProperty(headers, 'Authorization', {
			get() { return `Bearer ${user.access_token}`; },
			enumerable: true,
		});
	}

	endpoints[which] = createEndpoint({
		baseURL: url.replace(/\/*$/, '/'),
		paramsSerializer: params => new URLSearchParams(params).toString(),
		headers,
		params: which === 'blacklab' ? {
			api: '4' // backward compat
		} : undefined,
	});
}



export const createApi = (options: {
	frontend: {baseUrl: string, user: MaybeRef<User|null>};
	blacklab: {baseUrl: string, user: MaybeRef<User|null>};
}): ObjectPlugin => ({
	install(app) {
		const frontendApi = createFrontendApi(createEndpoint({
			baseURL: options.frontend.baseUrl, options.frontend.user
		});
		const blacklabApi = createBlackLabApi(options.blacklab.baseUrl, options.blacklab.user);
	}
})


export const createFrontendApi = (options: {baseUrl: string, user: MaybeRef<User|null>}): ObjectPlugin => {
	
	
	return {
		install(app) {
			const api = createFrontendApiInstance(options.baseUrl, options.user);
			app.provide(frontendApiSymbol, api);
		}
	}
}

