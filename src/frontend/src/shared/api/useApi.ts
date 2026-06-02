import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import useInjectable from '@/shared/lib/vue/useInjectable';

const [_frontendApiInjectionKey, provideFrontendApi, useFrontendApi] = useInjectable<FrontendApi>('frontendApi');
const [_blacklabApiInjectionKey, provideBlackLabApi, useBlackLabApi] = useInjectable<BlackLabApi>('blacklabApi');

export { provideBlackLabApi, provideFrontendApi, useBlackLabApi, useFrontendApi };
