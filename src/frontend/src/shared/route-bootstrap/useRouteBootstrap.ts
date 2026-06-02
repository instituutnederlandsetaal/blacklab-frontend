import type { Ref } from 'vue';

import useInjectable from '@/shared/lib/vue/useInjectable';
type CustomScriptTiming = 'immediate' | 'after-page-bootstrap';

type UseRouteBootstrapReturn = {
	pageName: Ref<string>;
	pageBootstrapped: Ref<boolean>;
	pageUrlParsed: Ref<boolean>;
	markPageBootstrapped(): void;
	markPageUrlParsed(): void;
	pageCustomScriptTiming: Ref<CustomScriptTiming>;
};

const [_key, providePageBootstrap, useRouteBootstrap] = useInjectable<UseRouteBootstrapReturn>('pageBootstrap');

export { useRouteBootstrap, providePageBootstrap, type CustomScriptTiming, type UseRouteBootstrapReturn };
