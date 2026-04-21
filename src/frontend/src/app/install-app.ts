import AudioPlayer from '@/components/AudioPlayer.vue';
import DebugComponent from '@/components/Debug.vue';
import Filters from '@/components/filters';
import router from '@/navigation/router';
import * as i18n from '@/utils/i18n';

import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';
import HighchartsVue from 'highcharts-vue';
import type { App } from 'vue';

export function installApp(app: App) {
	app.use(Filters);
	app.use(FloatingVue);
	app.use(router);
	app.use(i18n);
	app.use(HighchartsVue);

	app.component('Debug', DebugComponent);
	app.component('AudioPlayer', AudioPlayer);
}