import useInjectable from "@/app/plugins/lib/useInjectable";
import { createBlackLabApi } from "@/shared/api/blacklabApi";
import { createFrontendApi } from "@/shared/api/frontendApi";
import type { BlackLabApi, FrontendApi } from "@/shared/api/lib/api-types";
import type { User } from "oidc-client-ts";
import { type MaybeRef, type ObjectPlugin } from "vue";

const [frontendApiInjectionKey, _provideFrontendApi, useFrontendApi] = useInjectable<FrontendApi>("frontendApi");
const [blacklabApiInjectionKey, _provideBlackLabApi, useBlackLabApi] = useInjectable<BlackLabApi>("blacklabApi");

/**
 * Create the BlackLab and Frontend api instances, return a plugin that can be installed on the vue app
 * to enable useBlackLabApi() and useFrontendApi() injectables.
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

export { useBlackLabApi, useFrontendApi };

