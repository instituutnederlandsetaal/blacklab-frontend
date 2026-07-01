import type { User } from 'oidc-client-ts';
import type { MaybeRef } from 'vue';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { createFrontendApi } from '@/shared/api/frontendApi';
import { createApiPlugin, type ApiPlugin, useBlackLabApi, useBlackLabPaths, useFrontendApi } from '@/shared/api/plugin';

/**
 * Create the BlackLab and Frontend api instances, return a plugin that can be installed on the vue app
 * to enable useBlackLabApi() and useFrontendApi() injectables.
 */
const createApi = async (options: {
	frontend: { baseUrl: string; user: MaybeRef<User | null> };
	blacklab: { baseUrl: string; user: MaybeRef<User | null>; apiVersion?: string | null };
}): Promise<ApiPlugin> => {
	const frontendApi = createFrontendApi(options.frontend);

	// TODO allow forcing v4 api.
	// it should append an 'api=4' query param to all requests.
	// this because the v5 api changes, and we target the most recent version
	// so old in-dev v5 versions don't work with the frontend
	// in those causes you want to fall back to v4.
	const { api: blacklabApi, paths: blacklabPaths } = await createBlackLabApi({ ...options.blacklab });
	return createApiPlugin({
		frontendApi,
		blacklabApi,
		blacklabPaths,
	});
};

export type { ApiPlugin } from '@/shared/api/plugin';
export { createApi, useBlackLabApi, useFrontendApi, useBlackLabPaths };
