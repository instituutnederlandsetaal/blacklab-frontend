import type { ObjectPlugin } from 'vue';

import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import useInjectable from '@/shared/utils/useInjectable';

export type ApiPluginParts = {
	blacklabApi: BlackLabApi;
	frontendApi: FrontendApi;
};

export type ApiPlugin = ObjectPlugin & ApiPluginParts;

const [, provideFrontendApi, useFrontendApi] = useInjectable<FrontendApi>('frontendApi');
const [, provideBlackLabApi, useBlackLabApi] = useInjectable<BlackLabApi>('blacklabApi');

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
