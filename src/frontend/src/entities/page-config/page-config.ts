import type { CFPageConfig } from '@/types/apptypes';

import useInjectable from '@/shared/lib/vue/useInjectable';

const [_currentConfigInjectionKey, provideCurrentConfig, useCurrentConfig] = useInjectable<CFPageConfig>('currentConfig');

export { provideCurrentConfig, useCurrentConfig };
