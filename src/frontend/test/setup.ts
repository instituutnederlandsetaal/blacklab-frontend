import { config } from '@vue/test-utils';

import { createMockI18n } from '@/shared/i18n';

config.global.stubs ??= {};
config.global.stubs.debug = {
	template: '<span />',
};
config.global.stubs.Debug = {
	template: '<span />',
};

config.global.plugins ??= [];
config.global.plugins.push(createMockI18n());
