import { config } from '@vue/test-utils';

import { createMockI18n } from '@/shared/i18n';

config.global.plugins ??= [];
config.global.plugins.push(createMockI18n());