import { config } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { createMockI18n } from '@/shared/i18n';

const DebugStub = defineComponent({
	render: () => h('span'),
});

config.global.stubs ??= {};
config.global.stubs.debug = DebugStub;
config.global.stubs.Debug = DebugStub;

config.global.plugins ??= [];
config.global.plugins.push(createMockI18n());
