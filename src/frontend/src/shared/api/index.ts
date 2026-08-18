import type { User } from 'oidc-client-ts';
import type { MaybeRef } from 'vue';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { createFrontendApi } from '@/shared/api/frontendApi';
import { createApiPlugin, type ApiPlugin, useBlackLabApi, useFrontendApi } from '@/shared/api/plugin';

/**
 * Create the BlackLab and Frontend api instances, return a plugin that can be installed on the vue app
 * to enable useBlackLabApi() and useFrontendApi() injectables.
 */
const createApi = async (options: {
	frontend: { baseUrl: string; user: MaybeRef<User | null> };
	blacklab: { baseUrl: string; user: MaybeRef<User | null>; blacklabVersion?: string | null };
}): Promise<ApiPlugin> => {
	const frontendApi = createFrontendApi(options.frontend);

	const { api: blacklabApi, paths: blacklabPaths } = await createBlackLabApi({ ...options.blacklab });
	return createApiPlugin({
		frontendApi,
		blacklabApi,
		blacklabPaths,
	});
};
export { createApi, useBlackLabApi, useFrontendApi };
