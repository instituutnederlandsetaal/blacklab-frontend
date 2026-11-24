import type { ObjectPlugin } from 'vue';

import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import createAppInjection from '@/shared/vue/injection';

export type ApiPluginParts = {
	blacklabApi: BlackLabApi;
	frontendApi: FrontendApi;
};

export type ApiPlugin = ObjectPlugin & ApiPluginParts;

const [, provideFrontendApi, useFrontendApi] = createAppInjection<FrontendApi>('frontendApi');
const [, provideBlackLabApi, useBlackLabApi] = createAppInjection<BlackLabApi>('blacklabApi');

export function createApiPlugin(parts: ApiPluginParts): ApiPlugin {
	return {
		install(app) {
			provideFrontendApi(app, parts.frontendApi);
			provideBlackLabApi(app, parts.blacklabApi);
		},
		...parts,
	};
}

export { useBlackLabApi, useFrontendApi };
