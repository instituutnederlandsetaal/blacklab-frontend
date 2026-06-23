import type { User } from 'oidc-client-ts';
import type { MaybeRef, ObjectPlugin } from 'vue';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { createFrontendApi } from '@/shared/api/frontendApi';
import type { BlackLabApi, BlackLabPaths, FrontendApi } from '@/shared/api/lib/api-types';
import useInjectable from '@/shared/utils/useInjectable';

const [_frontendApiInjectionKey, provideFrontendApi, useFrontendApi] = useInjectable<FrontendApi>('frontendApi');
const [_blacklabApiInjectionKey, provideBlackLabApi, useBlackLabApi] = useInjectable<BlackLabApi>('blacklabApi');
const [_blacklabPathsInjectionKey, provideBlackLabPaths, useBlackLabPaths] = useInjectable<BlackLabPaths>('blacklabPaths');
/**
 * Create the BlackLab and Frontend api instances, return a plugin that can be installed on the vue app
 * to enable useBlackLabApi() and useFrontendApi() injectables.
 */
const createApi = async (options: {
	frontend: { baseUrl: string; user: MaybeRef<User | null> };
	blacklab: { baseUrl: string; user: MaybeRef<User | null>; apiVersion?: string | null };
}): Promise<ObjectPlugin & { blacklabApi: BlackLabApi; frontendApi: FrontendApi; blacklabPaths: BlackLabPaths }> => {
	const frontendApi = createFrontendApi(options.frontend);
	const { api: blacklabApi, paths: blacklabPaths } = await createBlackLabApi({ ...options.blacklab });
	return {
		install(app) {
			provideFrontendApi(app, frontendApi);
			provideBlackLabApi(app, blacklabApi);
			provideBlackLabPaths(app, blacklabPaths);
		},
		frontendApi,
		blacklabApi,
		blacklabPaths,
	};
};

export { createApi, useBlackLabApi, useFrontendApi, useBlackLabPaths };
