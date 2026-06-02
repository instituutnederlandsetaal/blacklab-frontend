import type { User } from 'oidc-client-ts';
import { type MaybeRef, type ObjectPlugin } from 'vue';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { createFrontendApi } from '@/shared/api/frontendApi';
import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import { provideBlackLabApi, provideFrontendApi } from '@/shared/api/useApi';

/**
 * Create the BlackLab and Frontend api instances, return a plugin that can be installed on the vue app
 * to enable useBlackLabApi() and useFrontendApi() injectables.
 */
export const createApi = async (options: {
	frontend: { baseUrl: string; user: MaybeRef<User | null> };
	blacklab: { baseUrl: string; user: MaybeRef<User | null> };
}): Promise<ObjectPlugin & { blacklabApi: BlackLabApi; frontendApi: FrontendApi }> => {
	const frontendApi = createFrontendApi(options.frontend);
	const blacklabApi = await createBlackLabApi({ ...options.blacklab });
	return {
		install(app) {
			provideFrontendApi(app, frontendApi);
			provideBlackLabApi(app, blacklabApi);
		},
		frontendApi,
		blacklabApi,
	};
};
