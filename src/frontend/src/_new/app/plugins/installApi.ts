import { createBlackLabApi } from "@/_new/shared/api/blacklabApi";
import { createFrontendApi } from "@/_new/shared/api/frontendApi";
import type { BlackLabApi, FrontendApi } from "@/_new/shared/api/lib/api-types";
import type { User } from "oidc-client-ts";
import { inject, type InjectionKey, type MaybeRef, type ObjectPlugin } from "vue";

export const frontendApiInjectionKey: InjectionKey<FrontendApi> = Symbol('frontendApi');
export const blacklabApiInjectionKey: InjectionKey<BlackLabApi> = Symbol('blacklabApi');

/**
 * Create the BlackLab and Frontend api instances, return a plugin that can be installed on the vue app
 * to enable useBlacklabApi() and useFrontendApi() injectables.
 * @param options 
 * @returns 
 */
export const createApi = (options: {
	frontend: {baseUrl: string, user: MaybeRef<User|null>};
	blacklab: {baseUrl: string, user: MaybeRef<User|null>};
}): ObjectPlugin&{blacklabApi: BlackLabApi, frontendApi: FrontendApi} => {
	const frontendApi = createFrontendApi(options.frontend);
		// backward compat, for now.
	const blacklabApi = createBlackLabApi({...options.blacklab, headers: {'api': '4'}}); 
	return {
		install(app) {
			app.provide(frontendApiInjectionKey, frontendApi);
			app.provide(blacklabApiInjectionKey, blacklabApi);
		},
		frontendApi, 
		blacklabApi,
	};
};
export function useBlackLabApi(): BlackLabApi {
	const api = inject(blacklabApiInjectionKey);
	if (!api) throw new Error('BlackLab API not provided');
	return api;
}
export function useFrontendApi(): FrontendApi {
	const api = inject(frontendApiInjectionKey);
	if (!api) throw new Error('Frontend API not provided');
	return api;
}

