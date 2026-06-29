import type { ObjectPlugin } from 'vue';

import type { BlackLabApi, BlackLabPaths, FrontendApi } from '@/shared/api/lib/api-types';
import useInjectable from '@/shared/utils/useInjectable';

export type ApiPluginParts = {
	blacklabApi: BlackLabApi;
	frontendApi: FrontendApi;
	blacklabPaths: BlackLabPaths;
};

export type ApiPlugin = ObjectPlugin & ApiPluginParts;

const [_frontendApiInjectionKey, provideFrontendApi, useFrontendApi] = useInjectable<FrontendApi>('frontendApi');
const [_blacklabApiInjectionKey, provideBlackLabApi, useBlackLabApi] = useInjectable<BlackLabApi>('blacklabApi');
const [_blacklabPathsInjectionKey, provideBlackLabPaths, useBlackLabPaths] = useInjectable<BlackLabPaths>('blacklabPaths');

export function createApiPlugin(parts: ApiPluginParts): ApiPlugin {
	return {
		install(app) {
			provideFrontendApi(app, parts.frontendApi);
			provideBlackLabApi(app, parts.blacklabApi);
			provideBlackLabPaths(app, parts.blacklabPaths);
		},
		...parts,
	};
}

export { provideBlackLabApi, provideBlackLabPaths, provideFrontendApi, useBlackLabApi, useBlackLabPaths, useFrontendApi };
