import '@/utils/jquery-globals';
import 'bootstrap';

import '@/global.scss';

import { createAppRuntime } from '@/app/create-app-runtime';

let startupPromise: Promise<void> | null = null;

export function startMainApp(): Promise<void> {
	if (startupPromise) {
		return startupPromise;
	}

	startupPromise = createAppRuntime().then(runtime => {
		runtime.mount();
	});

	return startupPromise;
}

if (document.readyState === 'loading') {
	document.addEventListener(
		'DOMContentLoaded',
		() => {
			void startMainApp();
		},
		{ once: true },
	);
} else {
	void startMainApp();
}
