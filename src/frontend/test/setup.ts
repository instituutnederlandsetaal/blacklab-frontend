import { config } from '@vue/test-utils';
import { beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';

import { createMockI18n } from '@test/mocks/i18n';

const DebugStub = defineComponent({
	render: () => h('span'),
});

config.global.stubs ??= {};
config.global.stubs.debug = DebugStub;
config.global.stubs.Debug = DebugStub;

config.global.plugins ??= [];
config.global.plugins.push(createMockI18n());

// Capture console output and only emit it when the test fails.

const loggers = ['log', 'debug', 'trace', 'info', 'warn', 'error'] as const;

type LogFunction = (...args: any) => void;
type LoggedInvocation = [LogFunction, any[]];

beforeEach(ctx => {
	const logs: LoggedInvocation[] = [];

	const original: Record<string, LogFunction> = {};
	for (const logger of loggers) {
		original[logger] = console[logger];
		console[logger] = (...args) => logs.push([original[logger], args]);
	}

	ctx.onTestFailed(() => {
		for (const [logger, data] of logs) {
			logger.call(console, ...data);
		}
	});

	return () => {
		for (const logger of loggers) {
			console[logger] = original[logger];
		}
	};
});
